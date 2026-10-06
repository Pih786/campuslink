import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { getSkills } from "./skills.controller";

const router = Router();

router.get("/", requireAuth, getSkills);

export default router;
