import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { listSkills } from "./skills.service";

export const getSkills = asyncHandler(async (_req: Request, res: Response) => {
  const skills = await listSkills();
  res.status(200).json({ data: skills });
});
