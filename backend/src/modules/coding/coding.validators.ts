import { z } from "zod";

const testCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
});

export const createCodingProblemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional().default("EASY"),
  skillName: z.string().optional(),
  starterCode: z.record(z.string()).optional(),
  visibleTests: z.array(testCaseSchema).min(1),
  hiddenTests: z.array(testCaseSchema).min(1),
});

export type CreateCodingProblemInput = z.infer<typeof createCodingProblemSchema>;

export const runOrSubmitCodeSchema = z.object({
  language: z.enum(["javascript", "python", "java", "cpp"]),
  code: z.string().min(1),
});

export type RunOrSubmitCodeInput = z.infer<typeof runOrSubmitCodeSchema>;
