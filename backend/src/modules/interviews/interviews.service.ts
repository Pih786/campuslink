import { Request } from "express";
import { notify } from "../notifications/notifications.service";
import { Prisma, Role, InterviewStatus } from "@prisma/client";
import { applicationsInScope, resolveScope } from "../../utils/tenancy";
import { prisma } from "../../config/prisma";
import { ApiError, forbidden, notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { isValidStatusTransition } from "../applications/applications.service";
import { CreateInterviewInput, UpdateInterviewInput } from "./interviews.validators";

const interviewInclude = {
  application: {
    include: {
      student: { include: { user: { select: { id: true, email: true, fullName: true } } } },
      job: { include: { company: true } },
    },
  },
} as const;

const MAX_SLOT_SEARCH_STEPS = 50;

interface BusyInterval {
  start: Date;
  end: Date;
}

async function findBusyIntervals(
  studentId: string,
  panel: string | undefined,
  excludeInterviewId?: string
): Promise<BusyInterval[]> {
  const scheduled = await prisma.interview.findMany({
    where: {
      status: "SCHEDULED",
      id: excludeInterviewId ? { not: excludeInterviewId } : undefined,
      OR: [{ application: { studentId } }, ...(panel ? [{ panel }] : [])],
    },
  });
  return scheduled.map((iv) => ({
    start: iv.scheduledAt,
    end: new Date(iv.scheduledAt.getTime() + iv.duration * 60000),
  }));
}

// Earliest start time at or after `from` where a `durationMinutes` slot
// overlaps none of the busy intervals — used to suggest an alternative
// when a requested slot conflicts.
function findNextFreeSlot(busy: BusyInterval[], from: Date, durationMinutes: number): Date | null {
  let candidate = from;
  for (let step = 0; step < MAX_SLOT_SEARCH_STEPS; step++) {
    const candidateEnd = new Date(candidate.getTime() + durationMinutes * 60000);
    const blocking = busy.filter((b) => candidate < b.end && b.start < candidateEnd);
    if (blocking.length === 0) return candidate;
    candidate = new Date(Math.max(...blocking.map((b) => b.end.getTime())));
  }
  return null;
}

async function assertNoConflict(
  studentId: string,
  panel: string | undefined,
  start: Date,
  durationMinutes: number,
  excludeInterviewId?: string
) {
  const busy = await findBusyIntervals(studentId, panel, excludeInterviewId);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const hasConflict = busy.some((b) => start < b.end && b.start < end);
  if (!hasConflict) return;

  const suggestedSlot = findNextFreeSlot(busy, start, durationMinutes);
  throw new ApiError(
    409,
    "INTERVIEW_CONFLICT",
    "This time slot overlaps with an existing scheduled interview for the same student or panel",
    { suggestedSlot: suggestedSlot?.toISOString() ?? null }
  );
}

// Recruiters manage their own company's applications; officers only their
// own college's students; admins anything.
async function assertCanManageApplication(userId: string, role: Role, applicationId: string) {
  const scope = await resolveScope(userId, role);
  const count = await prisma.application.count({ where: { id: applicationId, ...applicationsInScope(scope) } });
  if (!count) throw forbidden("You do not have access to this application");
}

export async function createInterview(userId: string, role: Role, input: CreateInterviewInput) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: { job: true },
  });
  if (!application) throw notFound("Application");
  await assertCanManageApplication(userId, role, application.id);

  const scheduledAt = new Date(input.scheduledAt);
  await assertNoConflict(application.studentId, input.panel, scheduledAt, input.duration);

  const created = await prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        applicationId: input.applicationId,
        round: input.round,
        panel: input.panel,
        scheduledAt,
        duration: input.duration,
        venue: input.venue,
        meetingUrl: input.meetingUrl,
      },
      include: interviewInclude,
    });

    if (
      application.status !== "INTERVIEW" &&
      isValidStatusTransition(application.status, "INTERVIEW")
    ) {
      await tx.application.update({
        where: { id: application.id },
        data: { status: "INTERVIEW" },
      });
    }

    return interview;
  });

  await notifyInterview(created.id, "INTERVIEW_SCHEDULED");
  return created;
}

const INTERVIEW_TITLES = {
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_RESCHEDULED: "Interview rescheduled",
  INTERVIEW_CANCELLED: "Interview cancelled",
} as const;

async function notifyInterview(interviewId: string, type: keyof typeof INTERVIEW_TITLES) {
  const iv = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { application: { include: { student: true, job: { include: { company: true } } } } },
  });
  if (!iv) return;
  const when = iv.scheduledAt.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const where = iv.meetingUrl ? " (online)" : iv.venue ? ` at ${iv.venue}` : "";
  await notify([iv.application.student.userId], {
    type,
    title: `${INTERVIEW_TITLES[type]}: ${iv.application.job.company.name}`,
    body:
      type === "INTERVIEW_CANCELLED"
        ? `The ${iv.round ?? "interview"} round on ${when} was cancelled.`
        : `${iv.round ?? "Interview"} round, ${when}${where}, ${iv.duration} minutes.`,
    link: "/student/interviews",
  });
}

interface ListInterviewsFilters {
  applicationId?: string;
  status?: InterviewStatus;
}

export async function listInterviews(
  req: Request,
  userId: string,
  role: Role,
  filters: ListInterviewsFilters
) {
  const pagination = getPagination(req);
  const scope = await resolveScope(userId, role);
  const where: Prisma.InterviewWhereInput = { application: applicationsInScope(scope) };

  if (filters.applicationId) where.applicationId = filters.applicationId;
  if (filters.status) where.status = filters.status;

  const [interviews, total] = await Promise.all([
    prisma.interview.findMany({
      where,
      include: interviewInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { scheduledAt: "desc" },
    }),
    prisma.interview.count({ where }),
  ]);

  return paginatedResponse(interviews, total, pagination);
}

export async function updateInterview(
  interviewId: string,
  userId: string,
  role: Role,
  input: UpdateInterviewInput
) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { application: true },
  });
  if (!interview) throw notFound("Interview");

  await assertCanManageApplication(userId, role, interview.applicationId);

  const nextScheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : interview.scheduledAt;
  const nextDuration = input.duration ?? interview.duration;
  const nextPanel = input.panel ?? interview.panel ?? undefined;

  if (input.scheduledAt || input.duration || input.panel) {
    await assertNoConflict(
      interview.application.studentId,
      nextPanel,
      nextScheduledAt,
      nextDuration,
      interviewId
    );
  }

  const updated = await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: input.status,
      score: input.score,
      feedback: input.feedback,
      scheduledAt: input.scheduledAt ? nextScheduledAt : undefined,
      duration: input.duration,
      venue: input.venue,
      meetingUrl: input.meetingUrl,
      round: input.round,
      panel: input.panel,
    },
    include: interviewInclude,
  });

  const moved = Boolean(input.scheduledAt) && nextScheduledAt.getTime() !== interview.scheduledAt.getTime();
  if (input.status === "CANCELLED" && interview.status !== "CANCELLED") {
    await notifyInterview(interviewId, "INTERVIEW_CANCELLED");
  } else if (moved) {
    await notifyInterview(interviewId, "INTERVIEW_RESCHEDULED");
  }

  return updated;
}
