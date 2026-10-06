import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as controller from "./predictive.controller";

// Mounted at /api/v1/predictive -- a separate top-level path from
// /api/v1/matching, matching the separation of the two backing systems.
const router = Router();

router.get(
  "/jobs/:jobId/candidates",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"),
  controller.getPredictiveCandidates
);
router.get("/model-info", requireAuth, requireRole("RECRUITER", "PLACEMENT_OFFICER", "ADMIN"), controller.getModelInfo);

export default router;
