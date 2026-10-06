import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { prisma } from "../../config/prisma";
import * as codingService from "./coding.service";

export const listProblems = asyncHandler(async (req: Request, res: Response) => {
  const result = await codingService.listProblems(req);
  res.status(200).json(result);
});

export const getProblemById = asyncHandler(async (req: Request, res: Response) => {
  const problem = await codingService.getProblemById(req.params.id);
  res.status(200).json({ data: problem });
});

export const createProblem = asyncHandler(async (req: Request, res: Response) => {
  const problem = await codingService.createProblem(req.body);
  res.status(201).json({ data: problem });
});

export const runCode = asyncHandler(async (req: Request, res: Response) => {
  const result = await codingService.runCode(req.params.id, req.body);
  res.status(200).json({ data: result });
});

export const submitCode = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await prisma.student.findUnique({ where: { userId: req.auth.userId } });
  if (!student) throw unauthorized("Student profile not found");
  const submission = await codingService.submitCode(student.id, req.params.id, req.body);
  res.status(201).json({ data: submission });
});

export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await codingService.listSubmissions(req, req.auth.userId, req.auth.role, {
    problemId: req.query.problemId as string | undefined,
  });
  res.status(200).json(result);
});
