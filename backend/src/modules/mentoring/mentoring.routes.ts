import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as service from "./mentoring.service";

const ESCALATION_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;

const auth = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth;
};

const router = Router();
router.use(requireAuth);

const officer = requireRole("PLACEMENT_OFFICER");
const staff = requireRole("PLACEMENT_OFFICER", "MENTOR");

router.get(
  "/me",
  requireRole("STUDENT"),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.myMentor(auth(req).userId) });
  })
);

router.get(
  "/mentors",
  officer,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.listMentors(userId, role) });
  })
);

router.post(
  "/assignments",
  officer,
  validateBody(z.object({ studentIds: z.array(z.string().uuid()).min(1).max(200), mentorId: z.string().uuid() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.assignMentor(userId, role, req.body.studentIds, req.body.mentorId) });
  })
);

router.delete(
  "/assignments/:studentId",
  officer,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.unassignMentor(userId, role, req.params.studentId) });
  })
);

router.get(
  "/at-risk",
  officer,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.atRiskQueue(userId, role) });
  })
);

router.get(
  "/escalations",
  staff,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    const status = ESCALATION_STATUSES.includes(req.query.status as (typeof ESCALATION_STATUSES)[number])
      ? (req.query.status as (typeof ESCALATION_STATUSES)[number])
      : undefined;
    res.status(200).json({ data: await service.listEscalations(userId, role, status) });
  })
);

router.post(
  "/escalations",
  officer,
  validateBody(
    z.object({
      studentId: z.string().uuid(),
      reason: z.string().trim().min(5, "Say briefly why this student needs support").max(1000),
      mentorId: z.string().uuid().optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(201).json({ data: await service.createEscalation(userId, role, req.body) });
  })
);

router.patch(
  "/escalations/:id",
  staff,
  validateBody(z.object({ status: z.enum(ESCALATION_STATUSES), resolution: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.updateEscalation(userId, role, req.params.id, req.body) });
  })
);

router.get(
  "/mentees",
  staff,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.listMentees(userId, role) });
  })
);

router.get(
  "/overview",
  staff,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.mentorOverview(userId, role) });
  })
);

router.get(
  "/students/:studentId",
  staff,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.studentOverview(userId, role, req.params.studentId) });
  })
);

router.get(
  "/students/:studentId/notes",
  staff,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(200).json({ data: await service.listNotes(userId, role, req.params.studentId) });
  })
);

router.post(
  "/students/:studentId/notes",
  staff,
  validateBody(
    z.object({
      body: z.string().trim().min(2).max(2000),
      followUpAt: z.string().datetime({ offset: true }).optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, role } = auth(req);
    res.status(201).json({ data: await service.addNote(userId, role, req.params.studentId, req.body) });
  })
);

export default router;
