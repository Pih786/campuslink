import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import { prisma } from "../../config/prisma";
import * as sqlLabService from "./sql-lab.service";

export const listProblems = asyncHandler(async (req: Request, res: Response) => {
  const result = await sqlLabService.listProblems(req);
  res.status(200).json(result);
});

export const getProblemById = asyncHandler(async (req: Request, res: Response) => {
  const problem = await sqlLabService.getProblemById(req.params.id);
  res.status(200).json({ data: problem });
});

export const createProblem = asyncHandler(async (req: Request, res: Response) => {
  const problem = await sqlLabService.createProblem(req.body);
  res.status(201).json({ data: problem });
});

export const runQuery = asyncHandler(async (req: Request, res: Response) => {
  const result = await sqlLabService.runQuery(req.params.id, req.body.query);
  res.status(200).json({ data: result });
});

export const submitQuery = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const student = await prisma.student.findUnique({ where: { userId: req.auth.userId } });
  if (!student) throw unauthorized("Student profile not found");
  const result = await sqlLabService.submitQuery(student.id, req.params.id, req.body.query);
  res.status(201).json({ data: result });
});

export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw unauthorized();
  const result = await sqlLabService.listSubmissions(req, req.auth.userId, req.auth.role, {
    problemId: req.query.problemId as string | undefined,
  });
  res.status(200).json(result);
});
