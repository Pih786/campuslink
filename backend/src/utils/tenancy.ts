import { Prisma, Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError, forbidden, notFound } from "./errors";

// The tenant is a college. Officers and mentors act for exactly one college,
// students belong to one, recruiters belong to a company that can hire from
// many colleges, and platform admins see everything.
export interface Scope {
  userId: string;
  role: Role;
  collegeId: string | null;
  companyId: string | null;
  isAdmin: boolean;
}

export async function resolveScope(userId: string, role: Role): Promise<Scope> {
  const base = { userId, role, collegeId: null, companyId: null, isAdmin: role === "ADMIN" };

  if (role === "ADMIN") return base;

  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId }, select: { collegeId: true } });
    if (!student) throw notFound("Student profile");
    return { ...base, collegeId: student.collegeId };
  }

  if (role === "RECRUITER") {
    const recruiter = await prisma.recruiter.findUnique({ where: { userId }, select: { companyId: true } });
    if (!recruiter) throw notFound("Recruiter profile");
    return { ...base, companyId: recruiter.companyId };
  }

  // PLACEMENT_OFFICER and MENTOR
  const staff = await prisma.collegeStaff.findUnique({ where: { userId } });
  if (!staff) throw forbidden("Your account isn't linked to a college");
  if (staff.status !== "APPROVED") {
    throw new ApiError(
      403,
      staff.status === "PENDING" ? "APPROVAL_PENDING" : "APPROVAL_REJECTED",
      staff.status === "PENDING"
        ? "Your account is waiting for approval by your college's placement office or a platform admin"
        : "Your request to join this college was not approved"
    );
  }
  return { ...base, collegeId: staff.collegeId };
}

// Jobs a given college's students may see and apply to.
export function jobsVisibleToCollege(collegeId: string | null): Prisma.JobWhereInput {
  if (!collegeId) return { visibility: "GLOBAL" };
  return { OR: [{ visibility: "GLOBAL" }, { targetColleges: { some: { collegeId } } }] };
}

// Students the caller may see.
export function studentsInScope(scope: Scope): Prisma.StudentWhereInput {
  if (scope.isAdmin) return {};
  if (scope.role === "STUDENT") return { userId: scope.userId };
  if (scope.role === "RECRUITER") return { applications: { some: { job: { companyId: scope.companyId! } } } };
  return { collegeId: scope.collegeId ?? "__none__" };
}

// Applications the caller may see.
export function applicationsInScope(scope: Scope): Prisma.ApplicationWhereInput {
  if (scope.isAdmin) return {};
  if (scope.role === "STUDENT") return { student: { userId: scope.userId } };
  if (scope.role === "RECRUITER") return { job: { companyId: scope.companyId! } };
  return { student: { collegeId: scope.collegeId ?? "__none__" } };
}

// Offers the caller may see.
export function offersInScope(scope: Scope): Prisma.OfferWhereInput {
  if (scope.isAdmin) return {};
  if (scope.role === "STUDENT") return { student: { userId: scope.userId } };
  if (scope.role === "RECRUITER") return { companyId: scope.companyId! };
  return { student: { collegeId: scope.collegeId ?? "__none__" } };
}

// Officers/mentors may only act on students of their own college.
export async function assertStudentInCollege(scope: Scope, studentId: string) {
  if (scope.isAdmin || (scope.role !== "PLACEMENT_OFFICER" && scope.role !== "MENTOR")) return;
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { collegeId: true } });
  if (!student || student.collegeId !== scope.collegeId) {
    throw forbidden("This student belongs to another college");
  }
}

// A job must be open to the student's college before they can see or apply.
export async function assertJobVisibleToCollege(jobId: string, collegeId: string | null) {
  const visible = await prisma.job.count({ where: { id: jobId, ...jobsVisibleToCollege(collegeId) } });
  if (!visible) throw notFound("Job");
}

export async function officerUserIdsForCollege(collegeId: string | null | undefined): Promise<string[]> {
  if (!collegeId) return [];
  const staff = await prisma.collegeStaff.findMany({
    where: { collegeId, status: "APPROVED", user: { role: "PLACEMENT_OFFICER" } },
    select: { userId: true },
  });
  return staff.map((s) => s.userId);
}
