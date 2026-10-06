import { z } from "zod";

export const createOfferSchema = z.object({
  applicationId: z.string().min(1),
  ctc: z.number().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  joiningDate: z.string().datetime().optional(),
  offerLetterUrl: z.string().optional(),
  bondRequired: z.boolean().optional(),
  offerType: z.enum(["FULL_TIME", "INTERNSHIP", "PPO"]).optional(),
});

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z.object({
  acceptanceStatus: z.enum(["PENDING", "ACCEPTED", "DECLINED"]).optional(),
  joiningStatus: z.enum(["PENDING", "JOINED", "DID_NOT_JOIN"]).optional(),
  joiningDate: z.string().datetime().optional(),
  ctc: z.number().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  offerLetterUrl: z.string().optional(),
  bondRequired: z.boolean().optional(),
});

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const respondOfferSchema = z
  .object({
    decision: z.enum(["ACCEPTED", "DECLINED", "DEFERRED"]),
    deferredUntil: z.string().datetime().optional(),
    note: z.string().max(300).optional(),
  })
  .refine((v) => v.decision !== "DEFERRED" || Boolean(v.deferredUntil), {
    message: "Choose the date you'll decide by",
    path: ["deferredUntil"],
  });

export type RespondOfferInput = z.infer<typeof respondOfferSchema>;

export const withdrawOfferSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export type WithdrawOfferInput = z.infer<typeof withdrawOfferSchema>;

export const convertInternshipSchema = z.object({
  converted: z.boolean(),
  ctc: z.number().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  joiningDate: z.string().datetime().optional(),
});

export type ConvertInternshipInput = z.infer<typeof convertInternshipSchema>;

export const DOCUMENT_TYPES = [
  "OFFER_LETTER",
  "SIGNED_ACCEPTANCE",
  "ID_PROOF",
  "MARKSHEETS",
  "DEGREE_CERTIFICATE",
  "BOND_AGREEMENT",
  "MEDICAL_CERTIFICATE",
  "OTHER",
] as const;

export const requestDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  dueDate: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
});

export type RequestDocumentInput = z.infer<typeof requestDocumentSchema>;

export const reviewDocumentSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    note: z.string().max(300).optional(),
  })
  .refine((v) => v.status !== "REJECTED" || Boolean(v.note?.trim()), {
    message: "Say what needs fixing when rejecting a document",
    path: ["note"],
  });

export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
