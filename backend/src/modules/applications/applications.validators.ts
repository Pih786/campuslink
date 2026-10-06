import { z } from "zod";

export const createApplicationSchema = z.object({
  jobId: z.string().min(1),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const APPLICATION_STATUSES = [
  "APPLIED",
  "ELIGIBLE",
  "SHORTLISTED",
  "ASSESSMENT",
  "INTERVIEW",
  "SELECTED",
  "REJECTED",
  "OFFERED",
  "ACCEPTED",
  "DECLINED",
  "JOINED",
] as const;

export const updateApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
