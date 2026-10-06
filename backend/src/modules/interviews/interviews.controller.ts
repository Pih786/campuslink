import { Request, Response } from "express";
import { InterviewStatus } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as interviewsService from "./interviews.service";

export const createInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const interview = await interviewsService.createInterview(req.auth.userId, req.auth.role, req.body);
  res.status(201).json({ data: interview });
});

export const listInterviews = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await interviewsService.listInterviews(req, req.auth.userId, req.auth.role, {
    applicationId: req.query.applicationId as string | undefined,
    status: req.query.status as InterviewStatus | undefined,
  });
  res.status(200).json(result);
});

export const updateInterview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const interview = await interviewsService.updateInterview(
    req.params.id,
    req.auth.userId,
    req.auth.role,
    req.body
  );
  res.status(200).json({ data: interview });
});
