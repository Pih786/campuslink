import fs from "fs";
import path from "path";
import { ApplicationStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { privateAssignmentDir } from "../../utils/upload";
import { resolveScope } from "../../utils/tenancy";
import { isValidStatusTransition } from "../applications/applications.service";
import { notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";

// Take-home work a recruiter sets for candidates of one job. Each assigned
// candidate gets a submission row; they submit text, a link and/or a file
// before the due date, and the recruiter scores it with feedback.

const ASSIGNABLE: ApplicationStatus[] = ["APPLIED", "ELIGIBLE", "SHORTLISTED", "ASSESSMENT", "INTERVIEW"];
const MOVE_TO_ASSESSMENT: ApplicationStatus[] = ["APPLIED", "ELIGIBLE", "SHORTLISTED"];

const submissionSelect = {
  id: true,
  status: true,
  answerText: true,
  linkUrl: true,
  fileName: true,
  submittedAt: true,
  score: true,
  feedback: true,
  reviewedAt: true,
  applicationId: true,
  student: {
    select: {
      id: true,
      department: true,
      cgpa: true,
      user: { select: { fullName: true, email: true } },
      college: { select: { name: true } },
    },
  },
} satisfies Prisma.AssignmentSubmissionSelect;

async function companyIdFor(userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  if (role !== "RECRUITER" || !scope.companyId) throw forbidden();
  return scope.companyId;
}

async function ownAssignment(userId: string, role: Role, id: string) {
  const companyId = await companyIdFor(userId, role);
  const assignment = await prisma.companyAssignment.findUnique({ where: { id }, include: { job: true } });
  if (!assignment || assignment.companyId !== companyId) throw notFound("Assignment");
  return assignment;
}

async function assignTo(
  assignment: { id: string; jobId: string; title: string; dueAt: Date },
  applicationIds: string[],
  companyName: string
) {
  if (!applicationIds.length) return 0;
  const applications = await prisma.application.findMany({
    where: { id: { in: applicationIds }, jobId: assignment.jobId },
    include: { student: { select: { id: true, userId: true } } },
  });
  if (applications.length !== new Set(applicationIds).size) {
    throw badRequest("Some candidates didn't apply to this job");
  }
  const blocked = applications.filter((a) => !ASSIGNABLE.includes(a.status));
  if (blocked.length) {
    throw badRequest("Assignments can only go to candidates who are still in the running (not rejected or already offered)");
  }

  let added = 0;
  for (const app of applications) {
    const existing = await prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: app.studentId } },
    });
    if (existing) continue;
    await prisma.assignmentSubmission.create({
      data: { assignmentId: assignment.id, applicationId: app.id, studentId: app.studentId },
    });
    if (MOVE_TO_ASSESSMENT.includes(app.status) && isValidStatusTransition(app.status, "ASSESSMENT")) {
      await prisma.application.update({ where: { id: app.id }, data: { status: "ASSESSMENT" } });
    }
    added++;
  }

  const due = assignment.dueAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  await notify(
    applications.map((a) => a.student.userId),
    {
      type: "ASSIGNMENT_RECEIVED",
      title: `${companyName} sent you an assignment`,
      body: `${assignment.title}. Due ${due} IST.`,
      link: "/student/assignments",
    }
  );
  return added;
}

// ------------------------------------------------------------------
// Recruiter
// ------------------------------------------------------------------

export async function listAssignments(userId: string, role: Role, jobId?: string) {
  const companyId = await companyIdFor(userId, role);
  const rows = await prisma.companyAssignment.findMany({
    where: { companyId, ...(jobId ? { jobId } : {}) },
    include: {
      job: { select: { id: true, title: true } },
      submissions: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ submissions, ...a }) => ({
    ...a,
    counts: {
      assigned: submissions.length,
      submitted: submissions.filter((s) => s.status !== "ASSIGNED").length,
      reviewed: submissions.filter((s) => s.status === "REVIEWED").length,
    },
  }));
}

export async function createAssignment(
  userId: string,
  role: Role,
  input: { jobId: string; title: string; instructions: string; dueAt: string; maxScore: number; applicationIds: string[] }
) {
  const companyId = await companyIdFor(userId, role);
  const job = await prisma.job.findUnique({ where: { id: input.jobId }, include: { company: true } });
  if (!job || job.companyId !== companyId) throw notFound("Job");
  const dueAt = new Date(input.dueAt);
  if (dueAt <= new Date()) throw badRequest("Set a due date in the future");

  const assignment = await prisma.companyAssignment.create({
    data: {
      jobId: job.id,
      companyId,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      dueAt,
      maxScore: input.maxScore,
      createdById: userId,
    },
  });
  const assigned = await assignTo(assignment, input.applicationIds, job.company.name);
  return { ...assignment, assigned };
}

export async function addCandidates(userId: string, role: Role, id: string, applicationIds: string[]) {
  const assignment = await ownAssignment(userId, role, id);
  if (assignment.status === "CLOSED") throw badRequest("Reopen the assignment before adding candidates");
  const company = await prisma.company.findUnique({ where: { id: assignment.companyId } });
  return { assigned: await assignTo(assignment, applicationIds, company?.name ?? "A company") };
}

export async function getAssignment(userId: string, role: Role, id: string) {
  const assignment = await ownAssignment(userId, role, id);
  const submissions = await prisma.assignmentSubmission.findMany({
    where: { assignmentId: id },
    select: submissionSelect,
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });
  return { ...assignment, submissions };
}

export async function updateAssignment(
  userId: string,
  role: Role,
  id: string,
  input: { title?: string; instructions?: string; dueAt?: string; status?: "OPEN" | "CLOSED" }
) {
  await ownAssignment(userId, role, id);
  return prisma.companyAssignment.update({
    where: { id },
    data: {
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.instructions ? { instructions: input.instructions.trim() } : {}),
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function reviewSubmission(
  userId: string,
  role: Role,
  submissionId: string,
  input: { score: number; feedback?: string }
) {
  const companyId = await companyIdFor(userId, role);
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: { include: { company: true } }, student: { select: { userId: true } } },
  });
  if (!submission || submission.assignment.companyId !== companyId) throw notFound("Submission");
  if (submission.status === "ASSIGNED") throw badRequest("The candidate hasn't submitted yet");
  if (input.score > submission.assignment.maxScore) {
    throw badRequest(`Score can't be more than ${submission.assignment.maxScore}`);
  }

  const updated = await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      status: "REVIEWED",
      score: input.score,
      feedback: input.feedback?.trim() || null,
      reviewedAt: new Date(),
      reviewedById: userId,
    },
    select: submissionSelect,
  });
  await notify([submission.student.userId], {
    type: "ASSIGNMENT_REVIEWED",
    title: `${submission.assignment.company.name} reviewed your assignment`,
    body: `${submission.assignment.title}: ${input.score}/${submission.assignment.maxScore}.`,
    link: "/student/assignments",
  });
  return updated;
}

// ------------------------------------------------------------------
// Student
// ------------------------------------------------------------------

export async function mySubmissions(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw notFound("Student profile");
  return prisma.assignmentSubmission.findMany({
    where: { studentId: student.id },
    select: {
      id: true,
      status: true,
      answerText: true,
      linkUrl: true,
      fileName: true,
      submittedAt: true,
      score: true,
      feedback: true,
      reviewedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          instructions: true,
          dueAt: true,
          maxScore: true,
          status: true,
          company: { select: { name: true } },
          job: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { assignment: { dueAt: "asc" } },
  });
}

export async function submit(
  userId: string,
  submissionId: string,
  input: { answerText?: string; linkUrl?: string },
  file?: Express.Multer.File
) {
  const cleanup = () => file && fs.promises.unlink(file.path).catch(() => undefined);
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true, user: true } });
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!student || !submission || submission.studentId !== student.id) {
    await cleanup();
    throw notFound("Assignment");
  }
  if (submission.assignment.status === "CLOSED" || submission.assignment.dueAt < new Date()) {
    await cleanup();
    throw badRequest("This assignment is closed for submissions");
  }
  if (submission.status === "REVIEWED") {
    await cleanup();
    throw badRequest("This submission has already been reviewed");
  }
  const answerText = input.answerText?.trim() || null;
  const linkUrl = input.linkUrl?.trim() || null;
  if (!answerText && !linkUrl && !file && !submission.fileUrl) {
    throw badRequest("Add an answer, a link or a file");
  }

  const previousFile = submission.fileUrl;
  const updated = await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      status: "SUBMITTED",
      answerText,
      linkUrl,
      submittedAt: new Date(),
      ...(file ? { fileUrl: file.filename, fileName: file.originalname.slice(0, 200) } : {}),
    },
  });
  if (file && previousFile) {
    fs.promises.unlink(path.join(privateAssignmentDir, path.basename(previousFile))).catch(() => undefined);
  }

  const recruiters = await recruiterUserIdsForCompany(submission.assignment.companyId);
  await notify(recruiters, {
    type: "ASSIGNMENT_SUBMITTED",
    title: `${student.user.fullName} submitted “${submission.assignment.title}”`,
    body: "Open the assignment to review and score it.",
    link: `/recruiter/assignments/${submission.assignmentId}`,
  });
  return updated;
}

// ------------------------------------------------------------------
// File access: the student, the company's recruiters, and the student's
// college placement office.
// ------------------------------------------------------------------

export async function submissionFile(userId: string, role: Role, submissionId: string) {
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true, student: { select: { userId: true, collegeId: true } } },
  });
  if (!submission || !submission.fileUrl) throw notFound("File");

  const scope = await resolveScope(userId, role);
  const allowed =
    scope.isAdmin ||
    (role === "STUDENT" && submission.student.userId === userId) ||
    (role === "RECRUITER" && scope.companyId === submission.assignment.companyId) ||
    (role === "PLACEMENT_OFFICER" && scope.collegeId === submission.student.collegeId);
  if (!allowed) throw notFound("File");

  const fullPath = path.join(privateAssignmentDir, path.basename(submission.fileUrl));
  if (!fs.existsSync(fullPath)) throw notFound("File");
  return { fullPath, fileName: submission.fileName ?? path.basename(fullPath) };
}
