import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { updateStudentSchema, addSkillSchema, addProjectSchema, addCertificationSchema } from "./students.validators";
import { resumeUpload } from "../../utils/upload";
import * as controller from "./students.controller";

const router = Router();

// Static /me routes MUST come before /:id
router.get("/me", requireAuth, requireRole("STUDENT"), controller.getMyProfile);
router.put(
  "/me",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(updateStudentSchema),
  controller.updateMyProfile
);
router.post(
  "/me/skills",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(addSkillSchema),
  controller.addSkill
);
router.post(
  "/me/resume",
  requireAuth,
  requireRole("STUDENT"),
  resumeUpload.single("resume"),
  controller.uploadResume
);
router.get("/me/resume", requireAuth, requireRole("STUDENT"), controller.getResume);
router.get("/me/resume/file", requireAuth, requireRole("STUDENT"), controller.downloadMyResume);
router.post("/me/projects", requireAuth, requireRole("STUDENT"), validateBody(addProjectSchema), controller.addProject);
router.delete("/me/projects/:projectId", requireAuth, requireRole("STUDENT"), controller.deleteProject);
router.post(
  "/me/certifications",
  requireAuth,
  requireRole("STUDENT"),
  validateBody(addCertificationSchema),
  controller.addCertification
);
router.delete("/me/certifications/:certificationId", requireAuth, requireRole("STUDENT"), controller.deleteCertification);
router.get("/me/skill-gaps", requireAuth, requireRole("STUDENT"), controller.getSkillGaps);
router.get("/me/readiness", requireAuth, requireRole("STUDENT"), controller.getReadiness);
router.get(
  "/me/skill-passport",
  requireAuth,
  requireRole("STUDENT"),
  controller.getSkillPassportForMe
);

router.get(
  "/",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "MENTOR", "ADMIN"),
  controller.listStudents
);
router.get(
  "/:id/resume/file",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "MENTOR", "ADMIN"),
  controller.downloadStudentResume
);
router.get(
  "/:id",
  requireAuth,
  requireRole("RECRUITER", "PLACEMENT_OFFICER", "MENTOR", "ADMIN"),
  controller.getStudentById
);

export default router;
