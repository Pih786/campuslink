import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { rateLimitPerUser } from "../../middleware/rateLimit";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { aiCopilot } from "../../utils/ai-client";
import { buildFacts } from "./copilot.service";

const querySchema = z.object({
  question: z.string().trim().min(3, "Ask a question").max(500),
});

const AUDIENCE: Record<string, string> = {
  PLACEMENT_OFFICER: "placement officer (college-wide access)",
  ADMIN: "college administrator (college-wide access)",
  RECRUITER: "recruiter (access limited to their own company)",
};

const router = Router();

router.post(
  "/query",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN", "RECRUITER"),
  rateLimitPerUser(30, 10 * 60 * 1000),
  validateBody(querySchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    const facts = await buildFacts(req.auth.userId, req.auth.role);
    const result = await aiCopilot(req.body.question, facts, AUDIENCE[req.auth.role]);
    res.status(200).json({
      data: {
        question: req.body.question,
        ...result,
        facts,
      },
    });
  })
);

export default router;
