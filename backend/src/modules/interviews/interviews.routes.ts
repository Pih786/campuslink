import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { createInterviewSchema, updateInterviewSchema } from "./interviews.validators";
import * as controller from "./interviews.controller";

const router = Router();

router.get("/", requireAuth, controller.listInterviews);
router.post(
  "/",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(createInterviewSchema),
  controller.createInterview
);
router.patch(
  "/:id",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  validateBody(updateInterviewSchema),
  controller.updateInterview
);

export default router;
