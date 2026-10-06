import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { resolveScope } from "../../utils/tenancy";
import { notify } from "../notifications/notifications.service";

const SEARCH_LIMIT = 20;

export async function searchColleges({ q, state, limit }: { q?: string; state?: string; limit?: number }) {
  const query = q?.trim() ?? "";
  const where: Prisma.CollegeWhereInput = {
    ...(state ? { state } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { city: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const colleges = await prisma.college.findMany({
    where,
    select: { id: true, name: true, city: true, state: true, category: true, verified: true },
    orderBy: [{ verified: "desc" }, { name: "asc" }],
    take: Math.min(Math.max(limit ?? SEARCH_LIMIT, 1), 50),
  });
  // Names that start with the query first ("NIT" → NIT Warangal before Visvesvaraya NIT).
  if (query) {
    const lower = query.toLowerCase();
    colleges.sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(lower)) - Number(a.name.toLowerCase().startsWith(lower)) ||
        Number(b.verified) - Number(a.verified) ||
        a.name.localeCompare(b.name)
    );
  }
  return colleges;
}

export async function getCollege(id: string) {
  const college = await prisma.college.findUnique({
    where: { id },
    select: { id: true, name: true, city: true, state: true, category: true, verified: true },
  });
  if (!college) throw notFound("College");
  return college;
}

// ------------------------------------------------------------------
// Staff (officer / mentor) approval
// ------------------------------------------------------------------

async function canReview(reviewerId: string, reviewerRole: Role, collegeId: string, targetRole: Role) {
  if (reviewerRole === "ADMIN") return true;
  if (reviewerRole !== "PLACEMENT_OFFICER") return false;
  const scope = await resolveScope(reviewerId, reviewerRole);
  if (scope.collegeId !== collegeId) return false;
  // Officers approve mentors and additional officers of their own college.
  return targetRole === "MENTOR" || targetRole === "PLACEMENT_OFFICER";
}

export async function listStaffRequests(userId: string, role: Role, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  const where: Prisma.CollegeStaffWhereInput = { status };
  if (role === "PLACEMENT_OFFICER") {
    const scope = await resolveScope(userId, role);
    where.collegeId = scope.collegeId!;
  } else if (role !== "ADMIN") {
    throw forbidden();
  }
  const rows = await prisma.collegeStaff.findMany({
    where,
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true, createdAt: true } },
      college: { select: { id: true, name: true, city: true, state: true, verified: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (role !== "ADMIN") return rows;
  // Admins see, for each request, whether the college already has an officer.
  const collegeIds = [...new Set(rows.map((r) => r.collegeId))];
  const withOfficers = await prisma.collegeStaff.groupBy({
    by: ["collegeId"],
    where: { collegeId: { in: collegeIds }, status: "APPROVED", user: { role: "PLACEMENT_OFFICER" } },
    _count: true,
  });
  const counts = new Map(withOfficers.map((w) => [w.collegeId, w._count]));
  return rows.map((r) => ({ ...r, collegeOfficerCount: counts.get(r.collegeId) ?? 0 }));
}

export async function reviewStaffRequest(
  reviewerId: string,
  reviewerRole: Role,
  staffId: string,
  decision: "APPROVED" | "REJECTED"
) {
  const staff = await prisma.collegeStaff.findUnique({
    where: { id: staffId },
    include: { user: true, college: true },
  });
  if (!staff) throw notFound("Request");
  if (staff.userId === reviewerId) throw forbidden("You can't review your own request");
  if (!(await canReview(reviewerId, reviewerRole, staff.collegeId, staff.user.role))) {
    throw forbidden("Only this college's placement office or a platform admin can review this request");
  }

  const updated = await prisma.collegeStaff.update({
    where: { id: staffId },
    data: { status: decision, reviewedById: reviewerId, reviewedAt: new Date() },
  });

  await notify([staff.userId], {
    type: "STAFF_DECISION",
    title: decision === "APPROVED" ? `You're approved at ${staff.college.name}` : `Your request to join ${staff.college.name} was declined`,
    body:
      decision === "APPROVED"
        ? "Your workspace is now active."
        : "Contact the college's placement office if you think this is a mistake.",
    link: staff.user.role === "MENTOR" ? "/mentor/dashboard" : "/placement/dashboard",
  });
  return updated;
}

// Everyone on staff at the caller's college (for mentor assignment etc.).
export async function listCollegeStaff(userId: string, role: Role) {
  const scope = await resolveScope(userId, role);
  if (!scope.collegeId) throw forbidden();
  return prisma.collegeStaff.findMany({
    where: { collegeId: scope.collegeId, status: "APPROVED" },
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// ------------------------------------------------------------------
// Admin: college directory upkeep
// ------------------------------------------------------------------

export async function listUnverifiedColleges() {
  return prisma.college.findMany({
    where: { verified: false },
    include: { _count: { select: { students: true, staff: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCollege(
  id: string,
  input: { name?: string; city?: string; state?: string; category?: string; verified?: boolean }
) {
  const college = await prisma.college.findUnique({ where: { id } });
  if (!college) throw notFound("College");
  if (input.name && input.name !== college.name) {
    const clash = await prisma.college.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, id: { not: id } },
    });
    if (clash) throw badRequest(`"${clash.name}" already exists. Merge into it instead.`);
  }
  return prisma.college.update({ where: { id }, data: input });
}

// Moves every student, staff member, drive and job target from a duplicate
// college into the canonical one, then deletes the duplicate.
export async function mergeCollege(duplicateId: string, intoId: string) {
  if (duplicateId === intoId) throw badRequest("Choose a different college to merge into");
  const [from, into] = await Promise.all([
    prisma.college.findUnique({ where: { id: duplicateId } }),
    prisma.college.findUnique({ where: { id: intoId } }),
  ]);
  if (!from || !into) throw notFound("College");

  await prisma.$transaction(async (tx) => {
    await tx.student.updateMany({ where: { collegeId: duplicateId }, data: { collegeId: intoId } });
    await tx.collegeStaff.updateMany({ where: { collegeId: duplicateId }, data: { collegeId: intoId } });
    await tx.drive.updateMany({ where: { collegeId: duplicateId }, data: { collegeId: intoId } });
    const targets = await tx.jobCollege.findMany({ where: { collegeId: duplicateId } });
    for (const t of targets) {
      await tx.jobCollege.upsert({
        where: { jobId_collegeId: { jobId: t.jobId, collegeId: intoId } },
        update: {},
        create: { jobId: t.jobId, collegeId: intoId },
      });
    }
    await tx.jobCollege.deleteMany({ where: { collegeId: duplicateId } });
    await tx.learningResource.updateMany({ where: { collegeId: duplicateId }, data: { collegeId: intoId } });
    await tx.college.delete({ where: { id: duplicateId } });
  });
  return { merged: from.name, into: into.name };
}
