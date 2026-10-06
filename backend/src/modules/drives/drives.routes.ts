import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { checkDriveSchema, createDriveSchema } from "./drives.validators";
import * as controller from "./drives.controller";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN", "RECRUITER"),
  controller.listDrives
);
router.post(
  "/",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createDriveSchema),
  controller.createDrive
);
router.post(
  "/check",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN"),
  validateBody(checkDriveSchema),
  controller.checkDrive
);
router.get(
  "/:id",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN", "RECRUITER"),
  controller.getDriveById
);
router.get(
  "/:id/conflicts",
  requireAuth,
  requireRole("PLACEMENT_OFFICER", "ADMIN", "RECRUITER"),
  controller.getDriveConflicts
);

export default router;
