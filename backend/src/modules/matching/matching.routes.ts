import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./matching.controller";

const router = Router();

router.get("/student/me/jobs", requireAuth, requireRole("STUDENT"), controller.getRecommendedJobs);

router.post(
  "/job/:jobId",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  controller.runMatchingForJob
);
router.get(
  "/job/:jobId/candidates",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  controller.getCandidatesForJob
);

export default router;
