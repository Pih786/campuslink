// Loads a realistic, re-runnable demo season: the data behind the dashboard,
// analytics, at-risk list, candidate rankings, drives, offers, mock
// interviews and assessments.
//
//   npx tsx scripts/seed-demo.ts
//
// Everything it creates is recognisable and removable:
//   * every demo account uses the @demo.campuslink.dev domain (never emailed),
//   * two demo companies (Kaveri FinTech, Sahyadri Systems) own the new jobs
//     and drives,
//   * a second demo college ("Demo College of Engineering, Pune") shows
//     multi-college isolation.
// Re-running deletes those first and seeds again, so it always starts clean.
// Real accounts, the curated college list and the original seed jobs are
// never deleted (demo students' applications to those jobs are).
//
// Needs the AI service running for match scores (it falls back to a simple
// skill-overlap score otherwise, and auto-shortlisting skips fallback scores).
import { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { aiMatch } from "../src/utils/ai-client";
import { findOrCreateSkills } from "../src/modules/skills/skills.service";
import { recomputeCompletion } from "../src/modules/students/students.service";
import { checkEligibility, toEligibilityRequirements, toEligibilityStudent } from "../src/modules/eligibility/eligibility.service";
import { buildAiJob, buildAiStudent } from "../src/modules/matching/matching.service";
import { latestMockScore, recordMockInterview } from "../src/modules/mock-interviews/mock-interviews.service";
import { recordSkillEvidence } from "../src/modules/skill-evidence/skill-evidence.service";
import { runAutoShortlist } from "../src/modules/applications/auto-shortlist";
import { DEMO_EMAIL_DOMAIN } from "../src/modules/notifications/notifications.service";

const PASSWORD = "Demo@2026";
const MAIN_COLLEGE = "Demo Institute of Technology";
const SECOND_COLLEGE = "Demo College of Engineering, Pune";
const DEMO_COMPANIES = ["Kaveri FinTech", "Sahyadri Systems"];
const DAY = 86_400_000;
const LAKH = 100_000;

// Deterministic randomness, so every run produces the same season.
function rng(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260929);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const email = (local: string) => `${local}${DEMO_EMAIL_DOMAIN}`;
const daysFromNow = (d: number, hour = 10) => {
  const date = new Date(Date.now() + d * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
};

// Neon drops the odd connection (and cold-starts slowly), so transient
// connection errors are retried rather than failing a long seed.
const TRANSIENT = new Set(["P1001", "P1002", "P1017", "P2024", "P2028"]);
async function retry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as { errorCode?: string }).errorCode;
      const transient = (code && TRANSIENT.has(code)) || /Can't reach database|closed the connection/i.test(String(err));
      if (!transient || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

// Every round trip to the database is ~350 ms, so independent work runs a
// few at a time. Random values are drawn before this, keeping runs identical.
async function inParallel<T>(items: T[], fn: (item: T, index: number) => Promise<void>, limit = 6) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await retry(() => fn(items[i], i));
      }
    })
  );
}

// ------------------------------------------------------------------
// Students: archetypes decide core skills; a hidden ability (0-1) drives
// CGPA and skill levels, so eligibility and risk come out realistic.
// ------------------------------------------------------------------

type Archetype = { name: string; core: string[]; extras: string[]; branches: string[] };

const ARCHETYPES: Record<string, Archetype> = {
  web: { name: "web", core: ["React", "Node.js", "MongoDB", "SQL", "AWS"], extras: ["JavaScript", "Git", "TypeScript", "Communication"], branches: ["CSE", "IT"] },
  cloud: { name: "cloud", core: ["Linux", "Docker", "AWS", "Kubernetes"], extras: ["Python", "Git", "SQL"], branches: ["CSE", "IT"] },
  data: { name: "data", core: ["Python", "SQL", "Statistics", "Power BI"], extras: ["Excel", "Communication", "Machine Learning"], branches: ["CSE", "IT", "ECE"] },
  java: { name: "java", core: ["Java", "Spring Boot", "SQL", "Git"], extras: ["Data Structures & Algorithms", "Communication", "Docker"], branches: ["CSE", "IT"] },
  embedded: { name: "embedded", core: ["C++", "Linux", "Git"], extras: ["Python", "MATLAB", "Communication"], branches: ["ECE", "EEE"] },
  generalist: { name: "generalist", core: ["Communication", "Excel", "SQL"], extras: ["Python", "Power BI", "AutoCAD"], branches: ["ME", "EEE", "ECE"] },
};

// [name, archetype, ability, college]  -- "main" or "pune"
const STUDENTS: [string, keyof typeof ARCHETYPES, number, "main" | "pune"][] = [
  ["Ananya Iyer", "web", 0.93, "main"],
  ["Rohan Deshmukh", "web", 0.82, "main"],
  ["Priya Nair", "web", 0.74, "main"],
  ["Karthik Reddy", "web", 0.66, "main"],
  ["Sneha Kulkarni", "web", 0.55, "main"],
  ["Aditya Verma", "web", 0.41, "main"],
  ["Meera Pillai", "cloud", 0.88, "main"],
  ["Vikram Singh", "cloud", 0.71, "main"],
  ["Farhan Qureshi", "cloud", 0.6, "main"],
  ["Divya Menon", "cloud", 0.38, "main"],
  ["Ishaan Gupta", "data", 0.9, "main"],
  ["Pooja Sharma", "data", 0.78, "main"],
  ["Neha Joshi", "data", 0.64, "main"],
  ["Arjun Rao", "data", 0.5, "main"],
  ["Kavya Srinivasan", "java", 0.86, "main"],
  ["Rahul Mishra", "java", 0.79, "main"],
  ["Tanvi Patil", "java", 0.72, "main"],
  ["Siddharth Jain", "java", 0.63, "main"],
  ["Aisha Khan", "java", 0.52, "main"],
  ["Nikhil Bhat", "java", 0.35, "main"],
  ["Lakshmi Venkatesh", "embedded", 0.84, "main"],
  ["Harsh Vardhan", "embedded", 0.7, "main"],
  ["Shruti Agarwal", "embedded", 0.58, "main"],
  ["Manoj Kumar", "embedded", 0.44, "main"],
  ["Riya Sen", "generalist", 0.77, "main"],
  ["Abhishek Yadav", "generalist", 0.62, "main"],
  ["Nandini Hegde", "generalist", 0.49, "main"],
  ["Gaurav Chauhan", "generalist", 0.3, "main"],
  // Weak profiles: few skills, low completion -- the at-risk list.
  ["Varun Malhotra", "web", 0.22, "main"],
  ["Sakshi Tiwari", "data", 0.2, "main"],
  ["Deepak Chaudhary", "generalist", 0.18, "main"],
  ["Anjali Dubey", "embedded", 0.24, "main"],
  ["Mohit Saxena", "java", 0.16, "main"],
  ["Pallavi Ghosh", "cloud", 0.26, "main"],
  ["Yash Thakur", "web", 0.68, "main"],
  ["Bhavana Rao", "data", 0.57, "main"],
  // Second college (Pune): separate tenant, its own officer.
  ["Omkar Joshi", "web", 0.8, "pune"],
  ["Rutuja Pawar", "java", 0.75, "pune"],
  ["Sahil Shinde", "cloud", 0.65, "pune"],
  ["Gauri Deshpande", "data", 0.7, "pune"],
  ["Tejas More", "embedded", 0.6, "pune"],
  ["Aarti Kale", "generalist", 0.55, "pune"],
  ["Prathamesh Gaikwad", "java", 0.45, "pune"],
  ["Snehal Jadhav", "web", 0.35, "pune"],
  ["Akash Bhosale", "data", 0.25, "pune"],
  ["Mrunal Patankar", "embedded", 0.8, "pune"],
];

const PROJECTS: Record<string, { title: string; description: string; tech: string[] }[]> = {
  web: [
    { title: "Campus Canteen Ordering App", description: "Pre-order meals between classes. Cut queue times at the main canteen during lunch.", tech: ["React", "Node.js", "MongoDB"] },
    { title: "Alumni Connect Portal", description: "Search alumni by company and branch. Request referrals with a short note.", tech: ["React", "Node.js", "AWS"] },
  ],
  cloud: [
    { title: "Self-hosted CI Runner", description: "Dockerised build runners for the coding club. Autoscale on a small Kubernetes cluster.", tech: ["Docker", "Kubernetes", "Linux"] },
  ],
  data: [
    { title: "Placement Trends Dashboard", description: "Five years of branch-wise placement data. Built interactive Power BI views for the placement cell.", tech: ["Python", "Power BI", "SQL"] },
  ],
  java: [
    { title: "Library Management REST API", description: "Book issue and return with fines. Role-based access for librarians.", tech: ["Java", "Spring Boot", "SQL"] },
  ],
  embedded: [
    { title: "Smart Irrigation Controller", description: "Soil-moisture sensing on a microcontroller. Cut water use in a trial plot.", tech: ["C++", "Linux"] },
  ],
  generalist: [
    { title: "Hostel Budget Tracker", description: "Shared expense tracking for hostel rooms. Monthly summaries in Excel.", tech: ["Excel", "SQL"] },
  ],
};

async function reset() {
  const demoUsers = await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  const companies = await prisma.company.deleteMany({ where: { name: { in: DEMO_COMPANIES } } });
  const colleges = await prisma.college.deleteMany({ where: { name: SECOND_COLLEGE } });
  console.log(`Reset: removed ${demoUsers.count} demo users, ${companies.count} demo companies, ${colleges.count} demo colleges.`);
}

async function ensureCollege(name: string, city: string, state: string) {
  return prisma.college.upsert({
    where: { name },
    update: {},
    create: { name, city, state, category: "Demo", verified: true },
  });
}

async function ensureCompany(name: string, industry: string, location: string) {
  return prisma.company.upsert({ where: { name }, update: {}, create: { name, industry, location } });
}

async function main() {
  await retry(reset);
  const passwordHash = await hashPassword(PASSWORD);

  // ---------- Colleges and staff ----------
  const main = await ensureCollege(MAIN_COLLEGE, "Bengaluru", "Karnataka");
  const pune = await ensureCollege(SECOND_COLLEGE, "Pune", "Maharashtra");

  // The original seed officer runs the main college if present; otherwise a
  // demo officer does.
  let officer = await prisma.user.findFirst({
    where: { email: "officer@campuslink.dev", collegeStaff: { collegeId: main.id, status: "APPROVED" } },
  });
  if (!officer) {
    officer = await prisma.user.create({
      data: {
        email: email("officer"),
        passwordHash,
        fullName: "Priya Menon",
        role: "PLACEMENT_OFFICER",
        collegeStaff: { create: { collegeId: main.id, designation: "Training & Placement Officer", status: "APPROVED", reviewedAt: new Date() } },
      },
    });
  }
  const punOfficer = await prisma.user.create({
    data: {
      email: email("officer.pune"),
      passwordHash,
      fullName: "Sunil Kale",
      role: "PLACEMENT_OFFICER",
      collegeStaff: { create: { collegeId: pune.id, designation: "Placement Officer", status: "APPROVED", reviewedAt: new Date() } },
    },
  });
  const mentor = await prisma.user.create({
    data: {
      email: email("mentor"),
      passwordHash,
      fullName: "Dr. Kavitha Rao",
      role: "MENTOR",
      collegeStaff: { create: { collegeId: main.id, designation: "Associate Professor, CSE", status: "APPROVED", reviewedAt: new Date() } },
    },
  });

  // ---------- Companies, recruiters, jobs ----------
  const abc = await ensureCompany("ABC Technologies", "Software", "Bengaluru");
  const xyz = await ensureCompany("XYZ Analytics", "Analytics", "Hyderabad");
  const cloudnova = await ensureCompany("CloudNova", "Cloud", "Pune");
  const kaveri = await prisma.company.create({ data: { name: "Kaveri FinTech", industry: "FinTech", location: "Bengaluru" } });
  const sahyadri = await prisma.company.create({ data: { name: "Sahyadri Systems", industry: "Embedded systems", location: "Pune" } });

  const recruiters: Record<string, string> = {};
  for (const [key, company, name, title] of [
    ["recruiter", kaveri, "Anita Krishnan", "Talent Acquisition Lead"],
    ["recruiter.sahyadri", sahyadri, "Rajesh Patil", "HR Manager"],
    ["recruiter.abc", abc, "Neha Bansal", "Campus Recruiter"],
    ["recruiter.xyz", xyz, "Imran Sheikh", "Hiring Manager"],
    ["recruiter.cloudnova", cloudnova, "Deepa Iyer", "Engineering Recruiter"],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        email: email(key),
        passwordHash,
        fullName: name,
        role: "RECRUITER",
        recruiter: { create: { companyId: company.id, designation: title } },
      },
    });
    recruiters[company.id] = user.id;
  }

  const skillNames = [
    ...new Set([
      ...Object.values(ARCHETYPES).flatMap((a) => [...a.core, ...a.extras]),
      "Aptitude",
      "Excel",
    ]),
  ];
  const skills = new Map((await findOrCreateSkills(skillNames)).map((s) => [s.name.toLowerCase(), s.id]));
  const skillId = (n: string) => {
    const id = skills.get(n.toLowerCase());
    if (!id) throw new Error(`skill ${n} missing`);
    return id;
  };

  const req = (name: string, level: number, mandatory = true): Prisma.JobRequirementCreateWithoutJobInput => ({
    requirementType: "SKILL",
    skill: { connect: { id: skillId(name) } },
    minimumProficiency: level,
    mandatory,
  });
  const rule = (type: "CGPA" | "BRANCH" | "BACKLOG" | "MOCK_INTERVIEW", value: unknown, mandatory = true) => ({
    requirementType: type,
    value: value as Prisma.InputJsonValue,
    mandatory,
  });

  const kaveriBackend = await prisma.job.create({
    data: {
      companyId: kaveri.id,
      title: "Backend Engineer",
      description: "Build payment and ledger services in Java and Spring Boot for a fast-growing UPI platform.",
      location: "Bengaluru",
      employmentType: "FULL_TIME",
      salaryMin: 8 * LAKH,
      salaryMax: 12 * LAKH,
      status: "PUBLISHED",
      applicationDeadline: daysFromNow(21),
      // Demonstrates auto-shortlisting.
      autoShortlist: true,
      autoShortlistMinScore: 70,
      requirements: {
        create: [
          rule("CGPA", 7),
          rule("BRANCH", ["CSE", "IT"]),
          rule("BACKLOG", 0),
          req("Java", 3),
          req("Spring Boot", 3),
          req("SQL", 3),
          req("Git", 2, false),
        ],
      },
    },
  });
  const kaveriIntern = await prisma.job.create({
    data: {
      companyId: kaveri.id,
      title: "Data Analyst Intern",
      description: "Six-month internship analysing transaction data, with a pre-placement offer for strong performers.",
      location: "Bengaluru",
      employmentType: "INTERNSHIP",
      salaryMin: 3.6 * LAKH,
      salaryMax: 4.2 * LAKH,
      status: "PUBLISHED",
      applicationDeadline: daysFromNow(14),
      requirements: { create: [rule("CGPA", 6.5), rule("BACKLOG", 0), req("Python", 3), req("SQL", 3), req("Excel", 2, false)] },
    },
  });
  const sahyadriEmbedded = await prisma.job.create({
    data: {
      companyId: sahyadri.id,
      title: "Embedded Software Engineer",
      description: "Firmware for industrial controllers. Candidates face a technical and an HR round on campus.",
      location: "Pune",
      employmentType: "FULL_TIME",
      salaryMin: 6 * LAKH,
      salaryMax: 9 * LAKH,
      status: "PUBLISHED",
      applicationDeadline: daysFromNow(18),
      requirements: {
        create: [
          rule("CGPA", 6.5),
          rule("BRANCH", ["ECE", "EEE", "CSE"]),
          rule("BACKLOG", 0),
          req("C++", 3),
          req("Linux", 3),
          req("Git", 2, false),
          // Demonstrates the mock-interview benchmark (mandatory).
          rule("MOCK_INTERVIEW", 6),
        ],
      },
    },
  });
  const sahyadriGet = await prisma.job.create({
    data: {
      companyId: sahyadri.id,
      title: "Graduate Engineer Trainee",
      description: "A rotational trainee programme across production, quality and customer support.",
      location: "Pune",
      employmentType: "FULL_TIME",
      salaryMin: 4.5 * LAKH,
      salaryMax: 6 * LAKH,
      status: "PUBLISHED",
      applicationDeadline: daysFromNow(25),
      // Open only to the main demo college.
      visibility: "SELECTED_COLLEGES",
      targetColleges: { create: [{ collegeId: main.id }] },
      requirements: {
        create: [rule("CGPA", 6), req("Communication", 3), req("Excel", 2), req("SQL", 2, false), rule("MOCK_INTERVIEW", 6, false)],
      },
    },
  });
  console.log("Companies, recruiters and 4 new jobs created.");

  // ---------- Students ----------
  type Seeded = { id: string; userId: string; ability: number; archetype: string; college: "main" | "pune"; name: string };
  const plans = STUDENTS.map(([name, archetypeKey, ability, college], i) => {
    const a = ARCHETYPES[archetypeKey];
    const weak = ability < 0.3;
    const branch = pick(a.branches);
    const cgpa = Math.round(clamp(6 + 3.6 * ability + (rand() - 0.5) * 0.6, 5.2, 9.8) * 100) / 100;
    const level = (bonus = 0) => clamp(Math.round(1.2 + 3.8 * ability + (rand() - 0.5) * 1.2 + bonus), 1, 5);
    const core = weak ? a.core.slice(0, 2) : a.core;
    const extras = weak ? [] : i === 0 ? [...a.extras, "Python", "Excel"] : a.extras.filter(() => rand() < 0.55);
    const skillRows = [...new Set([...core, ...extras])].map((s) => ({ skillId: skillId(s), proficiency: level(core.includes(s) ? 0 : -1) }));
    const projects = weak ? [] : (PROJECTS[archetypeKey] ?? []).filter((_, j) => j === 0 || rand() < 0.5);
    const local = name.toLowerCase().replace(/[^a-z]+/g, ".");
    const data: Prisma.UserCreateInput = {
      email: i === 0 ? email("student") : email(local),
      passwordHash,
      fullName: name,
      role: "STUDENT",
      student: {
        create: {
          college: { connect: { id: college === "main" ? main.id : pune.id } },
          studentCode: `DEMO${String(i + 1).padStart(3, "0")}`,
          department: branch,
          graduationYear: rand() < 0.8 ? 2026 : 2027,
          cgpa,
          backlogCount: ability < 0.35 && rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0,
          phone: weak ? null : `+91 9${Math.floor(100000000 + rand() * 899999999)}`,
          skills: { create: skillRows.map((s) => ({ skill: { connect: { id: s.skillId } }, proficiency: s.proficiency, source: "SELF_DECLARED" as const })) },
          projects: { create: projects.map((p) => ({ title: p.title, description: p.description, techStack: p.tech })) },
        },
      },
    };
    return { data, ability, archetype: archetypeKey as string, college, name };
  });
  const createdStudents: Seeded[] = new Array(plans.length);
  await inParallel(plans, async (p, i) => {
    // A retry after a dropped connection may find the row already written.
    const user =
      (await prisma.user.findUnique({ where: { email: p.data.email }, include: { student: true } })) ??
      (await prisma.user.create({ data: p.data, include: { student: true } }));
    await recomputeCompletion(user.student!.id);
    createdStudents[i] = { id: user.student!.id, userId: user.id, ability: p.ability, archetype: p.archetype, college: p.college, name: p.name };
  });
  console.log(`${createdStudents.length} students created.`);

  // ---------- Assessments: aptitude (MCQ) and written communication ----------
  let aptitude = await prisma.assessment.findFirst({ where: { title: "Quantitative Aptitude" } });
  if (!aptitude) {
    const q = (questionText: string, options: string[], correctOptionIndex: number) => ({ questionText, options, correctOptionIndex, points: 1 });
    aptitude = await prisma.assessment.create({
      data: {
        title: "Quantitative Aptitude",
        description: "Percentages, ratios, time and work: the aptitude section most campus tests open with.",
        durationMinutes: 15,
        passScore: 60,
        skillId: skillId("Aptitude"),
        questions: {
          create: [
            q("A price rises from ₹400 to ₹500. What is the percentage increase?", ["20%", "25%", "15%", "30%"], 1),
            q("If 6 people finish a task in 10 days, how many days do 4 people take?", ["12", "15", "16", "20"], 1),
            q("The ratio of boys to girls is 3:2 in a class of 40. How many girls are there?", ["12", "16", "18", "24"], 1),
            q("A train covers 180 km in 3 hours. What is its speed in m/s?", ["15", "16.67", "18", "20"], 1),
            q("Simple interest on ₹5,000 at 8% a year for 3 years is:", ["₹1,000", "₹1,200", "₹1,400", "₹1,500"], 1),
          ],
        },
      },
    });
  }
  let written = await prisma.assessment.findFirst({ where: { title: "Professional Communication (Written)" } });
  if (!written) {
    written = await prisma.assessment.create({
      data: {
        title: "Professional Communication (Written)",
        description: "Three short written answers, scored for clarity, structure, grammar and relevance.",
        type: "WRITTEN",
        durationMinutes: 30,
        passScore: 60,
        skillId: skillId("Communication"),
        questions: {
          create: [
            {
              questionText: "Introduce yourself to an interviewer in under 120 words: your background, one strength with evidence, and the role you want.",
              rubric: "Clear opening; relevant academic background; one specific strength backed by an example; the target role; concise close.",
              maxWords: 120,
              points: 10,
            },
            {
              questionText: "Describe a time you worked in a team to meet a tight deadline. What was your role and what did you learn?",
              rubric: "Situation and deadline; the student's own role; concrete actions; how the team coordinated; the outcome; a genuine lesson.",
              maxWords: 180,
              points: 10,
            },
            {
              questionText: "Write a short, polite email to a recruiter asking to move your interview slot because it clashes with an exam.",
              rubric: "Appropriate subject and greeting; states the clash and the exam; proposes alternative slots; polite and concise; proper sign-off.",
              maxWords: 150,
              points: 10,
            },
          ],
        },
      },
    });
  }

  // Aptitude results for most students: stronger students score higher.
  const aptitudeId = aptitude.id;
  const aptitudePlans = createdStudents
    .filter(() => rand() < 0.75)
    .map((s) => ({ s, correct: clamp(Math.round(1 + 4 * s.ability + (rand() - 0.5) * 1.5), 0, 5) }));
  await inParallel(aptitudePlans, async ({ s, correct }) => {
    const passed = correct / 5 >= 0.6;
    const attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId: aptitudeId,
        studentId: s.id,
        answers: {},
        score: correct,
        totalPoints: 5,
        passed,
        startedAt: new Date(Date.now() - 20 * DAY),
        submittedAt: new Date(Date.now() - 20 * DAY + 12 * 60_000),
      },
    });
    if (passed) {
      await recordSkillEvidence({ studentId: s.id, skillId: skillId("Aptitude"), sourceType: "ASSESSMENT", sourceId: attempt.id, score: correct * 20 });
    }
  });
  console.log("Aptitude results and the written communication assessment are in place.");

  // ---------- Mock interviews (feed eligibility, readiness and risk) ----------
  const focusByArchetype: Record<string, string> = {
    web: "React",
    cloud: "Docker",
    data: "SQL",
    java: "Java",
    embedded: "C++",
    generalist: "Excel",
  };
  const mockPlans = createdStudents.flatMap((s) => {
    if (s.ability < 0.3 && rand() < 0.5) return [];
    const rounds = s.ability > 0.6 && rand() < 0.5 ? 2 : 1;
    const plan = Array.from({ length: rounds }, (_, r) => {
      // Later rounds are a little better: practice helps.
      const base = 2 + 7.5 * s.ability + r * 0.6;
      const sub = () => clamp(Math.round(base + (rand() - 0.5) * 2.4), 1, 10);
      const byMentor = s.college === "main" && r > 0;
      return {
        interviewerId: s.college === "pune" ? punOfficer.id : byMentor ? mentor.id : officer.id,
        role: (byMentor ? "MENTOR" : "PLACEMENT_OFFICER") as "MENTOR" | "PLACEMENT_OFFICER",
        input: {
          studentId: s.id,
          conductedAt: new Date(Date.now() - (30 - r * 12) * DAY).toISOString(),
          focus: `Technical · ${focusByArchetype[s.archetype]}`,
          skillName: focusByArchetype[s.archetype],
          technical: sub(),
          communication: sub(),
          problemSolving: sub(),
          confidence: sub(),
          feedback:
            base >= 7
              ? "Structured answers and clear reasoning. Keep examples short and quantify results."
              : base >= 5
                ? "Good fundamentals. Think aloud more, and practise explaining your projects end to end."
                : "Answers were hesitant. Revise core concepts and do two more practice rounds before drives.",
        },
      };
    });
    return [plan];
  });
  await inParallel(mockPlans, async (plan) => {
    const done = await prisma.mockInterview.count({ where: { studentId: plan[0].input.studentId } });
    for (const m of plan.slice(done)) await recordMockInterview(m.interviewerId, m.role, m.input);
  });
  console.log("Mock interviews recorded.");

  // ---------- Applications, scored and moved through the pipeline ----------
  const jobs = await prisma.job.findMany({
    where: { status: "PUBLISHED", company: { name: { in: ["ABC Technologies", "XYZ Analytics", "CloudNova", ...DEMO_COMPANIES] } } },
    include: { requirements: { include: { skill: true } }, company: true, targetColleges: true },
  });
  const students = await prisma.student.findMany({
    where: { id: { in: createdStudents.map((s) => s.id) } },
    include: { skills: { include: { skill: true } }, projects: true, certifications: true, user: true, mockInterviews: { orderBy: { conductedAt: "desc" }, take: 1, select: { overallScore: true } } },
  });

  const OFFER_STAGES: ApplicationStatus[] = ["OFFERED", "ACCEPTED", "JOINED"];
  const OFFER_ROTATION: ApplicationStatus[] = ["ACCEPTED", "JOINED", "OFFERED", "ACCEPTED", "OFFERED", "JOINED", "ACCEPTED"];
  // One offer per student: someone already holding one only takes earlier
  // stages elsewhere, and the next candidate takes the offer slot.
  const hasOffer = new Set<string>();
  const demoStudentId = createdStudents[0].id;
  let demoStudentOffered = false;
  let jobIndex = 0;
  let applications = 0;
  let interviewSlot = 0;
  for (const job of jobs) {
    const requirements = toEligibilityRequirements(job.requirements);
    const aiJob = buildAiJob(job);
    const visible = (s: (typeof students)[number]) =>
      job.visibility === "GLOBAL" || job.targetColleges.some((t) => t.collegeId === s.collegeId);
    const pool = students.filter(
      (s) =>
        visible(s) &&
        (rand() < 0.8 || s.id === demoStudentId) &&
        checkEligibility(
          toEligibilityStudent({ ...s, mockInterviewScore: latestMockScore(s), skills: s.skills.map((k) => ({ skillId: k.skillId, proficiency: k.proficiency })) }),
          requirements
        ).eligible
    );

    const scored: { s: (typeof pool)[number]; match: Awaited<ReturnType<typeof aiMatch>> }[] = [];
    await inParallel(pool, async (s) => {
      scored.push({ s, match: await aiMatch(buildAiStudent(s), aiJob) });
    });
    scored.sort((a, b) => b.match.overall - a.match.overall || a.s.id.localeCompare(b.s.id));

    // Stages scale with the pool: one or two offers, then selected,
    // interviewing and shortlisted; the weakest match of a big pool is
    // rejected and the rest are still at "applied".
    const n = scored.length;
    const offers = n >= 7 ? 2 : n >= 3 ? 1 : 0;
    const queue: ApplicationStatus[] = job.autoShortlist
      ? [] // left for the auto-shortlist rule to act on
      : [
          ...Array.from({ length: offers }, (_, k) => OFFER_ROTATION[(jobIndex + k) % OFFER_ROTATION.length]),
          ...(n >= 4 ? (["SELECTED"] as ApplicationStatus[]) : []),
          ...(["INTERVIEW", "INTERVIEW", "SHORTLISTED"] as ApplicationStatus[]).slice(0, Math.max(0, n - offers - 1)),
        ];
    jobIndex++;
    const takeStage = (allowed: (st: ApplicationStatus) => boolean): ApplicationStatus | null => {
      const i = queue.findIndex(allowed);
      return i < 0 ? null : queue.splice(i, 1)[0];
    };

    // Decide every status (and draw every random value) before writing.
    const planned = scored.map(({ s, match }, rank) => {
      let status: ApplicationStatus = "ELIGIBLE";
      if (s.id === demoStudentId && !job.autoShortlist) {
        // The headline student: one offer awaiting their reply (documents
        // due), interviews and shortlists elsewhere.
        status = demoStudentOffered ? (takeStage((st) => st === "INTERVIEW") ?? "SHORTLISTED") : "OFFERED";
        if (status === "OFFERED") {
          takeStage((st) => OFFER_STAGES.includes(st));
          demoStudentOffered = true;
        }
      } else if (n >= 6 && rank === n - 1 && !job.autoShortlist) {
        status = "REJECTED";
      } else {
        status = takeStage((st) => !hasOffer.has(s.id) || !["SELECTED", ...OFFER_STAGES].includes(st)) ?? "ELIGIBLE";
      }
      if (OFFER_STAGES.includes(status)) hasOffer.add(s.id);
      const scheduled = status === "INTERVIEW" ? interviewSlot++ : -1;
      return {
        s,
        match,
        status,
        scheduled,
        appliedAt: new Date(Date.now() - (12 + Math.floor(rand() * 10)) * DAY),
        pastScore: status === "REJECTED" ? 3 + Math.round(rand() * 2) : 7 + Math.round(rand() * 2),
      };
    });

    await inParallel(planned, async ({ s, match, status, scheduled, appliedAt, pastScore }) => {
      // A retry after a dropped connection may find it already written.
      if (await prisma.application.findFirst({ where: { studentId: s.id, jobId: job.id }, select: { id: true } })) return;
      const application = await prisma.application.create({
        data: {
          studentId: s.id,
          jobId: job.id,
          status,
          appliedAt,
          matchScore: match.aiUnavailable ? null : match.overall,
          matchBreakdown: match.aiUnavailable ? Prisma.JsonNull : (match as unknown as Prisma.InputJsonValue),
        },
      });
      applications++;

      if (status === "INTERVIEW") {
        await prisma.interview.create({
          data: {
            applicationId: application.id,
            round: "Technical",
            panel: scheduled % 2 === 0 ? "Panel A" : "Panel B",
            scheduledAt: daysFromNow(3 + Math.floor(scheduled / 4), 10 + (scheduled % 4)),
            duration: 45,
            venue: scheduled % 2 === 0 ? "Placement Cell, Room 2" : "Placement Cell, Room 3",
            status: "SCHEDULED",
          },
        });
      } else if (status === "REJECTED" || status === "SELECTED" || OFFER_STAGES.includes(status)) {
        await prisma.interview.create({
          data: {
            applicationId: application.id,
            round: "Technical",
            panel: "Panel A",
            scheduledAt: new Date(appliedAt.getTime() + 5 * DAY),
            duration: 45,
            venue: "Placement Cell, Room 2",
            status: "COMPLETED",
            score: pastScore,
            feedback: status === "REJECTED" ? "Struggled with core concepts in the technical round." : "Strong fundamentals and clear communication.",
          },
        });
      }

      if (OFFER_STAGES.includes(status)) {
        const offerDate = new Date(Date.now() - (status === "OFFERED" ? 2 : 9) * DAY);
        const accepted = status !== "OFFERED";
        const isIntern = job.employmentType === "INTERNSHIP";
        const due = new Date(offerDate.getTime() + 7 * DAY);
        await prisma.offer.create({
          data: {
            studentId: s.id,
            companyId: job.companyId,
            jobId: job.id,
            ctc: Math.round(((job.salaryMin ?? 5 * LAKH) + (job.salaryMax ?? 8 * LAKH)) / 2 / 10_000) * 10_000,
            role: job.title,
            location: job.location,
            offerDate,
            joiningDate: daysFromNow(isIntern ? 30 : 280),
            bondRequired: job.companyId === sahyadri.id,
            offerType: isIntern ? "INTERNSHIP" : "FULL_TIME",
            conversionStatus: isIntern ? "PENDING" : null,
            acceptanceStatus: accepted ? "ACCEPTED" : "PENDING",
            respondedAt: accepted ? new Date(offerDate.getTime() + 2 * DAY) : null,
            joiningStatus: status === "JOINED" ? "JOINED" : "PENDING",
            documents: {
              create: [
                { type: "OFFER_LETTER", dueDate: null },
                { type: "SIGNED_ACCEPTANCE", dueDate: due },
                { type: "ID_PROOF", dueDate: due },
                { type: "MARKSHEETS", dueDate: due },
                ...(job.companyId === sahyadri.id ? [{ type: "BOND_AGREEMENT" as const, dueDate: due }] : []),
              ],
            },
          },
        });
      }
    });
  }
  console.log(`${applications} applications created, with interviews and offers.`);

  // ---------- Drives: all upcoming, no clashes ----------
  await prisma.drive.createMany({
    data: [
      { companyId: kaveri.id, jobId: kaveriBackend.id, collegeId: main.id, date: daysFromNow(6, 10), durationMinutes: 240, venue: "Main Auditorium", capacity: 180, applicationDeadline: daysFromNow(4) },
      { companyId: sahyadri.id, jobId: sahyadriEmbedded.id, collegeId: main.id, date: daysFromNow(7, 10), durationMinutes: 300, venue: "Seminar Hall 2", capacity: 80, applicationDeadline: daysFromNow(5) },
      { companyId: sahyadri.id, jobId: sahyadriGet.id, collegeId: main.id, date: daysFromNow(9, 14), durationMinutes: 180, venue: "Main Auditorium", capacity: 150, applicationDeadline: daysFromNow(7) },
      { companyId: kaveri.id, jobId: kaveriIntern.id, collegeId: main.id, date: daysFromNow(12, 10), durationMinutes: 180, venue: "Seminar Hall 1", capacity: 60, applicationDeadline: daysFromNow(10) },
      { companyId: kaveri.id, jobId: kaveriBackend.id, collegeId: pune.id, date: daysFromNow(8, 11), durationMinutes: 240, venue: "Central Library Hall", capacity: 120, applicationDeadline: daysFromNow(6) },
    ],
  });
  console.log("5 upcoming drives scheduled.");

  // ---------- Mentoring: at-risk students assigned and escalated ----------
  const atRisk = createdStudents.filter((s) => s.college === "main" && s.ability < 0.3);
  for (const s of atRisk) {
    await prisma.mentorAssignment.create({ data: { studentId: s.id, mentorId: mentor.id, assignedById: officer.id } });
  }
  for (const [i, s] of atRisk.slice(0, 2).entries()) {
    await prisma.escalation.create({
      data: {
        studentId: s.id,
        mentorId: mentor.id,
        raisedById: officer.id,
        reason: i === 0 ? "No applications yet and not eligible for any open role. Needs a skills plan." : "Profile incomplete and missed practice rounds.",
        riskScore: i === 0 ? 65 : 45,
        status: i === 0 ? "OPEN" : "IN_PROGRESS",
      },
    });
  }
  await prisma.mentorNote.create({
    data: {
      studentId: atRisk[1].id,
      authorId: mentor.id,
      body: "Met on Monday. Agreed to finish the SQL lab and apply to two trainee roles this week.",
      followUpAt: daysFromNow(3),
    },
  });

  // ---------- Learning progress for a few students ----------
  const resources = await prisma.learningResource.findMany({ where: { collegeId: null }, take: 12, select: { id: true } });
  await retry(() =>
    prisma.learningProgress.createMany({
      data: createdStudents.slice(0, 10).flatMap((s) =>
        resources
          .filter(() => rand() < 0.3)
          .map((r) => ({ studentId: s.id, resourceId: r.id, status: pick(["SAVED", "IN_PROGRESS", "COMPLETED"] as const) }))
      ),
      skipDuplicates: true,
    })
  );

  // ---------- Let the auto-shortlist rule act on the Kaveri job ----------
  const auto = await runAutoShortlist(kaveriBackend.id);
  console.log(`Auto-shortlist: ${auto.shortlisted} applicant(s) shortlisted for Kaveri FinTech, Backend Engineer.`);

  const first = await prisma.student.findFirst({
    where: { user: { email: email("student") } },
    include: { applications: { include: { job: { select: { title: true } } } } },
  });
  console.log(`
Demo season ready. Every demo password is ${PASSWORD}
  Student            ${email("student")}  (${first?.applications.map((a) => `${a.job.title}: ${a.status}`).join(", ") || "no applications"})
  Recruiter          ${email("recruiter")}  (Kaveri FinTech: auto-shortlist on)
  Recruiters         ${email("recruiter.sahyadri")}, ${email("recruiter.abc")}, ${email("recruiter.xyz")}, ${email("recruiter.cloudnova")}
  Mentor             ${email("mentor")}
  Placement office   ${officer.email}${officer.email === "officer@campuslink.dev" ? " (existing password)" : ""}
  Pune officer       ${email("officer.pune")}
Other demo students use firstname.lastname${DEMO_EMAIL_DOMAIN}, e.g. ${email("rohan.deshmukh")}.
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
