import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { forbidden, notFound } from "../../utils/errors";
import {
  checkEligibility,
  EligibilityCheck,
  explainEligibility,
  toEligibilityStudent,
  toEligibilityRequirements,
} from "../eligibility/eligibility.service";
import { latestMockInclude, latestMockScore } from "../mock-interviews/mock-interviews.service";
import { aiMatch, AiMatchJob, AiMatchStudent } from "../../utils/ai-client";
import { jobsVisibleToCollege, resolveScope } from "../../utils/tenancy";

const jobWithRequirementsInclude = {
  requirements: { include: { skill: true } },
} as const;

const studentWithSkillsInclude = {
  skills: { include: { skill: true } },
  projects: true,
  certifications: true,
  user: true,
  ...latestMockInclude,
} as const;

export function buildAiJob(job: {
  id: string;
  title: string;
  requirements: {
    requirementType: string;
    skill: { name: string } | null;
    mandatory: boolean;
    weight: number;
    minimumProficiency: number | null;
    value: unknown;
  }[];
}): AiMatchJob {
  return {
    id: job.id,
    title: job.title,
    requirements: job.requirements.map((r) => ({
      type: r.requirementType,
      skillName: r.skill?.name,
      mandatory: r.mandatory,
      weight: r.weight,
      minimumProficiency: r.minimumProficiency ?? undefined,
      value: r.value,
    })),
  };
}

export function buildAiStudent(student: {
  id: string;
  cgpa: number;
  department: string | null;
  skills: { proficiency: number; verified: boolean; skill: { name: string } }[];
  projects: { title: string; techStack: string[] }[];
  certifications: { name: string }[];
}): AiMatchStudent {
  return {
    id: student.id,
    cgpa: student.cgpa,
    branch: student.department ?? "",
    skills: student.skills.map((s) => ({
      name: s.skill.name,
      proficiency: s.proficiency,
      verified: s.verified,
    })),
    projects: student.projects.map((p) => ({ title: p.title, technologies: p.techStack })),
    // Self-reported certificates are listed but not verified, so the scorer
    // gives them no credit until verification exists.
    certifications: student.certifications.map((c) => ({ name: c.name, verified: false })),
    experienceMonths: 0,
  };
}

export interface CandidateResult {
  studentId: string;
  fullName: string;
  email: string;
  department: string | null;
  cgpa: number;
  score: number;
  breakdown: unknown;
  matchedSkills: string[];
  gapSkills: string[];
  explanation: string[];
  aiUnavailable: boolean;
  applied: boolean;
  hasResume: boolean;
}

export interface ScreeningSummary {
  evaluated: number;
  eligible: number;
  excluded: number;
  // Why students were excluded; one student can hit several blockers.
  blockers: { reason: string; students: number }[];
}

function blockerReason(check: EligibilityCheck): string {
  switch (check.type) {
    case "CGPA":
      return `CGPA below ${check.need}`;
    case "BRANCH":
      return "Branch not eligible";
    case "BACKLOG":
      return `More than ${check.need} active backlog${check.need === 1 ? "" : "s"}`;
    case "EXPERIENCE":
      return "Not enough experience";
    case "SKILL":
      return check.have == null ? `Missing ${check.skillName}` : `${check.skillName} below level ${check.need}`;
    default:
      return check.label;
  }
}

export async function computeCandidatesForJob(
  jobId: string,
  userId: string,
  role: Role
): Promise<{ candidates: CandidateResult[]; screening: ScreeningSummary }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { ...jobWithRequirementsInclude, targetColleges: { select: { collegeId: true } } },
  });
  if (!job) throw notFound("Job");

  const scope = await resolveScope(userId, role);
  if (role === "RECRUITER" && scope.companyId !== job.companyId) {
    throw forbidden("You can only view candidates for your own company's jobs");
  }

  // Candidate pool: students of the colleges the job is open to. An officer
  // only ever sees their own college's students, and only for jobs open to it.
  const targetIds = job.targetColleges.map((t) => t.collegeId);
  let collegeFilter: { collegeId?: string | { in: string[] } } =
    job.visibility === "GLOBAL" ? {} : { collegeId: { in: targetIds } };
  if (role === "PLACEMENT_OFFICER") {
    if (job.visibility !== "GLOBAL" && !targetIds.includes(scope.collegeId as string)) throw notFound("Job");
    collegeFilter = { collegeId: scope.collegeId as string };
  }

  const students = await prisma.student.findMany({ where: collegeFilter, include: studentWithSkillsInclude });

  const eligibilityRequirements = toEligibilityRequirements(job.requirements);
  const aiJob = buildAiJob(job);

  const candidates: CandidateResult[] = [];
  const blockerCounts = new Map<string, number>();
  const applicants = new Set(
    (await prisma.application.findMany({ where: { jobId }, select: { studentId: true } })).map((a) => a.studentId)
  );

  for (const student of students) {
    const eligibilityStudent = toEligibilityStudent({
      cgpa: student.cgpa,
      department: student.department,
      backlogCount: student.backlogCount,
      mockInterviewScore: latestMockScore(student),
      skills: student.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
    });

    const eligibility = checkEligibility(eligibilityStudent, eligibilityRequirements);
    if (!eligibility.eligible) {
      for (const check of eligibility.checks) {
        if (check.mandatory && !check.pass) {
          const reason = blockerReason(check);
          blockerCounts.set(reason, (blockerCounts.get(reason) ?? 0) + 1);
        }
      }
      continue;
    }

    const aiStudent = buildAiStudent(student);
    const result = await aiMatch(aiStudent, aiJob);

    candidates.push({
      studentId: student.id,
      fullName: student.user.fullName,
      email: student.user.email,
      department: student.department,
      cgpa: student.cgpa,
      score: result.overall,
      breakdown: result.breakdown,
      matchedSkills: result.matched_skills,
      gapSkills: result.gap_skills,
      explanation: result.explanation,
      aiUnavailable: !!result.aiUnavailable,
      applied: applicants.has(student.id),
      hasResume: Boolean(student.resumeUrl),
    });

    // Persist the score onto an existing Application row for this
    // student+job, if one exists. We never create Applications here, and we
    // never persist fallback (skill-overlap-only) scores: they'd overwrite a
    // real AI score with a very different number whenever the AI service blips.
    if (result.aiUnavailable) continue;
    const existingApplication = await prisma.application.findUnique({
      where: { studentId_jobId: { studentId: student.id, jobId } },
    });
    if (existingApplication) {
      await prisma.application.update({
        where: { id: existingApplication.id },
        data: {
          matchScore: result.overall,
          matchBreakdown: result as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates,
    screening: {
      evaluated: students.length,
      eligible: candidates.length,
      excluded: students.length - candidates.length,
      blockers: [...blockerCounts.entries()]
        .map(([reason, count]) => ({ reason, students: count }))
        .sort((a, b) => b.students - a.students || a.reason.localeCompare(b.reason)),
    },
  };
}

export interface RecommendedJob {
  jobId: string;
  title: string;
  companyName: string;
  location: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  applicationDeadline: Date | null;
  eligible: boolean;
  eligibilitySummary: string;
  checks: EligibilityCheck[];
  // Match fields are null for ineligible roles: eligibility is decided first
  // and a score never overrides a hard cut-off.
  score: number | null;
  breakdown: unknown;
  matchedSkills: string[];
  gapSkills: string[];
  explanation: string[];
  aiUnavailable: boolean;
}

export async function getRecommendedJobsForStudent(
  userId: string,
  { includeIneligible = false }: { includeIneligible?: boolean } = {}
): Promise<RecommendedJob[]> {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: studentWithSkillsInclude,
  });
  if (!student) throw notFound("Student profile");

  const jobs = await prisma.job.findMany({
    where: { status: "PUBLISHED", ...jobsVisibleToCollege(student.collegeId) },
    include: { ...jobWithRequirementsInclude, company: true },
  });

  const eligibilityStudent = toEligibilityStudent({
    cgpa: student.cgpa,
    department: student.department,
    backlogCount: student.backlogCount,
    mockInterviewScore: latestMockScore(student),
    skills: student.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
  });
  const aiStudent = buildAiStudent(student);

  const results: RecommendedJob[] = [];

  for (const job of jobs) {
    const eligibilityRequirements = toEligibilityRequirements(job.requirements);
    const eligibility = checkEligibility(eligibilityStudent, eligibilityRequirements);
    if (!eligibility.eligible && !includeIneligible) continue;

    const common = {
      jobId: job.id,
      title: job.title,
      companyName: job.company.name,
      location: job.location,
      employmentType: job.employmentType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      applicationDeadline: job.applicationDeadline,
      eligible: eligibility.eligible,
      eligibilitySummary: explainEligibility(eligibility),
      checks: eligibility.checks,
    };

    if (!eligibility.eligible) {
      const skillChecks = eligibility.checks.filter((c) => c.type === "SKILL");
      results.push({
        ...common,
        score: null,
        breakdown: null,
        matchedSkills: skillChecks.filter((c) => c.pass).map((c) => c.skillName as string),
        gapSkills: skillChecks.filter((c) => !c.pass).map((c) => c.skillName as string),
        explanation: [],
        aiUnavailable: false,
      });
      continue;
    }

    const aiJob = buildAiJob(job);
    const result = await aiMatch(aiStudent, aiJob);

    results.push({
      ...common,
      score: result.overall,
      breakdown: result.breakdown,
      matchedSkills: result.matched_skills,
      gapSkills: result.gap_skills,
      explanation: result.explanation ?? [],
      aiUnavailable: !!result.aiUnavailable,
    });
  }

  results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.score ?? 0) - (a.score ?? 0));
  return results;
}
