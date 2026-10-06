import { z } from "zod";

export const jobRequirementSchema = z.object({
  requirementType: z.enum(["SKILL", "CGPA", "BRANCH", "BACKLOG", "EXPERIENCE", "CERTIFICATION", "MOCK_INTERVIEW"]),
  skillName: z.string().optional(),
  minimumProficiency: z.number().int().min(1).max(5).optional(),
  mandatory: z.boolean().optional().default(true),
  weight: z.number().optional().default(1),
  value: z.any().optional(),
});

export type JobRequirementInput = z.infer<typeof jobRequirementSchema>;

export const createJobSchema = z.object({
  companyId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  experienceRequired: z.number().int().optional().default(0),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional().default("DRAFT"),
  applicationDeadline: z.string().datetime().optional().or(z.literal("")).optional(),
  requirements: z.array(jobRequirementSchema).optional().default([]),
  // GLOBAL: every college on the platform. SELECTED_COLLEGES: only collegeIds.
  visibility: z.enum(["GLOBAL", "SELECTED_COLLEGES"]).optional(),
  collegeIds: z.array(z.string().uuid()).max(200).optional(),
  // Opt-in rule: eligible applicants scoring at least this are shortlisted
  // automatically.
  autoShortlist: z.boolean().optional(),
  autoShortlistMinScore: z.number().int().min(0).max(100).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial();

export type UpdateJobInput = z.infer<typeof updateJobSchema>;
