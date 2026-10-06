import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { rateLimitPerUser } from "../../middleware/rateLimit";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, unauthorized } from "../../utils/errors";
import { cvDataSchema, saveCvSchema } from "./cv.schema";
import * as service from "./cv.service";

const router = Router();
router.use(requireAuth, requireRole("STUDENT"));

const userId = (req: Request) => {
  if (!req.auth) throw unauthorized();
  return req.auth.userId;
};

router.get(
  "/me",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.getCv(userId(req)) });
  })
);

router.get(
  "/me/prefill",
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.getPrefill(userId(req)) });
  })
);

router.put(
  "/me",
  validateBody(saveCvSchema),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.saveCv(userId(req), req.body.template, req.body.data) });
  })
);

router.get(
  "/me/export/:format",
  rateLimitPerUser(30, 10 * 60 * 1000),
  asyncHandler(async (req: Request, res: Response) => {
    const format = req.params.format;
    if (format !== "pdf" && format !== "docx") throw badRequest("Format must be pdf or docx");
    const file = await service.exportCv(userId(req), format);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(file.buffer);
  })
);

router.post(
  "/me/save-as-resume",
  rateLimitPerUser(10, 10 * 60 * 1000),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.saveCvAsResume(userId(req)) });
  })
);

router.post(
  "/me/suggest-summary",
  rateLimitPerUser(15, 10 * 60 * 1000),
  validateBody(z.object({ data: cvDataSchema.optional() })),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ data: await service.suggestSummary(userId(req), req.body.data) });
  })
);

export default router;
