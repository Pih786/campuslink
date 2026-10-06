// Predictive placement-likelihood -- a SEPARATE feature from the matching
// engine (src/modules/matching/). It reuses only genuinely shared platform
// primitives (the eligibility rule engine, tenancy scoping) the same way
// every other module does; it does not import from matching.service.ts,
// ai-client.ts, or touch Application.matchScore. If the trained model isn't
// available, candidates come back with probability: null rather than the
// request failing.
import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { forbidden, notFound } from "../../utils/errors";
import { checkEligibility, toEligibilityRequirements, toEligibilityStudent } from "../eligibility/eligibility.service";
import { resolveScope } from "../../utils/tenancy";
import { getMlModelInfo, MlJob, MlStudent, predictPlacementLikelihood } from "../../utils/ml-client";
import { latestMockInclude, latestMockScore } from "../mock-interviews/mock-interviews.service";

const studentInclude = {
  skills: { include: { skill: true } },
  projects: true,
  certifications: true,
  user: { select: { id: true, fullName: true, email: true } },
  ...latestMockInclude,
} as const;

type StudentWithSkills = Awaited<ReturnType<typeof prisma.student.findMany<{ include: typeof studentInclude }>>>[number];

function buildMlJob(job: {
  requirements: {
    requirementType: string;
    skill: { name: string } | null;
    minimumProficiency: number | null;
    value: unknown;
  }[];
}): MlJob {
  return {
    requirements: job.requirements.map((r) => ({
      type: r.requirementType,
      skillName: r.skill?.name,
      minimumProficiency: r.minimumProficiency ?? undefined,
      value: typeof r.value === "number" ? r.value : undefined,
    })),
  };
}

function buildMlStudent(student: StudentWithSkills): MlStudent {
  return {
    cgpa: student.cgpa,
    skills: student.skills.map((s) => ({ name: s.skill.name, proficiency: s.proficiency, verified: s.verified })),
    projects: student.projects.map((p) => ({ title: p.title, technologies: p.techStack })),
    certifications: student.certifications.map((c) => ({ name: c.name, verified: false })),
    experienceMonths: 0,
  };
}

export interface PredictiveCandidate {
  studentId: string;
  fullName: string;
  email: string;
  available: boolean;
  probability: number | null;
}

export async function getPredictiveCandidates(
  jobId: string,
  userId: string,
  role: Role
): Promise<{ candidates: PredictiveCandidate[]; modelAvailable: boolean }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      requirements: { include: { skill: true } },
      targetColleges: { select: { collegeId: true } },
    },
  });
  if (!job) throw notFound("Job");

  const scope = await resolveScope(userId, role);
  if (role === "RECRUITER" && scope.companyId !== job.companyId) {
    throw forbidden("You can only view candidates for your own company's jobs");
  }

  // Same visibility/scoping rules as the matching engine's candidate pool.
  const targetIds = job.targetColleges.map((t) => t.collegeId);
  let collegeFilter: { collegeId?: string | { in: string[] } } =
    job.visibility === "GLOBAL" ? {} : { collegeId: { in: targetIds } };
  if (role === "PLACEMENT_OFFICER") {
    if (job.visibility !== "GLOBAL" && !targetIds.includes(scope.collegeId as string)) throw notFound("Job");
    collegeFilter = { collegeId: scope.collegeId as string };
  }

  const students = await prisma.student.findMany({ where: collegeFilter, include: studentInclude });
  const eligibilityRequirements = toEligibilityRequirements(job.requirements);
  const mlJob = buildMlJob(job);

  const eligible = students.filter((student) =>
    checkEligibility(
      toEligibilityStudent({
        cgpa: student.cgpa,
        department: student.department,
        backlogCount: student.backlogCount,
        mockInterviewScore: latestMockScore(student),
        skills: student.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
      }),
      eligibilityRequirements
    ).eligible
  );

  const candidates = await Promise.all(
    eligible.map(async (student): Promise<PredictiveCandidate> => {
      const result = await predictPlacementLikelihood(buildMlStudent(student), mlJob);
      return {
        studentId: student.id,
        fullName: student.user.fullName,
        email: student.user.email,
        available: result.available,
        probability: result.probability,
      };
    })
  );

  candidates.sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1));
  return { candidates, modelAvailable: candidates.some((c) => c.available) };
}

export async function getModelInfo() {
  return getMlModelInfo();
}
