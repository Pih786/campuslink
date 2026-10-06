import { EscalationStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { resolveScope, Scope } from "../../utils/tenancy";
import { notify } from "../notifications/notifications.service";
import { getPlacementInsights } from "../analytics/insights.service";

// Mentors are approved staff of one college. The placement office assigns
// students to them and escalates at-risk students; mentors work their
// caseload with notes and follow-ups and resolve escalations.

const studentSummary = {
  id: true,
  department: true,
  cgpa: true,
  graduationYear: true,
  profileCompletion: true,
  user: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.StudentSelect;

const escalationInclude = {
  student: { select: studentSummary },
  mentor: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.EscalationInclude;

async function collegeScope(userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  if (!scope.collegeId) throw forbidden("This action needs a college account");
  return scope as Scope & { collegeId: string };
}

async function assertMentorOfCollege(mentorId: string, collegeId: string) {
  const staff = await prisma.collegeStaff.findUnique({ where: { userId: mentorId }, include: { user: true } });
  if (!staff || staff.collegeId !== collegeId || staff.status !== "APPROVED" || staff.user.role !== "MENTOR") {
    throw badRequest("Choose an approved mentor from your college");
  }
  return staff.user;
}

async function studentsOfCollege(studentIds: string[], collegeId: string) {
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, collegeId },
    select: { id: true, userId: true },
  });
  if (students.length !== new Set(studentIds).size) throw notFound("Student");
  return students;
}

// A mentor may work with their own mentees and anyone escalated to them;
// the placement office may work with any student of the college.
async function assertCanWorkWith(scope: Scope & { collegeId: string }, studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { collegeId: true, mentorAssignment: true },
  });
  if (!student || student.collegeId !== scope.collegeId) throw notFound("Student");
  if (scope.role === "MENTOR") {
    const escalated = await prisma.escalation.count({ where: { studentId, mentorId: scope.userId } });
    if (student.mentorAssignment?.mentorId !== scope.userId && !escalated) {
      throw forbidden("This student isn't assigned to you");
    }
  }
}

// ------------------------------------------------------------------
// Placement office: mentors, assignments, at-risk queue
// ------------------------------------------------------------------

export async function listMentors(userId: string, role: Role) {
  const scope = await collegeScope(userId, role);
  const mentors = await prisma.collegeStaff.findMany({
    where: { collegeId: scope.collegeId, status: "APPROVED", user: { role: "MENTOR" } },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { user: { fullName: "asc" } },
  });
  const ids = mentors.map((m) => m.userId);
  const [mentees, open] = await Promise.all([
    prisma.mentorAssignment.groupBy({ by: ["mentorId"], where: { mentorId: { in: ids } }, _count: true }),
    prisma.escalation.groupBy({
      by: ["mentorId"],
      where: { mentorId: { in: ids }, status: { not: "RESOLVED" } },
      _count: true,
    }),
  ]);
  const menteeCount = new Map(mentees.map((m) => [m.mentorId, m._count]));
  const openCount = new Map(open.map((o) => [o.mentorId, o._count]));
  return mentors.map((m) => ({
    id: m.user.id,
    fullName: m.user.fullName,
    email: m.user.email,
    designation: m.designation,
    mentees: menteeCount.get(m.userId) ?? 0,
    openEscalations: openCount.get(m.userId) ?? 0,
  }));
}

export async function assignMentor(userId: string, role: Role, studentIds: string[], mentorId: string) {
  const scope = await collegeScope(userId, role);
  const mentor = await assertMentorOfCollege(mentorId, scope.collegeId);
  const students = await studentsOfCollege(studentIds, scope.collegeId);

  for (const s of students) {
    await prisma.mentorAssignment.upsert({
      where: { studentId: s.id },
      update: { mentorId, assignedById: userId },
      create: { studentId: s.id, mentorId, assignedById: userId },
    });
  }
  // Open escalations follow the student to the new mentor.
  await prisma.escalation.updateMany({
    where: { studentId: { in: students.map((s) => s.id) }, status: { not: "RESOLVED" } },
    data: { mentorId },
  });

  await notify([mentorId], {
    type: "ESCALATION",
    title: students.length === 1 ? "A student was assigned to you" : `${students.length} students were assigned to you`,
    body: "Open your mentees to see their readiness and next steps.",
    link: "/mentor/mentees",
  });
  await notify(
    students.map((s) => s.userId),
    {
      type: "PLACEMENT_SUPPORT",
      title: `${mentor.fullName} is now your placement mentor`,
      body: `Reach out at ${mentor.email} for help with your preparation.`,
      link: "/student/dashboard",
    }
  );
  return { assigned: students.length, mentor: { id: mentor.id, fullName: mentor.fullName } };
}

export async function unassignMentor(userId: string, role: Role, studentId: string) {
  const scope = await collegeScope(userId, role);
  await studentsOfCollege([studentId], scope.collegeId);
  await prisma.mentorAssignment.deleteMany({ where: { studentId } });
  return { unassigned: true };
}

// The insights at-risk list joined with who is looking after each student.
export async function atRiskQueue(userId: string, role: Role) {
  const scope = await collegeScope(userId, role);
  const insights = await getPlacementInsights(scope.collegeId);
  const ids = insights.atRisk.map((s) => s.studentId);
  const [assignments, escalations] = await Promise.all([
    prisma.mentorAssignment.findMany({
      where: { studentId: { in: ids } },
      include: { mentor: { select: { id: true, fullName: true } } },
    }),
    prisma.escalation.findMany({
      where: { studentId: { in: ids }, status: { not: "RESOLVED" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const mentorOf = new Map(assignments.map((a) => [a.studentId, a.mentor]));
  const openEscalation = new Map<string, (typeof escalations)[number]>();
  for (const e of escalations) if (!openEscalation.has(e.studentId)) openEscalation.set(e.studentId, e);

  return {
    total: insights.atRiskTotal,
    students: insights.atRisk.map((s) => ({
      ...s,
      mentor: mentorOf.get(s.studentId) ?? null,
      escalation: openEscalation.has(s.studentId)
        ? { id: openEscalation.get(s.studentId)!.id, status: openEscalation.get(s.studentId)!.status }
        : null,
    })),
  };
}

// ------------------------------------------------------------------
// Escalations
// ------------------------------------------------------------------

export async function createEscalation(
  userId: string,
  role: Role,
  input: { studentId: string; reason: string; mentorId?: string }
) {
  const scope = await collegeScope(userId, role);
  const [student] = await studentsOfCollege([input.studentId], scope.collegeId);

  let mentorId = input.mentorId;
  if (mentorId) {
    await assignMentor(userId, role, [student.id], mentorId);
  } else {
    const assignment = await prisma.mentorAssignment.findUnique({ where: { studentId: student.id } });
    mentorId = assignment?.mentorId;
  }
  if (!mentorId) throw badRequest("Assign a mentor to this student first, or choose one now");

  const existing = await prisma.escalation.findFirst({
    where: { studentId: student.id, status: { not: "RESOLVED" } },
  });
  if (existing) throw badRequest("This student already has an open escalation");

  // Snapshot the risk factors at the time of escalation.
  const insights = await getPlacementInsights(scope.collegeId);
  const risk = insights.atRisk.find((s) => s.studentId === student.id);

  const escalation = await prisma.escalation.create({
    data: {
      studentId: student.id,
      mentorId,
      raisedById: userId,
      reason: input.reason.trim(),
      factors: risk ? (risk.factors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      riskScore: risk?.score ?? null,
    },
    include: escalationInclude,
  });

  await notify([mentorId], {
    type: "ESCALATION",
    title: `${escalation.student.user.fullName} needs your support`,
    body: input.reason.trim().slice(0, 240),
    link: "/mentor/escalations",
  });
  return escalation;
}

export async function listEscalations(userId: string, role: Role, status?: EscalationStatus) {
  const scope = await collegeScope(userId, role);
  const where: Prisma.EscalationWhereInput = {
    student: { collegeId: scope.collegeId },
    ...(status ? { status } : {}),
    ...(role === "MENTOR" ? { mentorId: userId } : {}),
  };
  const rows = await prisma.escalation.findMany({
    where,
    include: escalationInclude,
    orderBy: [{ status: "asc" }, { riskScore: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const raisers = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.raisedById).filter((id): id is string => Boolean(id)) } },
    select: { id: true, fullName: true },
  });
  const raisedBy = new Map(raisers.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, raisedBy: r.raisedById ? raisedBy.get(r.raisedById) ?? null : null }));
}

export async function updateEscalation(
  userId: string,
  role: Role,
  id: string,
  input: { status: EscalationStatus; resolution?: string }
) {
  const scope = await collegeScope(userId, role);
  const escalation = await prisma.escalation.findUnique({ where: { id }, include: escalationInclude });
  if (!escalation) throw notFound("Escalation");
  const student = await prisma.student.findUnique({ where: { id: escalation.studentId }, select: { collegeId: true } });
  if (student?.collegeId !== scope.collegeId) throw notFound("Escalation");
  if (role === "MENTOR" && escalation.mentorId !== userId) throw forbidden("This escalation isn't assigned to you");
  if (input.status === "RESOLVED" && !input.resolution?.trim()) {
    throw badRequest("Add a short note on how this was resolved");
  }

  const updated = await prisma.escalation.update({
    where: { id },
    data: {
      status: input.status,
      resolution: input.resolution?.trim() || escalation.resolution,
      resolvedAt: input.status === "RESOLVED" ? new Date() : null,
    },
    include: escalationInclude,
  });

  if (input.status === "RESOLVED" && escalation.raisedById && escalation.raisedById !== userId) {
    await notify([escalation.raisedById], {
      type: "ESCALATION",
      title: `Escalation resolved: ${escalation.student.user.fullName}`,
      body: input.resolution!.trim().slice(0, 240),
      link: "/placement/mentoring",
    });
  }
  return updated;
}

// ------------------------------------------------------------------
// Mentor workspace
// ------------------------------------------------------------------

export async function listMentees(userId: string, role: Role) {
  const scope = await collegeScope(userId, role);
  const where: Prisma.StudentWhereInput =
    role === "MENTOR"
      ? { collegeId: scope.collegeId, mentorAssignment: { mentorId: userId } }
      : { collegeId: scope.collegeId, mentorAssignment: { isNot: null } };

  const students = await prisma.student.findMany({
    where,
    select: {
      ...studentSummary,
      mentorAssignment: { select: { createdAt: true, mentor: { select: { id: true, fullName: true } } } },
      applications: { select: { status: true } },
      offers: { select: { acceptanceStatus: true } },
      escalations: { where: { status: { not: "RESOLVED" } }, select: { id: true, status: true, riskScore: true } },
      mentorNotes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, followUpAt: true, body: true } },
      learningProgress: { select: { status: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  const insights = await getPlacementInsights(scope.collegeId);
  const risk = new Map(insights.atRisk.map((r) => [r.studentId, r]));
  const nextFollowUps = await prisma.mentorNote.groupBy({
    by: ["studentId"],
    where: { studentId: { in: students.map((s) => s.id) }, followUpAt: { gte: new Date() } },
    _min: { followUpAt: true },
  });
  const followUp = new Map(nextFollowUps.map((f) => [f.studentId, f._min.followUpAt]));

  return students.map((s) => ({
    id: s.id,
    user: s.user,
    department: s.department,
    cgpa: s.cgpa,
    graduationYear: s.graduationYear,
    profileCompletion: s.profileCompletion,
    mentor: s.mentorAssignment?.mentor ?? null,
    assignedAt: s.mentorAssignment?.createdAt ?? null,
    applications: s.applications.length,
    placed: s.offers.some((o) => o.acceptanceStatus === "ACCEPTED"),
    openEscalation: s.escalations[0] ?? null,
    risk: risk.get(s.id) ? { level: risk.get(s.id)!.level, score: risk.get(s.id)!.score } : null,
    lastNote: s.mentorNotes[0] ?? null,
    nextFollowUp: followUp.get(s.id) ?? null,
    learningCompleted: s.learningProgress.filter((p) => p.status === "COMPLETED").length,
  }));
}

export async function mentorOverview(userId: string, role: Role) {
  const mentees = await listMentees(userId, role);
  const scope = await collegeScope(userId, role);
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const escalations = await prisma.escalation.findMany({
    where: {
      student: { collegeId: scope.collegeId },
      status: { not: "RESOLVED" },
      ...(role === "MENTOR" ? { mentorId: userId } : {}),
    },
    include: escalationInclude,
    orderBy: [{ riskScore: "desc" }, { createdAt: "asc" }],
  });
  return {
    stats: {
      mentees: mentees.length,
      atRisk: mentees.filter((m) => m.risk && m.risk.level !== "Low").length,
      openEscalations: escalations.length,
      followUpsThisWeek: mentees.filter((m) => m.nextFollowUp && m.nextFollowUp <= weekAhead).length,
      placed: mentees.filter((m) => m.placed).length,
    },
    escalations: escalations.slice(0, 6),
    followUps: mentees
      .filter((m) => m.nextFollowUp)
      .sort((a, b) => +a.nextFollowUp! - +b.nextFollowUp!)
      .slice(0, 6)
      .map((m) => ({ studentId: m.id, name: m.user.fullName, followUpAt: m.nextFollowUp })),
  };
}

// ------------------------------------------------------------------
// Notes
// ------------------------------------------------------------------

export async function listNotes(userId: string, role: Role, studentId: string) {
  const scope = await collegeScope(userId, role);
  await assertCanWorkWith(scope, studentId);
  return prisma.mentorNote.findMany({
    where: { studentId },
    include: { author: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function addNote(userId: string, role: Role, studentId: string, input: { body: string; followUpAt?: string }) {
  const scope = await collegeScope(userId, role);
  await assertCanWorkWith(scope, studentId);
  const followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
  if (followUpAt && Number.isNaN(+followUpAt)) throw badRequest("Invalid follow-up date");
  return prisma.mentorNote.create({
    data: { studentId, authorId: userId, body: input.body.trim(), followUpAt },
    include: { author: { select: { id: true, fullName: true, role: true } } },
  });
}

// ------------------------------------------------------------------
// Student side
// ------------------------------------------------------------------

export async function myMentor(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { mentorAssignment: { include: { mentor: { select: { id: true, fullName: true, email: true } } } } },
  });
  if (!student) throw notFound("Student profile");
  const mentor = student.mentorAssignment?.mentor;
  if (!mentor) return { mentor: null };
  const staff = await prisma.collegeStaff.findUnique({ where: { userId: mentor.id }, select: { designation: true } });
  return { mentor: { ...mentor, designation: staff?.designation ?? null } };
}

// Everything a mentor needs on one student, in one call.
export async function studentOverview(userId: string, role: Role, studentId: string) {
  const scope = await collegeScope(userId, role);
  await assertCanWorkWith(scope, studentId);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      skills: { include: { skill: true }, orderBy: { proficiency: "desc" } },
      projects: { orderBy: { createdAt: "desc" } },
      certifications: true,
      applications: {
        include: { job: { select: { id: true, title: true, company: { select: { name: true } } } } },
        orderBy: { updatedAt: "desc" },
      },
      offers: { select: { id: true, acceptanceStatus: true, joiningStatus: true, ctc: true, company: { select: { name: true } } } },
      mentorAssignment: { include: { mentor: { select: { id: true, fullName: true } } } },
      escalations: { include: escalationInclude, orderBy: { createdAt: "desc" } },
      learningProgress: {
        include: { resource: { select: { id: true, title: true, url: true, skill: { select: { name: true } } } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!student) throw notFound("Student");
  const insights = await getPlacementInsights(scope.collegeId);
  const risk = insights.atRisk.find((r) => r.studentId === studentId) ?? null;
  const { learningProgress, mentorAssignment, ...rest } = student;
  return {
    ...rest,
    mentor: mentorAssignment?.mentor ?? null,
    risk,
    learning: learningProgress.map((p) => ({ status: p.status, updatedAt: p.updatedAt, resource: p.resource })),
  };
}
