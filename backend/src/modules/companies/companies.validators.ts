import { z } from "zod";

export const upsertCompanySchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpsertCompanyInput = z.infer<typeof upsertCompanySchema>;
