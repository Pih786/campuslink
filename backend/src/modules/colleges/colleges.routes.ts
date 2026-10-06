import { Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { INDIAN_STATES_AND_UTS } from "../../utils/india";
import * as service from "./colleges.service";

const router = Router();

// Public: registration needs to search colleges before an account exists.
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await service.searchColleges({
      q: typeof req.query.q === "string" ? req.query.q.slice(0, 80) : undefined,
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      limit: Number(req.query.limit) || undefined,
    });
    res.status(200).json({ data });
  })
);

router.get("/states", (_req: Request, res: Response) => {
  res.status(200).json({ data: INDIAN_STATES_AND_UTS });
});

router.get(
  "/staff-requests",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    const status = ["PENDING", "APPROVED", "REJECTED"].includes(String(req.query.status))
      ? (String(req.query.status) as "PENDING" | "APPROVED" | "REJECTED")
      : "PENDING";
    res.status(200).json({ data: await service.listStaffRequests(req.auth.userId, req.auth.role, status) });
  })
);

router.post(
  "/staff-requests/:id/review",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(z.object({ decision: z.enum(["APPROVED", "REJECTED"]) })),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    res.status(200).json({
      data: await service.reviewStaffRequest(req.auth.userId, req.auth.role, req.params.id, req.body.decision),
    });
  })
);

router.get(
  "/mine/staff",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "MENTOR"),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    res.status(200).json({ data: await service.listCollegeStaff(req.auth.userId, req.auth.role) });
  })
);

router.get(
  "/unverified",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json({ data: await service.listUnverifiedColleges() });
  })
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  validateBody(
    z.object({
      name: z.string().trim().min(3).max(160).optional(),
      city: z.string().trim().min(2).max(80).optional(),
      state: z.enum(INDIAN_STATES_AND_UTS).optional(),
      category: z.string().trim().max(80).optional(),
      verified: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.updateCollege(req.params.id, req.body) });
  })
);

router.post(
  "/:id/merge",
  requireAuth,
  requireRole("ADMIN"),
  validateBody(z.object({ intoId: z.string().uuid() })),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.mergeCollege(req.params.id, req.body.intoId) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.getCollege(req.params.id) });
  })
);

export default router;
