import { z } from "zod";

// MCQ questions carry options and the correct index; WRITTEN questions carry
// a rubric (what a strong answer covers) and an optional word limit.
const questionSchema = z.object({
  questionText: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
  rubric: z.string().trim().max(2000).optional(),
  maxWords: z.number().int().min(20).max(2000).optional(),
  points: z.number().int().min(1).optional().default(1),
});

export const createAssessmentSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["MCQ", "WRITTEN"]).optional().default("MCQ"),
    durationMinutes: z.number().int().min(1).optional().default(30),
    // Percentage threshold (0-100) of totalPoints required to pass.
    passScore: z.number().int().min(0).max(100).optional().default(60),
    skillName: z.string().optional(),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((v, ctx) => {
    v.questions.forEach((q, i) => {
      if (v.type === "MCQ") {
        if (!q.options) ctx.addIssue({ code: "custom", path: ["questions", i, "options"], message: "Multiple-choice questions need options" });
        if (q.correctOptionIndex === undefined) {
          ctx.addIssue({ code: "custom", path: ["questions", i, "correctOptionIndex"], message: "Mark the correct option" });
        } else if (q.options && q.correctOptionIndex >= q.options.length) {
          ctx.addIssue({ code: "custom", path: ["questions", i, "correctOptionIndex"], message: "Correct option is out of range" });
        }
      }
    });
  });

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

// MCQ: questionId -> chosen option index. WRITTEN: questionId -> answer text.
export const submitAttemptSchema = z.object({
  answers: z.record(z.string(), z.union([z.number().int().min(0), z.string().max(8000)])),
});

export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
