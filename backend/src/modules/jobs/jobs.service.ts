import { Request } from "express";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { findOrCreateSkills, skillKey } from "../skills/skills.service";
import { runAutoShortlist } from "../applications/auto-shortlist";
import { jobsVisibleToCollege, resolveScope, Scope } from "../../utils/tenancy";
import { CreateJobInput, JobRequirementInput, UpdateJobInput } from "./jobs.validators";

const jobInclude = {
  company: true,
  requirements: { include: { skill: true } },
  targetColleges: { include: { college: { select: { id: true, name: true, city: true, state: true } } } },
} as const;

// Validates and normalises who can see a job. Officers can only post for
// their own campus; recruiters and admins choose.
async function resolveVisibility(
  scope: Scope,
  visibility: "GLOBAL" | "SELECTED_COLLEGES" | undefined,
  collegeIds: string[] | undefined
): Promise<{ visibility: "GLOBAL" | "SELECTED_COLLEGES"; collegeIds: string[] }> {
  if (scope.role === "PLACEMENT_OFFICER") {
    return { visibility: "SELECTED_COLLEGES", collegeIds: [scope.collegeId as string] };
  }
  if (!visibility || visibility === "GLOBAL") return { visibility: "GLOBAL", collegeIds: [] };
  const ids = [...new Set(collegeIds ?? [])];
  if (ids.length === 0) throw badRequest("Choose at least one college, or make the job open to all colleges");
  const found = await prisma.college.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw badRequest("One or more selected colleges no longer exist");
  return { visibility: "SELECTED_COLLEGES", collegeIds: ids };
}

// Where-clause for the jobs a caller may see.
function jobsInScope(scope: Scope): Prisma.JobWhereInput {
  if (scope.isAdmin) return {};
  if (scope.role === "RECRUITER") return { companyId: scope.companyId as string };
  return jobsVisibleToCollege(scope.collegeId);
}

async function resolveCompanyIdForWrite(userId: string, role: Role, bodyCompanyId?: string) {
  if (role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId } });
    if (!recruiter) throw notFound("Recruiter profile");
    return recruiter.companyId;
  }
  // PLACEMENT_OFFICER / ADMIN must specify which company this job belongs to.
  if (!bodyCompanyId) {
    throw badRequest("companyId is required when creating a job as this role");
  }
  const company = await prisma.company.findUnique({ where: { id: bodyCompanyId } });
  if (!company) throw notFound("Company");
  return company.id;
}

// Skills are looked up (or created) in one batch before the job transaction
// opens: doing it one by one inside the transaction took longer than
// Prisma's transaction timeout on a remote database.
async function buildRequirementRows(requirements: JobRequirementInput[]) {
  const skillReqs = requirements.filter((r) => r.requirementType === "SKILL" && r.skillName?.trim());
  const skills = await findOrCreateSkills(skillReqs.map((r) => r.skillName!));
  const idByKey = new Map(skills.map((s) => [skillKey(s.name), s.id]));
  // "Java" and "java" in one posting are the same requirement; keep the first.
  const seen = new Set<string>();
  const kept = requirements.filter((r) => {
    if (r.requirementType !== "SKILL") return true;
    if (!r.skillName?.trim()) return false;
    const key = skillKey(r.skillName);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (jobId: string) =>
    kept.map((req) => ({
      jobId,
      requirementType: req.requirementType,
      skillId: req.requirementType === "SKILL" ? idByKey.get(skillKey(req.skillName!)) : undefined,
      minimumProficiency: req.minimumProficiency,
      mandatory: req.mandatory ?? true,
      weight: req.weight ?? 1,
      value: req.value ?? undefined,
    }));
}

export async function createJob(userId: string, role: Role, input: CreateJobInput) {
  const companyId = await resolveCompanyIdForWrite(userId, role, input.companyId);
  const scope = await resolveScope(userId, role);
  const audience = await resolveVisibility(scope, input.visibility, input.collegeIds);
  const requirementRows = await buildRequirementRows(input.requirements ?? []);

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        companyId,
        title: input.title,
        description: input.description,
        location: input.location,
        employmentType: input.employmentType,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        experienceRequired: input.experienceRequired ?? 0,
        status: input.status ?? "DRAFT",
        applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : undefined,
        visibility: audience.visibility,
        autoShortlist: input.autoShortlist ?? false,
        ...(input.autoShortlistMinScore != null ? { autoShortlistMinScore: input.autoShortlistMinScore } : {}),
        targetColleges: { create: audience.collegeIds.map((collegeId) => ({ collegeId })) },
      },
    });

    const rows = requirementRows(created.id);
    if (rows.length > 0) {
      await tx.jobRequirement.createMany({ data: rows });
    }

    return created;
  });

  return prisma.job.findUnique({ where: { id: job.id }, include: jobInclude });
}

export async function getJobById(id: string, userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  // A job the caller can't see is reported exactly like one that doesn't exist.
  const job = await prisma.job.findFirst({ where: { id, ...jobsInScope(scope) }, include: jobInclude });
  if (!job) throw notFound("Job");
  return job;
}

interface ListJobsFilters {
  status?: string;
  companyId?: string;
  title?: string;
}

export async function listJobs(
  req: Request,
  userId: string | undefined,
  role: Role | undefined,
  filters: ListJobsFilters
) {
  const pagination = getPagination(req);

  if (!userId || !role) throw forbidden();
  const scope = await resolveScope(userId, role);
  const where: Prisma.JobWhereInput = { ...jobsInScope(scope) };

  if (role === "STUDENT") {
    where.status = "PUBLISHED";
  } else if (filters.status && ["DRAFT", "PUBLISHED", "CLOSED"].includes(filters.status)) {
    where.status = filters.status as "DRAFT" | "PUBLISHED" | "CLOSED";
  }

  if (filters.companyId && role !== "RECRUITER") where.companyId = filters.companyId;
  if (filters.title) where.title = { contains: filters.title, mode: "insensitive" };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: jobInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.count({ where }),
  ]);

  return paginatedResponse(jobs, total, pagination);
}

export async function updateJob(
  jobId: string,
  userId: string,
  role: Role,
  input: UpdateJobInput
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFound("Job");

  const scope = await resolveScope(userId, role);
  if (role === "RECRUITER" && scope.companyId !== job.companyId) {
    throw forbidden("You do not own this job posting");
  }
  if (role === "PLACEMENT_OFFICER") {
    // Officers may only edit postings made for their own campus alone.
    const targets = await prisma.jobCollege.findMany({ where: { jobId }, select: { collegeId: true } });
    const ownCampusOnly =
      job.visibility === "SELECTED_COLLEGES" && targets.length === 1 && targets[0].collegeId === scope.collegeId;
    if (!ownCampusOnly) throw forbidden("This posting is managed by the recruiter");
  }
  const audience =
    input.visibility !== undefined || input.collegeIds !== undefined
      ? await resolveVisibility(scope, input.visibility ?? job.visibility, input.collegeIds)
      : null;
  const requirementRows = input.requirements ? await buildRequirementRows(input.requirements) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.job.update({
      where: { id: jobId },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        employmentType: input.employmentType,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        experienceRequired: input.experienceRequired,
        status: input.status,
        applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : undefined,
        ...(audience ? { visibility: audience.visibility } : {}),
        autoShortlist: input.autoShortlist,
        autoShortlistMinScore: input.autoShortlistMinScore,
      },
    });

    if (audience) {
      await tx.jobCollege.deleteMany({ where: { jobId } });
      if (audience.collegeIds.length) {
        await tx.jobCollege.createMany({ data: audience.collegeIds.map((collegeId) => ({ jobId, collegeId })) });
      }
    }

    if (requirementRows) {
      await tx.jobRequirement.deleteMany({ where: { jobId } });
      const rows = requirementRows(jobId);
      if (rows.length > 0) {
        await tx.jobRequirement.createMany({ data: rows });
      }
    }

    return result;
  });

  const ruleTouched =
    input.autoShortlist !== undefined || input.autoShortlistMinScore !== undefined || input.status === "PUBLISHED";
  if (updated.autoShortlist && ruleTouched) {
    void runAutoShortlist(updated.id).catch((err) => console.error("[auto-shortlist] run failed", err));
  }

  return prisma.job.findUnique({ where: { id: updated.id }, include: jobInclude });
}
