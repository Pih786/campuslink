import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { documentUpload } from "../../utils/upload";
import {
  convertInternshipSchema,
  createOfferSchema,
  requestDocumentSchema,
  respondOfferSchema,
  reviewDocumentSchema,
  updateOfferSchema,
  withdrawOfferSchema,
} from "./offers.validators";
import * as controller from "./offers.controller";

const router = Router();
const EMPLOYER_ROLES = ["RECRUITER", "PLACEMENT_OFFICER", "ADMIN"] as const;

router.get("/", requireAuth, controller.listOffers);
router.post("/", requireAuth, requireRole(...EMPLOYER_ROLES), validateBody(createOfferSchema), controller.createOffer);
router.post("/reminders/run", requireAuth, requireRole("PLACEMENT_OFFICER", "ADMIN"), controller.runReminders);
router.get("/:id", requireAuth, controller.getOfferById);
router.patch("/:id", requireAuth, requireRole(...EMPLOYER_ROLES), validateBody(updateOfferSchema), controller.updateOffer);
router.post("/:id/respond", requireAuth, requireRole("STUDENT"), validateBody(respondOfferSchema), controller.respondToOffer);
router.post("/:id/withdraw", requireAuth, requireRole(...EMPLOYER_ROLES), validateBody(withdrawOfferSchema), controller.withdrawOffer);
router.post(
  "/:id/conversion",
  requireAuth,
  requireRole(...EMPLOYER_ROLES),
  validateBody(convertInternshipSchema),
  controller.convertInternship
);

router.post(
  "/:id/documents",
  requireAuth,
  requireRole(...EMPLOYER_ROLES),
  validateBody(requestDocumentSchema),
  controller.requestDocument
);
router.post("/:id/documents/:documentId/upload", requireAuth, documentUpload.single("file"), controller.uploadDocument);
router.post(
  "/:id/documents/:documentId/review",
  requireAuth,
  requireRole(...EMPLOYER_ROLES),
  validateBody(reviewDocumentSchema),
  controller.reviewDocument
);
router.get("/:id/documents/:documentId/file", requireAuth, controller.downloadDocument);

export default router;
