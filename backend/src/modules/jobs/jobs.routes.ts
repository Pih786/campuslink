import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createJobSchema, updateJobSchema } from "./jobs.validators";
import * as controller from "./jobs.controller";

const router = Router();

router.get("/", requireAuth, controller.listJobs);
router.post(
  "/",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createJobSchema),
  controller.createJob
);
router.get("/:id", requireAuth, controller.getJobById);
router.put(
  "/:id",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(updateJobSchema),
  controller.updateJob
);

export default router;
