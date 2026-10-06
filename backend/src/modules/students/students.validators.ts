import { z } from "zod";

export const updateStudentSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  graduationYear: z.number().int().optional(),
  cgpa: z.number().min(0).max(10).optional(),
  backlogCount: z.number().int().min(0).optional(),
  studentCode: z.string().optional(),
  collegeName: z.string().optional(),
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const addSkillSchema = z.object({
  skillName: z.string().min(1),
  proficiency: z.number().int().min(1).max(5),
});

export type AddSkillInput = z.infer<typeof addSkillSchema>;

export const listStudentsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  branch: z.string().optional(),
  minCgpa: z.string().optional(),
  skill: z.string().optional(),
});

const optionalUrl = z
  .string()
  .trim()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "Use an http(s) link")
  .optional()
  .or(z.literal(""));

export const addProjectSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().max(600).optional(),
  techStack: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  url: optionalUrl,
});

export const addCertificationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  issuer: z.string().max(120).optional(),
  issuedAt: z.string().datetime().optional(),
  url: optionalUrl,
});
