import { z } from "zod";

export const createDriveSchema = z.object({
  companyId: z.string().min(1),
  jobId: z.string().min(1),
  date: z.string().datetime(),
  durationMinutes: z.number().int().min(30).max(720).optional(),
  venue: z.string().optional(),
  // Admins only; officers always schedule for their own college.
  collegeId: z.string().uuid().optional(),
  capacity: z.number().int().optional(),
  applicationDeadline: z.string().datetime().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
});

export type CreateDriveInput = z.infer<typeof createDriveSchema>;

export const checkDriveSchema = z.object({
  jobId: z.string().min(1),
  date: z.string().datetime(),
  durationMinutes: z.number().int().min(30).max(720).optional(),
  venue: z.string().optional(),
  excludeDriveId: z.string().optional(),
  collegeId: z.string().uuid().optional(),
});

export type CheckDriveInput = z.infer<typeof checkDriveSchema>;
