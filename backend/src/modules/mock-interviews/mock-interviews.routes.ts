import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as service from "./mock-interviews.service";

const score = z.number().int().min(0).max(10);

const recordSchema = z.object({
  studentId: z.string().uuid(),
  conductedAt: z.string().datetime({ offset: true }).optional(),
  focus: z.string().trim().max(120).optional(),
  // A skill the interview tested; a strong technical score verifies it.
  skillName: z.string().trim().max(80).optional(),
  technical: score,
  communication: score,
  problemSolving: score,
  confidence: score,
  feedback: z.string().trim().max(2000).optional(),
});

const auth = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth;
};

const router = Router();
router.use(requireAuth);

router.get(
  "/me",
  requireRole("STUDENT"),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.myMockInterviews(auth(req).userId) });
  })
);

router.get(
  "/",
  requireRole("PLACEMENT_OFFICER", "MENTOR", "ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    res.status(200).json({ data: await service.listMockInterviews(userId, role, studentId) });
  })
);

router.post(
  "/",
  requireRole("PLACEMENT_OFFICER", "MENTOR"),
  validateBody(recordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(201).json({ data: await service.recordMockInterview(userId, role, req.body) });
  })
);

export default router;
