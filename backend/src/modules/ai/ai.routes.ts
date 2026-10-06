import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { rateLimitPerUser } from "../../middleware/rateLimit";
import { asyncHandler } from "../../utils/asyncHandler";
import { aiAnalyzeJd } from "../../utils/ai-client";

const analyzeJdSchema = z.object({
  text: z.string().trim().min(20, "Paste at least a few lines of the job description").max(12000),
});

const router = Router();

router.post(
  "/jobs/analyze",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  rateLimitPerUser(20, 10 * 60 * 1000),
  validateBody(analyzeJdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const analysis = await aiAnalyzeJd(req.body.text);
    res.status(200).json({ data: analysis });
  })
);

export default router;
