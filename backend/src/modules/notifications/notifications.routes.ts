import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as service from "./notifications.service";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    const result = await service.listNotifications(req.auth.userId, {
      unreadOnly: req.query.unread === "true",
      limit: Number(req.query.limit) || 30,
    });
    res.status(200).json({ data: result.items, unread: result.unread });
  })
);

router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    res.status(200).json({ data: { unread: await service.unreadCount(req.auth.userId) } });
  })
);

router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    res.status(200).json({ data: await service.markAllRead(req.auth.userId) });
  })
);

router.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw unauthorized();
    res.status(200).json({ data: await service.markRead(req.auth.userId, req.params.id) });
  })
);

export default router;
