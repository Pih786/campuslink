import { z } from "zod";

export const createSqlProblemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  schemaSql: z.string().min(1),
  seedSql: z.string().optional(),
  solutionQuery: z.string().min(1),
  skillName: z.string().optional(),
});

export type CreateSqlProblemInput = z.infer<typeof createSqlProblemSchema>;

export const runOrSubmitSqlSchema = z.object({
  query: z.string().min(1),
});

export type RunOrSubmitSqlInput = z.infer<typeof runOrSubmitSqlSchema>;
