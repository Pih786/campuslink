import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { assignmentUpload } from "../../utils/upload";
import * as service from "./assignments.service";

const auth = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth;
};

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "Use an http(s) link");

const createSchema = z.object({
  jobId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().min(10, "Describe what candidates should do").max(8000),
  dueAt: z.string().datetime({ offset: true }),
  maxScore: z.number().int().min(1).max(1000).default(100),
  applicationIds: z.array(z.string().uuid()).max(500).default([]),
});

const updateSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  instructions: z.string().trim().min(10).max(8000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});

const submitSchema = z.object({
  answerText: z.string().trim().max(20000).optional(),
  linkUrl: z.union([httpUrl, z.literal("")]).optional(),
});

const router = Router();
router.use(requireAuth);

const recruiter = requireRole("RECRUITER");

router.get(
  "/",
  recruiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
    res.status(200).json({ data: await service.listAssignments(userId, role, jobId) });
  })
);

router.post(
  "/",
  recruiter,
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(201).json({ data: await service.createAssignment(userId, role, req.body) });
  })
);

router.get(
  "/mine",
  requireRole("STUDENT"),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.mySubmissions(auth(req).userId) });
  })
);

router.post(
  "/submissions/:id/submit",
  requireRole("STUDENT"),
  assignmentUpload.single("file"),
  validateBody(submitSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.submit(auth(req).userId, req.params.id, req.body, req.file) });
  })
);

router.post(
  "/submissions/:id/review",
  recruiter,
  validateBody(z.object({ score: z.number().min(0), feedback: z.string().trim().max(4000).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.reviewSubmission(userId, role, req.params.id, req.body) });
  })
);

router.get(
  "/submissions/:id/file",
  requireRole("STUDENT", "RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    const file = await service.submissionFile(userId, role, req.params.id);
    res.setHeader("Cache-Control", "no-store");
    res.download(file.fullPath, file.fileName);
  })
);

router.get(
  "/:id",
  recruiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.getAssignment(userId, role, req.params.id) });
  })
);

router.patch(
  "/:id",
  recruiter,
  validateBody(updateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.updateAssignment(userId, role, req.params.id, req.body) });
  })
);

router.post(
  "/:id/candidates",
  recruiter,
  validateBody(z.object({ applicationIds: z.array(z.string().uuid()).min(1).max(500) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.addCandidates(userId, role, req.params.id, req.body.applicationIds) });
  })
);

export default router;
