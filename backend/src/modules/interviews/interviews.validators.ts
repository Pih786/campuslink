import { z } from "zod";

export const createInterviewSchema = z.object({
  applicationId: z.string().min(1),
  round: z.string().optional(),
  panel: z.string().optional(),
  scheduledAt: z.string().datetime(),
  duration: z.number().int().min(5).optional().default(30),
  venue: z.string().optional(),
  meetingUrl: z.string().optional(),
});

export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const updateInterviewSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "NO_SHOW", "RESCHEDULED", "CANCELLED"]).optional(),
  score: z.number().min(0).max(10).optional(),
  feedback: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().min(5).optional(),
  venue: z.string().optional(),
  meetingUrl: z.string().optional(),
  round: z.string().optional(),
  panel: z.string().optional(),
});

export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
