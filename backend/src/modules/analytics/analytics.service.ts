import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { forbidden, notFound } from "../../utils/errors";
import { applicationsInScope, offersInScope, resolveScope, studentsInScope } from "../../utils/tenancy";

export async function getOverview(userId: string, role: Role) {
  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) throw notFound("Student profile");
    const [applications, shortlisted, interviews, offers, joined] = await Promise.all([
      prisma.application.count({ where: { studentId: student.id } }),
      prisma.application.count({ where: { studentId: student.id, status: "SHORTLISTED" } }),
      prisma.interview.count({ where: { application: { studentId: student.id } } }),
      prisma.offer.count({ where: { studentId: student.id } }),
      prisma.application.count({ where: { studentId: student.id, status: "JOINED" } }),
    ]);
    return { scope: "own", applications, shortlisted, interviews, offers, joined };
  }

  const scope = await resolveScope(userId, role);
  const applicationWhere = applicationsInScope(scope);
  const offerWhere = offersInScope(scope);
  const interviewWhere = { application: applicationWhere };
  // Recruiters see the platform-wide student count; officers their college's.
  const studentWhere = role === "RECRUITER" ? {} : studentsInScope(scope);

  const [totalStudents, totalApplications, eligible, shortlisted, interviewCount, offerCount, accepted, joined] =
    await Promise.all([
      prisma.student.count({ where: studentWhere }),
      prisma.application.count({ where: applicationWhere }),
      prisma.application.count({ where: { ...applicationWhere, status: "ELIGIBLE" } }),
      prisma.application.count({ where: { ...applicationWhere, status: "SHORTLISTED" } }),
      prisma.interview.count({ where: interviewWhere }),
      prisma.offer.count({ where: offerWhere }),
      prisma.offer.count({ where: { ...offerWhere, acceptanceStatus: "ACCEPTED" } }),
      prisma.offer.count({ where: { ...offerWhere, joiningStatus: "JOINED" } }),
    ]);

  return {
    scope: role === "RECRUITER" ? "company" : scope.isAdmin ? "global" : "college",
    totalStudents,
    totalApplications,
    eligible,
    shortlisted,
    interviews: interviewCount,
    offers: offerCount,
    accepted,
    joined,
  };
}

// NOTE: P0 has no application-status-history table, so "reached stage X"
// is approximated from the application's CURRENT status (or, for the
// interview stage, presence of any Interview record). An application that
// was later REJECTED after reaching e.g. SHORTLISTED will not be counted
// at the shortlisted stage anymore — acceptable for an MVP funnel view.
export async function getFunnel(userId: string, role: Role) {
  if (role === "STUDENT") {
    throw forbidden("Students do not have access to the placement funnel view");
  }

  const applicationScope = applicationsInScope(await resolveScope(userId, role));

  const [applied, shortlistedOrBeyond, interviewStage, selectedOrBeyond, offered, accepted, joined] =
    await Promise.all([
      prisma.application.count({ where: applicationScope }),
      prisma.application.count({
        where: {
          ...applicationScope,
          status: { in: ["SHORTLISTED", "ASSESSMENT", "INTERVIEW", "SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"] },
        },
      }),
      prisma.application.count({
        where: {
          ...applicationScope,
          OR: [
            { status: { in: ["INTERVIEW", "SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"] } },
            { interviews: { some: {} } },
          ],
        },
      }),
      prisma.application.count({
        where: { ...applicationScope, status: { in: ["SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"] } },
      }),
      // Offer stages count applications, not offer rows: a PPO or a withdrawn
      // offer must not make a later stage larger than the one before it.
      prisma.application.count({
        where: { ...applicationScope, status: { in: ["OFFERED", "ACCEPTED", "DECLINED", "JOINED"] } },
      }),
      prisma.application.count({ where: { ...applicationScope, status: { in: ["ACCEPTED", "JOINED"] } } }),
      prisma.application.count({ where: { ...applicationScope, status: "JOINED" } }),
    ]);

  // All applications in this system are only ever created once a student
  // clears the eligibility engine, so "eligible" == "applied" here (see
  // applications.service.createApplication).
  return {
    applied,
    eligible: applied,
    shortlisted: shortlistedOrBeyond,
    interview: interviewStage,
    selected: selectedOrBeyond,
    offer: offered,
    accepted,
    joined,
  };
}
