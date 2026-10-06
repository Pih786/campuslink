import { Request } from "express";
import { NotificationType, notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";
import { Prisma, Role, ApplicationStatus } from "@prisma/client";
import { applicationsInScope, jobsVisibleToCollege, resolveScope } from "../../utils/tenancy";
import { prisma } from "../../config/prisma";
import { badRequest, conflict, notFound, notEligible, forbidden } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import {
  checkEligibility,
  explainEligibility,
  toEligibilityStudent,
  toEligibilityRequirements,
} from "../eligibility/eligibility.service";
import { latestMockInclude, latestMockScore } from "../mock-interviews/mock-interviews.service";
import { runAutoShortlist } from "./auto-shortlist";

const STATUS_RANK: Record<ApplicationStatus, number> = {
  APPLIED: 0,
  ELIGIBLE: 1,
  SHORTLISTED: 2,
  ASSESSMENT: 3,
  INTERVIEW: 4,
  SELECTED: 5,
  OFFERED: 6,
  ACCEPTED: 7,
  JOINED: 8,
  REJECTED: 99,
  DECLINED: 99,
};

const TERMINAL_STATUSES: ApplicationStatus[] = ["JOINED", "REJECTED", "DECLINED"];

export function isValidStatusTransition(
  current: ApplicationStatus,
  next: ApplicationStatus
): boolean {
  if (current === next) return true;
  if (TERMINAL_STATUSES.includes(current)) return false;
  if (next === "REJECTED" || next === "DECLINED") return true;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

const STATUS_NOTIFICATIONS: Partial<Record<ApplicationStatus, { type: NotificationType; title: (job: string, company: string) => string; body: string }>> = {
  SHORTLISTED: {
    type: "APPLICATION_SHORTLISTED",
    title: (job, company) => `Shortlisted: ${job} at ${company}`,
    body: "The recruiter will schedule your interview next. Keep your profile and resume up to date.",
  },
  SELECTED: {
    type: "APPLICATION_SELECTED",
    title: (job, company) => `Selected: ${job} at ${company}`,
    body: "Your offer is being prepared.",
  },
  REJECTED: {
    type: "APPLICATION_REJECTED",
    title: (job, company) => `Update on ${job} at ${company}`,
    body: "The recruiter isn't moving your application forward. Your skill gap page shows what to work on for similar roles.",
  },
};

const applicationInclude = {
  student: {
    include: {
      college: true,
      user: { select: { id: true, email: true, fullName: true } },
    },
  },
  job: { include: { company: true } },
  assignmentSubmissions: {
    select: { id: true, status: true, score: true, assignment: { select: { title: true, maxScore: true } } },
  },
} as const;

export async function createApplication(userId: string, jobId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: { skills: true, ...latestMockInclude },
  });
  if (!student) throw notFound("Student profile");

  // Only jobs open to the student's college exist, as far as they're concerned.
  const job = await prisma.job.findFirst({
    where: { id: jobId, ...jobsVisibleToCollege(student.collegeId) },
    include: { requirements: { include: { skill: true } } },
  });
  if (!job) throw notFound("Job");

  if (job.status !== "PUBLISHED") {
    throw badRequest("This job is not open for applications");
  }

  const existing = await prisma.application.findUnique({
    where: { studentId_jobId: { studentId: student.id, jobId } },
  });
  if (existing) {
    throw conflict("ALREADY_APPLIED", "You have already applied to this job");
  }

  const eligibilityStudent = toEligibilityStudent({
    cgpa: student.cgpa,
    department: student.department,
    backlogCount: student.backlogCount,
    mockInterviewScore: latestMockScore(student),
    skills: student.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
  });
  const eligibilityRequirements = toEligibilityRequirements(job.requirements);

  const eligibility = checkEligibility(eligibilityStudent, eligibilityRequirements);
  const { eligible, reasons } = eligibility;

  if (!eligible) {
    throw notEligible(explainEligibility(eligibility), reasons);
  }

  const application = await prisma.application.create({
    data: {
      studentId: student.id,
      jobId,
      status: "ELIGIBLE",
    },
    include: applicationInclude,
  });

  await prisma.analyticsEvent.create({
    data: {
      actorId: userId,
      actorType: "STUDENT",
      eventType: "JOB_APPLIED",
      entityType: "APPLICATION",
      entityId: application.id,
      metadata: { jobId, reasons },
    },
  });

  await notify(await recruiterUserIdsForCompany(application.job.companyId), {
    type: "APPLICATION_RECEIVED",
    title: `New applicant: ${application.student.user.fullName}`,
    body: `Applied to ${application.job.title}.`,
    link: "/recruiter/pipeline",
  });

  if (job.autoShortlist) {
    const { shortlisted } = await runAutoShortlist(job.id, { applicationIds: [application.id] });
    if (shortlisted) {
      return prisma.application.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude });
    }
  }

  return application;
}

interface ListApplicationsFilters {
  jobId?: string;
  status?: ApplicationStatus;
}

export async function listApplications(
  req: Request,
  userId: string,
  role: Role,
  filters: ListApplicationsFilters
) {
  const pagination = getPagination(req);
  const scope = await resolveScope(userId, role);
  const where: Prisma.ApplicationWhereInput = { ...applicationsInScope(scope) };

  if (filters.jobId) where.jobId = filters.jobId;
  if (filters.status) where.status = filters.status;

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: applicationInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { appliedAt: "desc" },
    }),
    prisma.application.count({ where }),
  ]);

  return paginatedResponse(applications, total, pagination);
}

export async function updateApplicationStatus(
  applicationId: string,
  userId: string,
  role: Role,
  nextStatus: ApplicationStatus
) {
  const scope = await resolveScope(userId, role);
  const application = await prisma.application.findFirst({
    where: { id: applicationId, ...applicationsInScope(scope) },
    include: { job: true },
  });
  if (!application) throw notFound("Application");

  if (!isValidStatusTransition(application.status, nextStatus)) {
    throw badRequest(
      `Cannot transition application from ${application.status} to ${nextStatus}`
    );
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status: nextStatus },
    include: applicationInclude,
  });

  const message = STATUS_NOTIFICATIONS[nextStatus];
  if (message) {
    await notify([updated.student.user.id], {
      type: message.type,
      title: message.title(updated.job.title, updated.job.company.name),
      body: message.body,
      link: nextStatus === "REJECTED" ? "/student/skill-gap" : "/student/applications",
    });
  }

  return updated;
}
