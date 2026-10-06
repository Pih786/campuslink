import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { prisma } from "../../config/prisma";
import * as assessmentsService from "./assessments.service";

async function requireStudent(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw unauthorized("Student profile not found");
  return student;
}

export const listAssessments = asyncHandler(async (req: Request, res: Response) => {
  const result = await assessmentsService.listAssessments(req);
  res.status(200).json(result);
});

export const getAssessmentById = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await assessmentsService.getAssessmentById(req.params.id);
  res.status(200).json({ data: assessment });
});

export const createAssessment = asyncHandler(async (req: Request, res: Response) => {
  const assessment = await assessmentsService.createAssessment(req.body);
  res.status(201).json({ data: assessment });
});

export const startAttempt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await requireStudent(req.auth.userId);
  const result = await assessmentsService.startAttempt(student.id, req.params.id);
  res.status(201).json({ data: result });
});

export const submitAttempt = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await requireStudent(req.auth.userId);
  const result = await assessmentsService.submitAttempt(
    student.id,
    req.params.id,
    req.params.attemptId,
    req.body
  );
  res.status(200).json({ data: result });
});

export const listAttempts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await assessmentsService.listAttempts(
    req,
    req.auth.userId,
    req.auth.role,
    req.params.id
  );
  res.status(200).json(result);
});
