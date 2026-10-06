import fs from "fs";
import path from "path";
import { OfferDocumentType, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { privateDocumentDir } from "../../utils/upload";
import { notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";
import { officerUserIdsForCollege } from "../../utils/tenancy";
import { assertOfferAccess, DOCUMENT_OWNER } from "./offers.service";
import { RequestDocumentInput, ReviewDocumentInput } from "./offers.validators";

export const DOCUMENT_LABELS: Record<OfferDocumentType, string> = {
  OFFER_LETTER: "Offer letter",
  SIGNED_ACCEPTANCE: "Signed acceptance",
  ID_PROOF: "ID proof",
  MARKSHEETS: "Marksheets",
  DEGREE_CERTIFICATE: "Degree certificate",
  BOND_AGREEMENT: "Bond agreement",
  MEDICAL_CERTIFICATE: "Medical certificate",
  OTHER: "Other document",
};

// "Marksheets" -> "marksheets", but "ID proof" stays "ID proof".
export function labelInSentence(type: OfferDocumentType): string {
  const label = DOCUMENT_LABELS[type];
  return label.length > 1 && label[1] === label[1].toUpperCase() ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

async function loadDocument(offerId: string, documentId: string) {
  const document = await prisma.offerDocument.findFirst({
    where: { id: documentId, offerId },
    include: { offer: { include: { student: { include: { user: true } }, company: true } } },
  });
  if (!document) throw notFound("Document");
  return document;
}

function removeFile(fileUrl: string | null) {
  if (!fileUrl) return;
  const full = path.join(privateDocumentDir, path.basename(fileUrl));
  fs.promises.unlink(full).catch(() => undefined);
}

export async function uploadDocument(
  offerId: string,
  documentId: string,
  userId: string,
  role: Role,
  file: Express.Multer.File | undefined
) {
  if (!file) throw badRequest("Attach a file (field name: file)");
  const document = await loadDocument(offerId, documentId).catch((err) => {
    removeFile(file.filename);
    throw err;
  });

  try {
    await assertOfferAccess(document.offer, userId, role);
    const owner = DOCUMENT_OWNER[document.type];
    if (role === "STUDENT" && owner !== "STUDENT") throw forbidden("The employer provides this document");
    if (role === "RECRUITER" && owner !== "EMPLOYER") throw forbidden("The student provides this document");
    if (document.status === "VERIFIED") throw badRequest("This document is already verified");
  } catch (err) {
    removeFile(file.filename);
    throw err;
  }

  removeFile(document.fileUrl);
  const employerDocument = DOCUMENT_OWNER[document.type] === "EMPLOYER";
  const updated = await prisma.offerDocument.update({
    where: { id: documentId },
    data: {
      fileUrl: file.filename,
      fileName: file.originalname.slice(0, 200),
      submittedAt: new Date(),
      // Employer-issued documents need no review by the employer itself.
      status: employerDocument ? "VERIFIED" : "SUBMITTED",
      verifiedAt: employerDocument ? new Date() : null,
      verifiedBy: employerDocument ? userId : null,
      note: null,
    },
  });

  const label = DOCUMENT_LABELS[document.type];
  if (employerDocument) {
    await notify([document.offer.student.userId], {
      type: "DOCUMENT_SUBMITTED",
      title: `${document.offer.company.name} uploaded your ${labelInSentence(document.type)}`,
      body: "Download it from your Offers page.",
      link: "/student/offers",
    });
  } else {
    const reviewers = [
      ...(await recruiterUserIdsForCompany(document.offer.companyId)),
      ...(await officerUserIdsForCollege(document.offer.student.collegeId)),
    ];
    await notify(reviewers, {
      type: "DOCUMENT_SUBMITTED",
      title: `${document.offer.student.user.fullName} submitted ${labelInSentence(document.type)}`,
      body: `${document.offer.company.name} offer. Review and verify it.`,
      link: "/placement/offers",
    });
  }

  return updated;
}

export async function reviewDocument(
  offerId: string,
  documentId: string,
  userId: string,
  role: Role,
  input: ReviewDocumentInput
) {
  const document = await loadDocument(offerId, documentId);
  await assertOfferAccess(document.offer, userId, role);
  if (role === "STUDENT") throw forbidden("Students can't review documents");
  if (document.status !== "SUBMITTED") throw badRequest("Only submitted documents can be reviewed");

  const updated = await prisma.offerDocument.update({
    where: { id: documentId },
    data: {
      status: input.status,
      note: input.note?.trim() || null,
      verifiedAt: input.status === "VERIFIED" ? new Date() : null,
      verifiedBy: input.status === "VERIFIED" ? userId : null,
    },
  });

  const label = DOCUMENT_LABELS[document.type];
  await notify([document.offer.student.userId], {
    type: "DOCUMENT_REVIEWED",
    title: input.status === "VERIFIED" ? `${label} verified` : `${label} needs to be resubmitted`,
    body: input.status === "VERIFIED" ? `${document.offer.company.name} offer.` : `Reviewer's note: ${input.note}`,
    link: "/student/offers",
  });

  return updated;
}

export async function requestDocument(offerId: string, userId: string, role: Role, input: RequestDocumentInput) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { student: true, company: true } });
  if (!offer) throw notFound("Offer");
  await assertOfferAccess(offer, userId, role);
  if (role === "STUDENT") throw forbidden("Students can't request documents");

  const existing = await prisma.offerDocument.findUnique({ where: { offerId_type: { offerId, type: input.type } } });
  if (existing) throw badRequest(`${DOCUMENT_LABELS[input.type]} is already on the checklist`);

  const document = await prisma.offerDocument.create({
    data: {
      offerId,
      type: input.type,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      note: input.note,
    },
  });

  if (DOCUMENT_OWNER[input.type] === "STUDENT") {
    await notify([offer.student.userId], {
      type: "DOCUMENT_REQUESTED",
      title: `${offer.company.name} requested your ${labelInSentence(input.type)}`,
      body: input.dueDate
        ? `Due ${new Date(input.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
        : "Upload it from your Offers page.",
      link: "/student/offers",
    });
  }

  return document;
}

export async function documentFile(offerId: string, documentId: string, userId: string, role: Role) {
  const document = await loadDocument(offerId, documentId);
  await assertOfferAccess(document.offer, userId, role);
  if (!document.fileUrl) throw notFound("File");
  const fullPath = path.join(privateDocumentDir, path.basename(document.fileUrl));
  if (!fs.existsSync(fullPath)) throw notFound("File");
  return { fullPath, fileName: document.fileName ?? path.basename(fullPath) };
}
