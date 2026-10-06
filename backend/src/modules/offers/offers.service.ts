import { Request } from "express";
import { OfferDocumentType, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import {
  ConvertInternshipInput,
  CreateOfferInput,
  RespondOfferInput,
  UpdateOfferInput,
  WithdrawOfferInput,
} from "./offers.validators";
import { notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";
import { applicationsInScope, officerUserIdsForCollege, offersInScope, resolveScope } from "../../utils/tenancy";

const offerInclude = {
  student: { include: { user: { select: { id: true, email: true, fullName: true } } } },
  company: true,
  job: true,
  documents: { orderBy: { createdAt: "asc" } },
} as const;

const STUDENT_DOCUMENT_DAYS = 7;

// Who is expected to provide each document.
export const DOCUMENT_OWNER: Record<OfferDocumentType, "EMPLOYER" | "STUDENT"> = {
  OFFER_LETTER: "EMPLOYER",
  SIGNED_ACCEPTANCE: "STUDENT",
  ID_PROOF: "STUDENT",
  MARKSHEETS: "STUDENT",
  DEGREE_CERTIFICATE: "STUDENT",
  BOND_AGREEMENT: "STUDENT",
  MEDICAL_CERTIFICATE: "STUDENT",
  OTHER: "STUDENT",
};

function defaultDocuments(offerDate: Date, bondRequired: boolean) {
  const due = new Date(offerDate.getTime() + STUDENT_DOCUMENT_DAYS * 24 * 60 * 60000);
  const types: OfferDocumentType[] = ["OFFER_LETTER", "SIGNED_ACCEPTANCE", "ID_PROOF", "MARKSHEETS"];
  if (bondRequired) types.push("BOND_AGREEMENT");
  return types.map((type) => ({ type, dueDate: DOCUMENT_OWNER[type] === "STUDENT" ? due : null }));
}

function formatLpa(ctc: number | null | undefined) {
  return ctc == null ? "" : ` · ₹${(ctc / 100000).toFixed(1)} LPA`;
}

export async function assertOfferAccess(
  offer: { companyId: string; student: { userId: string; collegeId: string | null } },
  userId: string,
  role: Role
) {
  if (role === "ADMIN") return;
  if (role === "STUDENT") {
    if (offer.student.userId !== userId) throw forbidden("You do not have access to this offer");
    return;
  }
  const scope = await resolveScope(userId, role);
  if (role === "RECRUITER" && scope.companyId !== offer.companyId) {
    throw forbidden("You do not have access to this offer");
  }
  if ((role === "PLACEMENT_OFFICER" || role === "MENTOR") && scope.collegeId !== offer.student.collegeId) {
    throw forbidden("This offer belongs to another college's student");
  }
}

export async function createOffer(userId: string, role: Role, input: CreateOfferInput) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: { job: { include: { company: true } }, student: true },
  });
  if (!application) throw notFound("Application");

  if (application.status !== "SELECTED") {
    throw badRequest("An offer can only be created for an application in SELECTED status");
  }

  const scope = await resolveScope(userId, role);
  const inScope = await prisma.application.count({ where: { id: application.id, ...applicationsInScope(scope) } });
  if (!inScope) throw forbidden("You do not have access to this application");

  const offerType = input.offerType ?? "FULL_TIME";
  const bondRequired = input.bondRequired ?? false;
  const offerDate = new Date();

  const offer = await prisma.$transaction(async (tx) => {
    const created = await tx.offer.create({
      data: {
        studentId: application.studentId,
        companyId: application.job.companyId,
        jobId: application.jobId,
        ctc: input.ctc,
        role: input.role,
        location: input.location,
        offerDate,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
        offerLetterUrl: input.offerLetterUrl,
        bondRequired,
        offerType,
        conversionStatus: offerType === "INTERNSHIP" ? "PENDING" : undefined,
        documents: { create: defaultDocuments(offerDate, bondRequired) },
      },
    });

    await tx.application.update({
      where: { id: application.id },
      data: { status: "OFFERED" },
    });

    return created;
  });

  await notify([application.student.userId], {
    type: "OFFER_RECEIVED",
    title: `Offer from ${application.job.company.name}`,
    body: `${input.role ?? application.job.title}${formatLpa(input.ctc)}. Review it and respond from your Offers page.`,
    link: "/student/offers",
  });

  return prisma.offer.findUnique({ where: { id: offer.id }, include: offerInclude });
}

export async function getOfferById(id: string, userId: string, role: Role) {
  const offer = await prisma.offer.findUnique({ where: { id }, include: offerInclude });
  if (!offer) throw notFound("Offer");
  await assertOfferAccess(offer, userId, role);
  return offer;
}

const RESPONSE_LABEL = { ACCEPTED: "accepted", DECLINED: "declined", DEFERRED: "asked to defer" } as const;

export async function respondToOffer(offerId: string, userId: string, input: RespondOfferInput) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { student: { include: { user: true } }, company: true, job: true },
  });
  if (!offer) throw notFound("Offer");
  if (offer.student.userId !== userId) throw forbidden("You do not have access to this offer");
  if (offer.acceptanceStatus !== "PENDING" && offer.acceptanceStatus !== "DEFERRED") {
    throw badRequest(`This offer has already been ${offer.acceptanceStatus.toLowerCase()}`);
  }
  if (input.decision === "DEFERRED" && offer.acceptanceStatus === "DEFERRED") {
    throw badRequest("You have already deferred this offer");
  }

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offerId },
      data: {
        acceptanceStatus: input.decision,
        respondedAt: new Date(),
        deferredUntil: input.decision === "DEFERRED" && input.deferredUntil ? new Date(input.deferredUntil) : undefined,
      },
    });
    // A PPO is a second offer on the same application; only the original
    // offer drives the application's status.
    if (input.decision !== "DEFERRED" && offer.offerType !== "PPO") {
      await tx.application.updateMany({
        where: { studentId: offer.studentId, jobId: offer.jobId },
        data: { status: input.decision },
      });
    }
  });

  const recipients = [
    ...(await recruiterUserIdsForCompany(offer.companyId)),
    ...(await officerUserIdsForCollege(offer.student.collegeId)),
  ];
  await notify(recipients, {
    type: "OFFER_RESPONSE",
    title: `${offer.student.user.fullName} ${RESPONSE_LABEL[input.decision]} the ${offer.company.name} offer`,
    body:
      input.decision === "DEFERRED"
        ? `Wants more time${input.deferredUntil ? ` until ${new Date(input.deferredUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}.${input.note ? ` "${input.note}"` : ""}`
        : `${offer.role ?? offer.job.title}${formatLpa(offer.ctc)}${input.note ? `. "${input.note}"` : ""}`,
    link: "/placement/offers",
  });

  return prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude });
}

export async function withdrawOffer(offerId: string, userId: string, role: Role, input: WithdrawOfferInput) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { student: true, company: true, job: true },
  });
  if (!offer) throw notFound("Offer");
  await assertOfferAccess(offer, userId, role);
  if (offer.acceptanceStatus === "WITHDRAWN") throw badRequest("This offer is already withdrawn");
  if (offer.joiningStatus === "JOINED") throw badRequest("The candidate has already joined; this offer can't be withdrawn");

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offerId },
      data: { acceptanceStatus: "WITHDRAWN", withdrawnReason: input.reason },
    });
    if (offer.offerType !== "PPO") {
      await tx.application.updateMany({
        where: { studentId: offer.studentId, jobId: offer.jobId },
        data: { status: "REJECTED" },
      });
    }
  });

  await notify([offer.student.userId], {
    type: "OFFER_WITHDRAWN",
    title: `${offer.company.name} withdrew its offer`,
    body: `Reason given: ${input.reason}. Contact your placement office if you have questions.`,
    link: "/student/offers",
  });

  return prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude });
}

// Internship outcome. A conversion creates a separate PPO offer that the
// student then accepts or declines like any other offer.
export async function convertInternship(offerId: string, userId: string, role: Role, input: ConvertInternshipInput) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { student: true, company: true, job: true },
  });
  if (!offer) throw notFound("Offer");
  await assertOfferAccess(offer, userId, role);
  if (offer.offerType !== "INTERNSHIP") throw badRequest("Only internship offers can be converted");
  if (offer.acceptanceStatus !== "ACCEPTED") {
    throw badRequest("Record the internship outcome after the student has accepted the internship");
  }
  if (offer.conversionStatus && offer.conversionStatus !== "PENDING") {
    throw badRequest("The internship outcome has already been recorded");
  }

  if (!input.converted) {
    await prisma.offer.update({ where: { id: offerId }, data: { conversionStatus: "NOT_CONVERTED" } });
    return { internship: await prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude }), ppo: null };
  }

  const offerDate = new Date();
  const ppo = await prisma.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offerId }, data: { conversionStatus: "CONVERTED" } });
    return tx.offer.create({
      data: {
        studentId: offer.studentId,
        companyId: offer.companyId,
        jobId: offer.jobId,
        ctc: input.ctc,
        // A PPO is the full-time role, not the internship title.
        role: input.role ?? offer.job.title,
        location: input.location ?? offer.location,
        offerDate,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
        offerType: "PPO",
        documents: { create: defaultDocuments(offerDate, false) },
      },
    });
  });

  await notify([offer.student.userId], {
    type: "OFFER_RECEIVED",
    title: `Pre-placement offer from ${offer.company.name}`,
    body: `Your internship converted into a full-time offer${formatLpa(input.ctc)}.`,
    link: "/student/offers",
  });

  return {
    internship: await prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude }),
    ppo: await prisma.offer.findUnique({ where: { id: ppo.id }, include: offerInclude }),
  };
}

export async function listOffers(req: Request, userId: string, role: Role) {
  const pagination = getPagination(req);
  const scope = await resolveScope(userId, role);
  const where: Prisma.OfferWhereInput = offersInScope(scope);

  const [offers, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      include: offerInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { offerDate: "desc" },
    }),
    prisma.offer.count({ where }),
  ]);

  return paginatedResponse(offers, total, pagination);
}

export async function updateOffer(offerId: string, userId: string, role: Role, input: UpdateOfferInput) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { student: true } });
  if (!offer) throw notFound("Offer");
  await assertOfferAccess(offer, userId, role);

  if (input.joiningStatus && input.joiningStatus !== "PENDING" && offer.acceptanceStatus !== "ACCEPTED") {
    throw badRequest("Joining can only be recorded for an accepted offer");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.offer.update({
      where: { id: offerId },
      data: {
        acceptanceStatus: input.acceptanceStatus,
        joiningStatus: input.joiningStatus,
        joiningDate: input.joiningDate ? new Date(input.joiningDate) : undefined,
        ctc: input.ctc,
        role: input.role,
        location: input.location,
        offerLetterUrl: input.offerLetterUrl,
        bondRequired: input.bondRequired,
      },
    });

    const nextApplicationStatus =
      input.joiningStatus === "JOINED"
        ? "JOINED"
        : input.acceptanceStatus === "ACCEPTED"
          ? "ACCEPTED"
          : input.acceptanceStatus === "DECLINED"
            ? "DECLINED"
            : null;

    if (nextApplicationStatus && offer.offerType !== "PPO") {
      await tx.application.updateMany({
        where: { studentId: offer.studentId, jobId: offer.jobId },
        data: { status: nextApplicationStatus },
      });
    }

    return result;
  });

  return prisma.offer.findUnique({ where: { id: updated.id }, include: offerInclude });
}
