import { Request } from "express";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError, badRequest, forbidden, notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { CheckDriveInput, CreateDriveInput } from "./drives.validators";
import { DriveConflict, DriveSlot, detectDriveConflicts, suggestDriveSlot } from "./drive-conflicts";
import {
  checkEligibility,
  JobRequirementLike,
  toEligibilityRequirements,
  toEligibilityStudent,
} from "../eligibility/eligibility.service";
import { latestMockInclude, latestMockScore } from "../mock-interviews/mock-interviews.service";
import { notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";
import { jobsVisibleToCollege, resolveScope, Scope } from "../../utils/tenancy";

const driveInclude = { company: true, job: true, college: { select: { id: true, name: true } } } as const;

const IN_PROCESS_STATUSES = ["APPLIED", "ELIGIBLE", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED"] as const;

// Venues and students are per campus, so clashes are checked within one college.
async function loadScheduleContext(collegeId: string, excludeDriveId?: string) {
  const [drives, applications] = await Promise.all([
    prisma.drive.findMany({
      where: {
        collegeId,
        status: { not: "CANCELLED" },
        ...(excludeDriveId ? { id: { not: excludeDriveId } } : {}),
      },
      include: driveInclude,
    }),
    prisma.application.findMany({
      where: { status: { in: [...IN_PROCESS_STATUSES] }, student: { collegeId } },
      select: { jobId: true, studentId: true },
    }),
  ]);

  const others: DriveSlot[] = drives.map((d) => ({
    id: d.id,
    jobId: d.jobId,
    start: d.date,
    durationMinutes: d.durationMinutes,
    venue: d.venue,
    label: `${d.company.name} · ${d.job.title}`,
  }));

  const studentsByJob = new Map<string, Set<string>>();
  for (const app of applications) {
    const set = studentsByJob.get(app.jobId) ?? new Set<string>();
    set.add(app.studentId);
    studentsByJob.set(app.jobId, set);
  }

  return { others, studentsByJob };
}

async function withStudentNames(conflicts: DriveConflict[]) {
  const ids = [...new Set(conflicts.flatMap((c) => c.sharedStudentIds ?? []))];
  if (ids.length === 0) return conflicts.map((c) => ({ ...c, sharedStudents: [] as string[] }));
  const students = await prisma.student.findMany({
    where: { id: { in: ids } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  const names = new Map(students.map((s) => [s.id, s.user.fullName]));
  return conflicts.map((c) => ({
    ...c,
    sharedStudents: (c.sharedStudentIds ?? []).map((id) => names.get(id) ?? "Student"),
  }));
}

// The college a drive is scheduled for: the officer's own, or (admins) the one given.
export async function driveCollegeFor(scope: Scope, requestedCollegeId?: string) {
  if (scope.isAdmin) {
    if (!requestedCollegeId) throw badRequest("collegeId is required when an admin schedules a drive");
    return requestedCollegeId;
  }
  return scope.collegeId as string;
}

export async function checkDriveSchedule(input: CheckDriveInput, collegeId: string) {
  const start = new Date(input.date);
  if (Number.isNaN(start.getTime())) throw badRequest("A valid date is required");

  const { others, studentsByJob } = await loadScheduleContext(collegeId, input.excludeDriveId);
  const candidate: DriveSlot = {
    id: input.excludeDriveId,
    jobId: input.jobId,
    start,
    durationMinutes: input.durationMinutes ?? 240,
    venue: input.venue,
  };
  const conflicts = detectDriveConflicts(candidate, others, studentsByJob);
  const needsAnotherSlot = conflicts.some((c) => c.severity !== "info");
  const suggestedSlot = needsAnotherSlot ? suggestDriveSlot(candidate, others, studentsByJob) : null;

  return {
    conflicts: await withStudentNames(conflicts),
    blocking: conflicts.some((c) => c.severity === "blocking"),
    suggestedSlot: suggestedSlot?.toISOString() ?? null,
  };
}

export async function createDrive(input: CreateDriveInput, userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  const collegeId = await driveCollegeFor(scope, input.collegeId);
  const [company, job] = await Promise.all([
    prisma.company.findUnique({ where: { id: input.companyId } }),
    // A campus drive can only be for a job that is open to that campus.
    prisma.job.findFirst({
      where: { id: input.jobId, ...jobsVisibleToCollege(collegeId) },
      include: { requirements: { include: { skill: true } } },
    }),
  ]);
  if (!company) throw notFound("Company");
  if (!job) throw badRequest("That job isn't open to your college");
  if (job.companyId !== company.id) throw badRequest("That job belongs to a different company");

  const schedule = await checkDriveSchedule(
    {
      jobId: input.jobId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      venue: input.venue,
    },
    collegeId
  );
  if (schedule.blocking) {
    throw new ApiError(409, "DRIVE_CONFLICT", "The venue is already booked for an overlapping drive", {
      conflicts: schedule.conflicts,
      suggestedSlot: schedule.suggestedSlot,
    });
  }

  const drive = await prisma.drive.create({
    data: {
      companyId: input.companyId,
      jobId: input.jobId,
      collegeId,
      date: new Date(input.date),
      durationMinutes: input.durationMinutes ?? 240,
      venue: input.venue,
      capacity: input.capacity,
      applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : undefined,
      status: input.status ?? "SCHEDULED",
    },
    include: driveInclude,
  });

  await announceDrive(drive, collegeId, job.requirements);

  return { ...drive, warnings: schedule.conflicts };
}

// Announcements go only to students who meet the role's hard criteria, so
// nobody is invited to a drive they can't apply to.
async function announceDrive(
  drive: { date: Date; venue: string | null; companyId: string; company: { name: string }; job: { title: string } },
  collegeId: string,
  jobRequirements: JobRequirementLike[]
) {
  const students = await prisma.student.findMany({ where: { collegeId }, include: { skills: true, ...latestMockInclude } });
  const requirements = toEligibilityRequirements(jobRequirements);
  const eligibleUserIds = students
    .filter(
      (s) =>
        checkEligibility(
          toEligibilityStudent({
            cgpa: s.cgpa,
            department: s.department,
            backlogCount: s.backlogCount,
            mockInterviewScore: latestMockScore(s),
            skills: s.skills.map((k) => ({ skillId: k.skillId, proficiency: k.proficiency })),
          }),
          requirements
        ).eligible
    )
    .map((s) => s.userId);

  const when = drive.date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const title = `Drive: ${drive.company.name}, ${drive.job.title}`;
  const where = drive.venue ? ` at ${drive.venue}` : "";

  await notify(eligibleUserIds, {
    type: "DRIVE_ANNOUNCED",
    title,
    body: `${when}${where}. You meet this role's eligibility criteria.`,
    link: "/student/jobs",
  });
  await notify(await recruiterUserIdsForCompany(drive.companyId), {
    type: "DRIVE_ANNOUNCED",
    title,
    body: `Scheduled for ${when}${where}. ${eligibleUserIds.length} students are eligible.`,
    link: "/recruiter/pipeline",
  });
}

export async function getDriveById(id: string) {
  const drive = await prisma.drive.findUnique({ where: { id }, include: driveInclude });
  if (!drive) throw notFound("Drive");
  return drive;
}

export async function assertDriveAccess(driveId: string, userId: string, role: Role) {
  const drive = await prisma.drive.findUnique({ where: { id: driveId }, select: { companyId: true, collegeId: true } });
  if (!drive) throw notFound("Drive");
  const scope = await resolveScope(userId, role);
  if (scope.isAdmin) return;
  if (role === "RECRUITER" && scope.companyId === drive.companyId) return;
  if ((role === "PLACEMENT_OFFICER" || role === "MENTOR") && scope.collegeId === drive.collegeId) return;
  throw notFound("Drive");
}

export async function listDrives(req: Request, userId: string, role: Role) {
  const pagination = getPagination(req);
  const scope = await resolveScope(userId, role);
  const where: Prisma.DriveWhereInput = {};
  if (role === "RECRUITER") where.companyId = scope.companyId as string;
  else if (!scope.isAdmin) where.collegeId = scope.collegeId ?? "__none__";

  const [drives, total] = await Promise.all([
    prisma.drive.findMany({
      where,
      include: driveInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { date: "desc" },
    }),
    prisma.drive.count({ where }),
  ]);

  return paginatedResponse(drives, total, pagination);
}

interface ConflictEntry {
  type: "STUDENT_DOUBLE_BOOKED" | "PANEL_DOUBLE_BOOKED";
  interviewIds: [string, string];
  studentId?: string;
  panel?: string;
}

export async function getDriveConflicts(driveId: string) {
  const drive = await prisma.drive.findUnique({ where: { id: driveId } });
  if (!drive) throw notFound("Drive");

  const applications = await prisma.application.findMany({
    where: { jobId: drive.jobId, ...(drive.collegeId ? { student: { collegeId: drive.collegeId } } : {}) },
    include: { interviews: true },
  });

  const slots: { id: string; studentId: string; panel: string | null; start: Date; end: Date }[] = [];
  for (const app of applications) {
    for (const iv of app.interviews) {
      if (iv.status === "CANCELLED") continue;
      const start = new Date(iv.scheduledAt);
      const end = new Date(start.getTime() + iv.duration * 60000);
      slots.push({ id: iv.id, studentId: app.studentId, panel: iv.panel, start, end });
    }
  }

  const conflicts: ConflictEntry[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const overlaps = a.start < b.end && b.start < a.end;
      if (!overlaps) continue;

      if (a.studentId === b.studentId) {
        conflicts.push({ type: "STUDENT_DOUBLE_BOOKED", interviewIds: [a.id, b.id], studentId: a.studentId });
      }
      if (a.panel && b.panel && a.panel === b.panel) {
        conflicts.push({ type: "PANEL_DOUBLE_BOOKED", interviewIds: [a.id, b.id], panel: a.panel });
      }
    }
  }

  const schedule = drive.collegeId
    ? await checkDriveSchedule(
        {
          jobId: drive.jobId,
          date: drive.date.toISOString(),
          durationMinutes: drive.durationMinutes,
          venue: drive.venue ?? undefined,
          excludeDriveId: drive.id,
        },
        drive.collegeId
      )
    : { conflicts: [], blocking: false, suggestedSlot: null };
  const driveConflicts = schedule.conflicts.filter((c) => c.severity !== "info");

  return {
    driveId,
    conflictCount: conflicts.length + driveConflicts.length,
    conflicts,
    driveConflicts,
    parallelDrives: schedule.conflicts.filter((c) => c.severity === "info"),
    suggestedSlot: schedule.suggestedSlot,
  };
}
