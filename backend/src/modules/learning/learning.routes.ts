import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { rateLimitPerUser } from "../../middleware/rateLimit";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, unauthorized } from "../../utils/errors";
import * as service from "./learning.service";

const RESOURCE_TYPES = ["VIDEO", "ARTICLE", "COURSE", "PRACTICE", "DOCUMENTATION"] as const;
const STAFF = ["PLACEMENT_OFFICER", "MENTOR", "ADMIN"] as const;

const createResourceSchema = z.object({
  skillName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(200),
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link"),
  type: z.enum(RESOURCE_TYPES),
  provider: z.string().trim().max(80).optional(),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  durationMinutes: z.number().int().min(1).max(20000).optional(),
  description: z.string().trim().max(400).optional(),
});

const progressSchema = z.object({
  status: z.enum(["SAVED", "IN_PROGRESS", "COMPLETED"]).nullable(),
});

const tutorSchema = z.object({
  question: z.string().trim().min(2).max(1500),
  skill: z.string().trim().max(80).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(10)
    .default([]),
});

const auth = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth;
};

const router = Router();
router.use(requireAuth);

router.get(
  "/resources",
  requireRole("STUDENT", ...STAFF),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    const type = RESOURCE_TYPES.includes(req.query.type as (typeof RESOURCE_TYPES)[number])
      ? (req.query.type as (typeof RESOURCE_TYPES)[number])
      : undefined;
    res.status(200).json({
      data: await service.listResources(userId, role, {
        skill: typeof req.query.skill === "string" ? req.query.skill : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        type,
      }),
    });
  })
);

router.post(
  "/resources",
  requireRole(...STAFF),
  validateBody(createResourceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(201).json({ data: await service.createResource(userId, role, req.body) });
  })
);

router.delete(
  "/resources/:id",
  requireRole(...STAFF),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.deleteResource(userId, role, req.params.id) });
  })
);

router.put(
  "/resources/:id/progress",
  requireRole("STUDENT"),
  validateBody(progressSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.setProgress(auth(req).userId, req.params.id, req.body.status) });
  })
);

router.get(
  "/me",
  requireRole("STUDENT"),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.myLearning(auth(req).userId) });
  })
);

router.get(
  "/plan",
  requireRole("STUDENT"),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.getPlan(auth(req).userId) });
  })
);

router.get(
  "/videos",
  requireRole("STUDENT", ...STAFF),
  rateLimitPerUser(60, 10 * 60 * 1000),
  asyncHandler(async (req: Request, res: Response) => {
    const skill = typeof req.query.skill === "string" ? req.query.skill.trim() : "";
    if (!skill || skill.length > 80) throw badRequest("Pass the skill to find videos for");
    const mode = req.query.mode === "improve" ? "improve" : "learn";
    res.status(200).json({ data: await service.skillVideos(skill, mode) });
  })
);

router.post(
  "/tutor",
  requireRole("STUDENT"),
  rateLimitPerUser(20, 10 * 60 * 1000),
  validateBody(tutorSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.askTutor(auth(req).userId, req.body) });
  })
);

router.get(
  "/students/:studentId",
  requireRole(...STAFF),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.studentLearning(userId, role, req.params.studentId) });
  })
);

export default router;
