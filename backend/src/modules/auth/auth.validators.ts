import { z } from "zod";
import { INDIAN_STATES_AND_UTS } from "../../utils/india";

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Use at least one letter and one number");

export const newCollegeSchema = z.object({
  name: z.string().trim().min(3, "Enter the college's full name").max(160),
  city: z.string().trim().min(2).max(80),
  state: z.enum(INDIAN_STATES_AND_UTS),
});

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password,
    fullName: z.string().trim().min(1, "Full name is required").max(120),
    role: z.enum(["STUDENT", "RECRUITER", "PLACEMENT_OFFICER", "MENTOR"]),
    // Student, officer and mentor: an existing college, or a new one to add.
    collegeId: z.string().uuid().optional(),
    newCollege: newCollegeSchema.optional(),
    // Recruiter: company name.
    organization: z.string().trim().min(1).max(160).optional(),
    // Student: branch code. Staff and recruiters: job title.
    designation: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "RECRUITER") {
      if (!v.organization) ctx.addIssue({ code: "custom", path: ["organization"], message: "Company name is required" });
      return;
    }
    if (!v.collegeId && !v.newCollege) {
      ctx.addIssue({ code: "custom", path: ["collegeId"], message: "Choose your college" });
    }
    if (v.collegeId && v.newCollege) {
      ctx.addIssue({ code: "custom", path: ["collegeId"], message: "Choose a college or add a new one, not both" });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
