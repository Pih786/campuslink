import { prisma } from "../../config/prisma";
import { notFound } from "../../utils/errors";
import {
  checkEligibility,
  toEligibilityRequirements,
  toEligibilityStudent,
} from "../eligibility/eligibility.service";
import { notify } from "../notifications/notifications.service";
import { jobsVisibleToCollege } from "../../utils/tenancy";
import { latestMockInclude, latestMockScore } from "../mock-interviews/mock-interviews.service";
import { assessUnplacedRisk, bandFor, ReadinessBand, roleReadinessScore } from "./risk";

const DAY_MS = 24 * 60 * 60000;
const ACTIVE_RECRUITER_DAYS = 30;
const PLACEMENT_READY_SCORE = 60;
const SHORTLISTED_OR_BEYOND = ["SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "OFFERED", "ACCEPTED", "JOINED"];

function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function lpa(ctc: number) {
  return Math.round((ctc / 100000) * 10) / 10;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ctcStats(ctcs: number[]) {
  if (ctcs.length === 0) return { offers: 0, avgLpa: null, medianLpa: null, highestLpa: null };
  return {
    offers: ctcs.length,
    avgLpa: lpa(ctcs.reduce((a, b) => a + b, 0) / ctcs.length),
    medianLpa: lpa(median(ctcs) as number),
    highestLpa: lpa(Math.max(...ctcs)),
  };
}

// collegeId null = platform-wide (admins); otherwise one college's data only.
async function loadData(collegeId: string | null) {
  const studentWhere = collegeId ? { collegeId } : {};
  const [students, jobs, companies, offers, drives] = await Promise.all([
    prisma.student.findMany({
      where: studentWhere,
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        skills: { include: { skill: true } },
        applications: { include: { interviews: { select: { status: true } } } },
        offers: { select: { acceptanceStatus: true, joiningStatus: true } },
        ...latestMockInclude,
      },
    }),
    prisma.job.findMany({
      where: collegeId ? jobsVisibleToCollege(collegeId) : {},
      include: { requirements: { include: { skill: true } }, company: true },
    }),
    prisma.company.findMany({
      where: collegeId
        ? { OR: [{ jobs: { some: jobsVisibleToCollege(collegeId) } }, { drives: { some: { collegeId } } }] }
        : {},
      include: { drives: { where: collegeId ? { collegeId } : {} } },
    }),
    prisma.offer.findMany({
      where: collegeId ? { student: { collegeId } } : {},
      include: { company: true, documents: true },
    }),
    prisma.drive.findMany({ where: collegeId ? { collegeId } : {} }),
  ]);
  return { students, jobs, companies, offers, drives };
}

const CACHE_MS = 30000;
const cache = new Map<string, { at: number; value: Awaited<ReturnType<typeof computePlacementInsights>> }>();

// Near-real-time is enough for a dashboard; cached per college so one
// campus never sees another's numbers.
export async function getPlacementInsights(collegeId: string | null, { fresh = false } = {}) {
  const key = collegeId ?? "__platform__";
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await computePlacementInsights(collegeId);
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function computePlacementInsights(collegeId: string | null) {
  const now = new Date();
  const { students, jobs, companies, offers, drives } = await loadData(collegeId);
  const openJobs = jobs.filter((j) => j.status === "PUBLISHED");

  // Roles = open jobs grouped by title, scored against their skill requirements.
  const roles = new Map<string, { title: string; skillIds: Set<string> }>();
  for (const job of openJobs) {
    const key = job.title.trim().toLowerCase();
    const role = roles.get(key) ?? { title: job.title.trim(), skillIds: new Set<string>() };
    for (const req of job.requirements) if (req.requirementType === "SKILL" && req.skillId) role.skillIds.add(req.skillId);
    roles.set(key, role);
  }
  const scoredRoles = [...roles.values()].filter((r) => r.skillIds.size > 0);

  const readinessByRole = scoredRoles.map((r) => ({
    role: r.title,
    counts: { "Not Ready": 0, Developing: 0, Ready: 0, "Highly Employable": 0 } as Record<ReadinessBand, number>,
  }));

  const jobRequirements = new Map(openJobs.map((j) => [j.id, toEligibilityRequirements(j.requirements)]));

  let placementReady = 0;
  let placed = 0;
  const atRisk = [];
  const branchStats = new Map<string, { students: number; applied: number; shortlisted: number; offers: number; placed: number }>();
  const skillStats = new Map<string, { skill: string; students: number; placed: number }>();

  for (const s of students) {
    const isPlaced = s.offers.some((o) => o.acceptanceStatus === "ACCEPTED");
    if (isPlaced) placed++;

    const proficiency = new Map(s.skills.map((k) => [k.skillId, k.proficiency]));
    let bestReadiness: number | null = null;
    let bestRole: string | null = null;
    scoredRoles.forEach((role, i) => {
      const score = roleReadinessScore(proficiency, [...role.skillIds]);
      readinessByRole[i].counts[bandFor(score)]++;
      if (bestReadiness == null || score > bestReadiness) {
        bestReadiness = score;
        bestRole = role.title;
      }
    });
    if (bestReadiness != null && bestReadiness >= PLACEMENT_READY_SCORE) placementReady++;

    const branch = s.department || "Not set";
    const b = branchStats.get(branch) ?? { students: 0, applied: 0, shortlisted: 0, offers: 0, placed: 0 };
    b.students++;
    if (s.applications.length) b.applied++;
    if (s.applications.some((a) => SHORTLISTED_OR_BEYOND.includes(a.status))) b.shortlisted++;
    if (s.offers.length) b.offers++;
    if (isPlaced) b.placed++;
    branchStats.set(branch, b);

    for (const k of s.skills) {
      const entry = skillStats.get(k.skillId) ?? { skill: k.skill.name, students: 0, placed: 0 };
      entry.students++;
      if (isPlaced) entry.placed++;
      skillStats.set(k.skillId, entry);
    }

    if (!isPlaced) {
      const eligibilityStudent = toEligibilityStudent({
        cgpa: s.cgpa,
        department: s.department,
        backlogCount: s.backlogCount,
        mockInterviewScore: latestMockScore(s),
        skills: s.skills.map((k) => ({ skillId: k.skillId, proficiency: k.proficiency })),
      });
      const eligibleOpenRoles = openJobs.filter(
        (j) => checkEligibility(eligibilityStudent, jobRequirements.get(j.id) ?? []).eligible
      ).length;
      const risk = assessUnplacedRisk({
        applications: s.applications.length,
        rejections: s.applications.filter((a) => a.status === "REJECTED").length,
        noShows: s.applications.flatMap((a) => a.interviews).filter((iv) => iv.status === "NO_SHOW").length,
        eligibleOpenRoles,
        openRoles: openJobs.length,
        bestReadiness,
        backlogCount: s.backlogCount,
        profileCompletion: s.profileCompletion,
        verifiedSkills: s.skills.filter((k) => k.verified).length,
        mockInterviewScore: latestMockScore(s),
      });
      if (risk.level !== "Low") {
        atRisk.push({
          studentId: s.id,
          name: s.user.fullName,
          email: s.user.email,
          branch: s.department,
          cgpa: s.cgpa,
          bestRole,
          bestReadiness,
          eligibleOpenRoles,
          ...risk,
        });
      }
    }
  }

  atRisk.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Skills demanded by open roles, with the placement rate of students who hold them.
  const demand = new Map<string, number>();
  for (const role of scoredRoles) for (const id of role.skillIds) demand.set(id, (demand.get(id) ?? 0) + 1);
  const skills = [...demand.entries()]
    .map(([skillId, roleCount]) => {
      const stat = skillStats.get(skillId);
      const name =
        stat?.skill ??
        openJobs.flatMap((j) => j.requirements).find((r) => r.skillId === skillId)?.skill?.name ??
        "Skill";
      return {
        skill: name,
        demandRoles: roleCount,
        students: stat?.students ?? 0,
        placed: stat?.placed ?? 0,
        placementRatePct: pct(stat?.placed ?? 0, stat?.students ?? 0),
      };
    })
    .sort((a, b) => b.demandRoles - a.demandRoles || b.students - a.students)
    .slice(0, 12);

  const branches = [...branchStats.entries()]
    .map(([branch, v]) => ({
      branch,
      ...v,
      placementRatePct: pct(v.placed, v.students),
      applyToPlacePct: pct(v.placed, v.applied),
    }))
    .sort((a, b) => b.students - a.students);

  // Offers, packages, documents
  const liveOffers = offers.filter((o) => o.acceptanceStatus !== "WITHDRAWN");
  const ctcOffers = liveOffers.filter((o) => o.ctc != null);
  const byMonth = new Map<string, number[]>();
  for (const o of ctcOffers) {
    const key = `${o.offerDate.getFullYear()}-${String(o.offerDate.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), o.ctc as number]);
  }
  const byCompany = new Map<string, number[]>();
  for (const o of ctcOffers) byCompany.set(o.company.name, [...(byCompany.get(o.company.name) ?? []), o.ctc as number]);

  const documents = liveOffers.flatMap((o) => o.documents);

  // Recruiter engagement
  const recruiters = companies.map((c) => {
    const companyJobs = jobs.filter((j) => j.companyId === c.id);
    const companyOffers = liveOffers.filter((o) => o.companyId === c.id);
    const companyApps = students.flatMap((s) => s.applications).filter((a) => companyJobs.some((j) => j.id === a.jobId));
    const activity = [
      ...companyJobs.map((j) => j.createdAt),
      ...c.drives.map((d) => d.createdAt),
      ...companyOffers.map((o) => o.updatedAt),
      ...companyApps.map((a) => a.updatedAt),
    ];
    const lastActivity = activity.length ? new Date(Math.max(...activity.map((d) => d.getTime()))) : null;
    const offerMonths = new Set(companyOffers.map((o) => `${o.offerDate.getFullYear()}-${o.offerDate.getMonth()}`));
    const jobsWithOffers = new Set(companyOffers.map((o) => o.jobId));
    const active = lastActivity ? now.getTime() - lastActivity.getTime() <= ACTIVE_RECRUITER_DAYS * DAY_MS : false;
    return {
      company: c.name,
      jobs: companyJobs.length,
      openJobs: companyJobs.filter((j) => j.status === "PUBLISHED").length,
      drives: c.drives.length,
      applications: companyApps.length,
      offers: companyOffers.length,
      accepted: companyOffers.filter((o) => o.acceptanceStatus === "ACCEPTED").length,
      joined: companyOffers.filter((o) => o.joiningStatus === "JOINED").length,
      lastActivity,
      engagement: companyJobs.length === 0 ? "No roles yet" : active ? "Active" : "Idle",
      repeatHirer: jobsWithOffers.size >= 2 || offerMonths.size >= 2 || c.drives.length >= 2,
    };
  });
  recruiters.sort((a, b) => b.offers - a.offers || b.applications - a.applications);

  const upcomingDrives = drives.filter((d) => d.status === "SCHEDULED" && d.date >= now).length;
  const activeDrives = drives.filter(
    (d) => d.status === "SCHEDULED" && d.date < now && d.date.getTime() + d.durationMinutes * 60000 >= now.getTime()
  ).length;

  return {
    generatedAt: now.toISOString(),
    students: {
      registered: students.length,
      placed,
      unplaced: students.length - placed,
      placementReady,
      placementReadyPct: pct(placementReady, students.length),
      placementRatePct: pct(placed, students.length),
      readinessThreshold: PLACEMENT_READY_SCORE,
    },
    offers: {
      made: liveOffers.length,
      accepted: liveOffers.filter((o) => o.acceptanceStatus === "ACCEPTED").length,
      pending: liveOffers.filter((o) => o.acceptanceStatus === "PENDING").length,
      deferred: liveOffers.filter((o) => o.acceptanceStatus === "DEFERRED").length,
      declined: liveOffers.filter((o) => o.acceptanceStatus === "DECLINED").length,
      withdrawn: offers.length - liveOffers.length,
      ppo: liveOffers.filter((o) => o.offerType === "PPO").length,
      internships: liveOffers.filter((o) => o.offerType === "INTERNSHIP").length,
    },
    joining: {
      joined: liveOffers.filter((o) => o.joiningStatus === "JOINED").length,
      pending: liveOffers.filter((o) => o.acceptanceStatus === "ACCEPTED" && o.joiningStatus === "PENDING").length,
      didNotJoin: liveOffers.filter((o) => o.joiningStatus === "DID_NOT_JOIN").length,
    },
    documents: {
      total: documents.length,
      notSubmitted: documents.filter((d) => d.status === "REQUIRED").length,
      awaitingReview: documents.filter((d) => d.status === "SUBMITTED").length,
      verified: documents.filter((d) => d.status === "VERIFIED").length,
      rejected: documents.filter((d) => d.status === "REJECTED").length,
      overdue: documents.filter((d) => d.dueDate && d.dueDate < now && ["REQUIRED", "REJECTED"].includes(d.status)).length,
    },
    drives: { upcoming: upcomingDrives, active: activeDrives, total: drives.length },
    packages: {
      overall: ctcStats(ctcOffers.map((o) => o.ctc as number)),
      byMonth: [...byMonth.entries()].sort().map(([month, ctcs]) => ({ month, ...ctcStats(ctcs) })),
      byCompany: [...byCompany.entries()]
        .map(([company, ctcs]) => ({ company, ...ctcStats(ctcs) }))
        .sort((a, b) => (b.highestLpa ?? 0) - (a.highestLpa ?? 0)),
    },
    readinessByRole,
    branches,
    skills,
    recruiters,
    atRisk: atRisk.slice(0, 25),
    atRiskTotal: atRisk.length,
  };
}

export async function nudgeStudent(studentId: string, collegeId: string | null) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || (collegeId && student.collegeId !== collegeId)) throw notFound("Student");
  const insights = await getPlacementInsights(student.collegeId);
  const entry = insights.atRisk.find((s) => s.studentId === studentId);

  const steps = entry?.factors.slice(0, 3).map((f) => f.reason.toLowerCase()) ?? [];
  await notify([student.userId], {
    type: "PLACEMENT_SUPPORT",
    title: "Your placement office wants to help you get placed",
    body: steps.length
      ? `They noticed: ${steps.join("; ")}. Check your skill gap and job matches, or book time with the placement office.`
      : "Check your skill gap and job matches, or book time with the placement office.",
    link: "/student/skill-gap",
  });
  return { notified: true };
}
