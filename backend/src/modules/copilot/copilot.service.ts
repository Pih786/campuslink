import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { jobsVisibleToCollege, resolveScope } from "../../utils/tenancy";
import { getOverview, getFunnel } from "../analytics/analytics.service";
import { getDriveConflicts } from "../drives/drives.service";

const MAX_SKILLS = 20;
const LARGEST_SHORTAGES = 5;
const MAX_COMPANIES = 30;
const MAX_DRIVES = 10;
const MAX_TOP_APPLICANTS = 20;
const SHORTAGE_SKILLS_WITH_NAMES = 3;
const SAMPLE_NAMES_PER_SKILL = 10;

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function lpa(ctc: number | null | undefined): number | null {
  return ctc == null ? null : Math.round((ctc / 100000) * 10) / 10;
}

const DEFINITIONS = {
  shortageRank:
    "Campus skill-shortage rank (1 = largest) among skills that open jobs require: ordered by demandOpenJobs (most first), then verifiedCoveragePct (lowest first). Skills no open job requires are not ranked.",
  demandOpenJobs: "Number of currently published jobs that list the skill as a requirement.",
  supplyStudents: "Number of registered students in scope (this college, or all colleges for recruiters) who list the skill (self-declared or evidence-backed).",
  registeredStudents: "Students registered at this college (officers) or on the whole platform (recruiters and admins).",
  verifiedSupplyStudents: "Students whose skill is verified by passed coding/SQL labs or assessments.",
  verifiedCoveragePct: "verifiedSupplyStudents / totalStudents × 100.",
  studentsLackingSkill: "totalStudents − supplyStudents.",
  placementRatePct:
    "Per department: placed students / registered students in that department × 100. collegePlacementRatePct is the same for the whole college. 'Placed' means at least one accepted offer; registered students are used as the eligible base.",
  funnel:
    "Counts of APPLICATIONS (not students) that have reached each stage or beyond. One student can have several applications.",
  conversion: "Each rate is the next funnel stage divided by the previous stage × 100 (null when the previous stage is 0).",
  ctcLpa: "Cost-to-company in lakhs per annum.",
  matchScore: "AI fit score (0-100) stored when matching was last run for that application.",
  learning: "Students' self-reported progress on library material (saved, in progress, completed), per skill.",
  mentoring: "Students assigned to a faculty mentor, and escalations of at-risk students to mentors.",
  assignments: "Take-home assignments the company sent to candidates, with submission and review counts.",
};

const NOT_TRACKED = [
  "historical seasons (year-over-year trends)",
  "time spent on learning material (only saved / in progress / completed is recorded)",
];

// What the facts snapshot covers: one recruiter's company, one college, or
// (platform admins) everything.
interface FactScope {
  companyId?: string;
  collegeId?: string;
}

const studentFilter = (f: FactScope): Prisma.StudentWhereInput => (f.collegeId ? { collegeId: f.collegeId } : {});
const applicationFilter = (f: FactScope): Prisma.ApplicationWhereInput =>
  f.companyId ? { job: { companyId: f.companyId } } : f.collegeId ? { student: { collegeId: f.collegeId } } : {};
const offerFilter = (f: FactScope): Prisma.OfferWhereInput =>
  f.companyId ? { companyId: f.companyId } : f.collegeId ? { student: { collegeId: f.collegeId } } : {};
const jobFilter = (f: FactScope): Prisma.JobWhereInput =>
  f.companyId ? { companyId: f.companyId } : f.collegeId ? jobsVisibleToCollege(f.collegeId) : {};
const driveFilter = (f: FactScope): Prisma.DriveWhereInput =>
  f.companyId ? { companyId: f.companyId } : f.collegeId ? { collegeId: f.collegeId } : {};

async function buildOfferLifecycle(f: FactScope) {
  const where = offerFilter(f);
  const [offers, documents] = await Promise.all([
    prisma.offer.findMany({ where, select: { acceptanceStatus: true, offerType: true, conversionStatus: true } }),
    prisma.offerDocument.findMany({
      where: { offer: { ...where, acceptanceStatus: { not: "WITHDRAWN" } } },
      select: { status: true, dueDate: true },
    }),
  ]);
  const now = new Date();
  const count = (fn: (o: (typeof offers)[number]) => boolean) => offers.filter(fn).length;
  return {
    offerRecordsByStatus: {
      awaitingReply: count((o) => o.acceptanceStatus === "PENDING"),
      deferred: count((o) => o.acceptanceStatus === "DEFERRED"),
      accepted: count((o) => o.acceptanceStatus === "ACCEPTED"),
      declined: count((o) => o.acceptanceStatus === "DECLINED"),
      withdrawnByEmployer: count((o) => o.acceptanceStatus === "WITHDRAWN"),
    },
    internshipOffers: count((o) => o.offerType === "INTERNSHIP"),
    internshipsConvertedToPpo: count((o) => o.conversionStatus === "CONVERTED"),
    preplacementOffers: count((o) => o.offerType === "PPO"),
    documents: {
      awaitingReview: documents.filter((d) => d.status === "SUBMITTED").length,
      notYetSubmitted: documents.filter((d) => d.status === "REQUIRED").length,
      sentBackForResubmission: documents.filter((d) => d.status === "REJECTED").length,
      verified: documents.filter((d) => d.status === "VERIFIED").length,
      overdue: documents.filter((d) => d.dueDate && d.dueDate < now && ["REQUIRED", "REJECTED"].includes(d.status)).length,
    },
  };
}

async function buildSkillFacts(f: FactScope, totalStudents: number, includeNames: boolean) {
  const supplyWhere: Prisma.StudentSkillWhereInput = f.collegeId ? { student: { collegeId: f.collegeId } } : {};
  const [jobs, supply, verifiedSupply] = await Promise.all([
    prisma.job.findMany({
      where: { status: "PUBLISHED", ...jobFilter(f) },
      select: { requirements: { select: { requirementType: true, mandatory: true, skillId: true } } },
    }),
    prisma.studentSkill.groupBy({ by: ["skillId"], where: supplyWhere, _count: { _all: true } }),
    prisma.studentSkill.groupBy({ by: ["skillId"], where: { ...supplyWhere, verified: true }, _count: { _all: true } }),
  ]);

  const demand = new Map<string, { jobs: number; mandatory: number }>();
  for (const job of jobs) {
    const seen = new Set<string>();
    for (const req of job.requirements) {
      if (req.requirementType !== "SKILL" || !req.skillId || seen.has(req.skillId)) continue;
      seen.add(req.skillId);
      const entry = demand.get(req.skillId) ?? { jobs: 0, mandatory: 0 };
      entry.jobs += 1;
      if (req.mandatory) entry.mandatory += 1;
      demand.set(req.skillId, entry);
    }
  }

  const supplyBySkill = new Map(supply.map((s) => [s.skillId, s._count._all]));
  const verifiedBySkill = new Map(verifiedSupply.map((s) => [s.skillId, s._count._all]));
  const skillIds = [...new Set([...demand.keys(), ...supplyBySkill.keys()])];
  const skills = await prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, name: true } });

  const rows = skills
    .map((skill) => {
      const d = demand.get(skill.id) ?? { jobs: 0, mandatory: 0 };
      const supplyCount = supplyBySkill.get(skill.id) ?? 0;
      const verifiedCount = verifiedBySkill.get(skill.id) ?? 0;
      return {
        skillId: skill.id,
        skill: skill.name,
        demandOpenJobs: d.jobs,
        mandatoryInJobs: d.mandatory,
        supplyStudents: supplyCount,
        verifiedSupplyStudents: verifiedCount,
        verifiedCoveragePct: pct(verifiedCount, totalStudents),
        studentsLackingSkill: Math.max(0, totalStudents - supplyCount),
      };
    })
    // Shortage ranking: most-demanded first, then lowest verified coverage.
    .sort(
      (a, b) =>
        b.demandOpenJobs - a.demandOpenJobs ||
        (a.verifiedCoveragePct ?? 0) - (b.verifiedCoveragePct ?? 0) ||
        a.skill.localeCompare(b.skill)
    )
    .slice(0, MAX_SKILLS)
    .map((row, index) => (row.demandOpenJobs > 0 ? { shortageRank: index + 1, ...row } : row));

  const largestShortages = rows
    .filter((r) => r.demandOpenJobs > 0)
    .slice(0, LARGEST_SHORTAGES)
    .map((r) => r.skill);

  let shortageDetails: unknown[] = [];
  if (includeNames) {
    const topShortages = rows.filter((r) => r.demandOpenJobs > 0).slice(0, SHORTAGE_SKILLS_WITH_NAMES);
    shortageDetails = await Promise.all(
      topShortages.map(async (row) => {
        const lacking = await prisma.student.findMany({
          where: { ...studentFilter(f), skills: { none: { skillId: row.skillId } } },
          select: { department: true, user: { select: { fullName: true } } },
          take: SAMPLE_NAMES_PER_SKILL,
          orderBy: { createdAt: "asc" },
        });
        return {
          skill: row.skill,
          studentsLackingSkill: row.studentsLackingSkill,
          sampleStudentsLacking: lacking.map((s) => ({ name: s.user.fullName, department: s.department })),
        };
      })
    );
  }

  return {
    skills: rows.map(({ skillId: _skillId, ...rest }) => rest),
    largestShortages,
    shortageDetails,
  };
}

async function buildCompanyFacts(f: FactScope) {
  const companies = await prisma.company.findMany({
    where: f.companyId ? { id: f.companyId } : f.collegeId ? { jobs: { some: jobFilter(f) } } : {},
    take: MAX_COMPANIES,
    orderBy: { name: "asc" },
    select: {
      name: true,
      jobs: {
        where: f.collegeId ? jobFilter(f) : {},
        select: { status: true, _count: { select: { applications: { where: applicationFilter(f) } } } },
      },
      offers: { where: offerFilter(f), select: { acceptanceStatus: true, joiningStatus: true, ctc: true } },
    },
  });

  return companies.map((c) => {
    const ctcs = c.offers.map((o) => o.ctc).filter((x): x is number => x != null);
    return {
      company: c.name,
      openJobs: c.jobs.filter((j) => j.status === "PUBLISHED").length,
      applications: c.jobs.reduce((sum, j) => sum + j._count.applications, 0),
      offers: c.offers.length,
      acceptedOffers: c.offers.filter((o) => o.acceptanceStatus === "ACCEPTED").length,
      joined: c.offers.filter((o) => o.joiningStatus === "JOINED").length,
      averageCtcLpa: ctcs.length ? lpa(ctcs.reduce((a, b) => a + b, 0) / ctcs.length) : null,
      highestCtcLpa: ctcs.length ? lpa(Math.max(...ctcs)) : null,
    };
  });
}

async function buildDepartmentFacts(f: FactScope) {
  const [students, applications, offers] = await Promise.all([
    prisma.student.findMany({ where: studentFilter(f), select: { id: true, department: true } }),
    prisma.application.findMany({ where: applicationFilter(f), select: { student: { select: { department: true } } } }),
    prisma.offer.findMany({
      where: offerFilter(f),
      select: { studentId: true, acceptanceStatus: true, joiningStatus: true, student: { select: { department: true } } },
    }),
  ]);

  const byDept = new Map<
    string,
    { students: number; applications: number; offers: number; accepted: number; joined: number; placed: Set<string> }
  >();
  const bucket = (dept: string | null) => {
    const key = dept || "Unspecified";
    if (!byDept.has(key)) {
      byDept.set(key, { students: 0, applications: 0, offers: 0, accepted: 0, joined: 0, placed: new Set() });
    }
    return byDept.get(key)!;
  };

  for (const s of students) bucket(s.department).students += 1;
  for (const a of applications) bucket(a.student.department).applications += 1;
  for (const o of offers) {
    const b = bucket(o.student.department);
    b.offers += 1;
    if (o.acceptanceStatus === "ACCEPTED") {
      b.accepted += 1;
      b.placed.add(o.studentId);
    }
    if (o.joiningStatus === "JOINED") b.joined += 1;
  }

  return [...byDept.entries()]
    .map(([department, b]) => ({
      department,
      students: b.students,
      applications: b.applications,
      offers: b.offers,
      acceptedOffers: b.accepted,
      joined: b.joined,
      placedStudents: b.placed.size,
      placementRatePct: pct(b.placed.size, b.students),
    }))
    .sort((a, b) => b.students - a.students);
}

async function buildScheduleFacts(f: FactScope) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const interviewScope: Prisma.InterviewWhereInput = { application: applicationFilter(f) };

  const [upcoming, today, completed, noShow, drives] = await Promise.all([
    prisma.interview.count({ where: { ...interviewScope, status: "SCHEDULED", scheduledAt: { gte: now } } }),
    prisma.interview.count({ where: { ...interviewScope, status: "SCHEDULED", scheduledAt: { gte: startOfDay, lt: endOfDay } } }),
    prisma.interview.count({ where: { ...interviewScope, status: "COMPLETED" } }),
    prisma.interview.count({ where: { ...interviewScope, status: "NO_SHOW" } }),
    prisma.drive.findMany({
      where: { date: { gte: startOfDay }, status: { not: "CANCELLED" }, ...driveFilter(f) },
      include: { company: { select: { name: true } }, job: { select: { title: true } } },
      orderBy: { date: "asc" },
      take: MAX_DRIVES,
    }),
  ]);

  const upcomingDrives = await Promise.all(
    drives.map(async (d) => {
      const conflicts = await getDriveConflicts(d.id);
      return {
        company: d.company.name,
        job: d.job.title,
        date: d.date.toISOString(),
        venue: d.venue,
        capacity: d.capacity,
        schedulingConflicts: conflicts.conflictCount,
      };
    })
  );

  return {
    interviews: {
      upcomingScheduled: upcoming,
      scheduledToday: today,
      completed,
      noShows: noShow,
      noShowRatePct: pct(noShow, completed + noShow),
    },
    upcomingDrives,
  };
}

// College view: who is learning what, and how mentoring is going.
async function buildSupportFacts(f: FactScope) {
  const studentWhere = studentFilter(f);
  const [progress, bySkill, mentored, escalations] = await Promise.all([
    prisma.learningProgress.groupBy({ by: ["status"], where: { student: studentWhere }, _count: true }),
    prisma.learningProgress.findMany({
      where: { student: studentWhere, status: "COMPLETED" },
      select: { studentId: true, resource: { select: { skill: { select: { name: true } } } } },
    }),
    prisma.mentorAssignment.count({ where: { student: studentWhere } }),
    prisma.escalation.groupBy({ by: ["status"], where: { student: studentWhere }, _count: true }),
  ]);
  const count = (rows: { status: string; _count: number }[], status: string) =>
    rows.find((x) => x.status === status)?._count ?? 0;
  const skillCounts = new Map<string, Set<string>>();
  for (const row of bySkill) {
    const name = row.resource.skill?.name;
    if (!name) continue;
    if (!skillCounts.has(name)) skillCounts.set(name, new Set());
    skillCounts.get(name)!.add(row.studentId);
  }
  return {
    learning: {
      itemsCompleted: count(progress, "COMPLETED"),
      itemsInProgress: count(progress, "IN_PROGRESS"),
      itemsSaved: count(progress, "SAVED"),
      studentsWhoCompletedSomething: new Set(bySkill.map((b) => b.studentId)).size,
      skillsMostStudied: [...skillCounts.entries()]
        .map(([skill, students]) => ({ skill, studentsCompleted: students.size }))
        .sort((a, b) => b.studentsCompleted - a.studentsCompleted)
        .slice(0, 8),
    },
    mentoring: {
      studentsWithMentor: mentored,
      escalationsOpen: count(escalations, "OPEN"),
      escalationsInProgress: count(escalations, "IN_PROGRESS"),
      escalationsResolved: count(escalations, "RESOLVED"),
    },
  };
}

// Company view: take-home assignments.
async function buildAssignmentFacts(companyId: string) {
  const assignments = await prisma.companyAssignment.findMany({
    where: { companyId },
    select: {
      title: true,
      status: true,
      maxScore: true,
      dueAt: true,
      job: { select: { title: true } },
      submissions: { select: { status: true, score: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  return assignments.map((a) => {
    const scores = a.submissions.filter((x) => x.score != null).map((x) => x.score as number);
    return {
      title: a.title,
      job: a.job.title,
      open: a.status === "OPEN" && a.dueAt > new Date(),
      sent: a.submissions.length,
      submitted: a.submissions.filter((x) => x.status !== "ASSIGNED").length,
      reviewed: a.submissions.filter((x) => x.status === "REVIEWED").length,
      averageScore: scores.length ? Math.round((scores.reduce((t, v) => t + v, 0) / scores.length) * 10) / 10 : null,
      maxScore: a.maxScore,
    };
  });
}

async function buildTopApplicants(f: FactScope) {
  const applications = await prisma.application.findMany({
    where: { matchScore: { not: null }, ...applicationFilter(f) },
    orderBy: { matchScore: "desc" },
    take: MAX_TOP_APPLICANTS,
    select: {
      status: true,
      matchScore: true,
      student: { select: { department: true, user: { select: { fullName: true } } } },
      job: { select: { title: true, company: { select: { name: true } } } },
    },
  });

  return applications.map((a) => ({
    student: a.student.user.fullName,
    department: a.student.department,
    company: a.job.company.name,
    job: a.job.title,
    matchScore: a.matchScore,
    status: a.status,
  }));
}

export async function buildFacts(userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  const f: FactScope =
    role === "RECRUITER" ? { companyId: scope.companyId as string } : scope.isAdmin ? {} : { collegeId: scope.collegeId as string };
  const companyId = f.companyId;
  const isCollegeScope = !companyId;

  const [overview, funnel, totalStudents, placedStudents] = await Promise.all([
    getOverview(userId, role),
    getFunnel(userId, role),
    prisma.student.count({ where: studentFilter(f) }),
    prisma.offer
      .findMany({
        where: { acceptanceStatus: "ACCEPTED", ...offerFilter(f) },
        distinct: ["studentId"],
        select: { studentId: true },
      })
      .then((rows) => rows.length),
  ]);

  // Explicit, unambiguous labels: the raw overview/funnel objects reuse words
  // like "eligible" with different meanings, which led the model to attach
  // correct numbers to the wrong concepts.
  const headline = {
    registeredStudents: totalStudents,
    applicationsSubmitted: funnel.applied,
    applicationsShortlistedOrBeyond: funnel.shortlisted,
    applicationsThatReachedInterview: funnel.interview,
    applicationsSelected: funnel.selected,
    offersMade: funnel.offer,
    offersAccepted: funnel.accepted,
    offersWithStudentJoined: funnel.joined,
    ...("interviews" in overview ? { interviewRecords: overview.interviews } : {}),
    ...(companyId
      ? {}
      : {
          collegePlacedStudents: placedStudents,
          collegePlacementRatePct: pct(placedStudents, totalStudents),
        }),
  };

  const [skillFacts, companies, departments, schedule, topApplicants, offerLifecycle, support, assignments] = await Promise.all([
    buildSkillFacts(f, totalStudents, isCollegeScope),
    buildCompanyFacts(f),
    isCollegeScope ? buildDepartmentFacts(f) : Promise.resolve(undefined),
    buildScheduleFacts(f),
    buildTopApplicants(f),
    buildOfferLifecycle(f),
    isCollegeScope ? buildSupportFacts(f) : Promise.resolve(undefined),
    companyId ? buildAssignmentFacts(companyId) : Promise.resolve(undefined),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    scope: isCollegeScope ? "college" : "company",
    ...(companies.length === 1 && !isCollegeScope ? { company: companies[0].company } : {}),
    headline,
    funnel,
    conversion: {
      shortlistRatePct: pct(funnel.shortlisted, funnel.applied),
      interviewRatePct: pct(funnel.interview, funnel.shortlisted),
      selectionRatePct: pct(funnel.selected, funnel.interview),
      offerAcceptanceRatePct: pct(funnel.accepted, funnel.offer),
      joiningRatePct: pct(funnel.joined, funnel.accepted),
    },
    largestSkillShortages: skillFacts.largestShortages,
    skillSupplyVsDemand: skillFacts.skills,
    ...(isCollegeScope ? { topSkillShortages: skillFacts.shortageDetails, departments } : {}),
    companies,
    offerLifecycle,
    ...schedule,
    topApplicantsByMatchScore: topApplicants,
    ...(support ?? {}),
    ...(assignments ? { assignments } : {}),
    definitions: DEFINITIONS,
    notTrackedYet: NOT_TRACKED,
  };
}
