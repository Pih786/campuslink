import { Request } from "express";
import { prisma } from "../../config/prisma";
import { notFound, badRequest } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { findOrCreateSkill } from "../skills/skills.service";
import { recordSkillEvidence } from "../skill-evidence/skill-evidence.service";
import { runOnJudge0, isSupportedLanguage } from "../../utils/judge0-client";
import { CreateCodingProblemInput, RunOrSubmitCodeInput } from "./coding.validators";

interface TestCase {
  input: string;
  expectedOutput: string;
}

const problemListInclude = { skill: true } as const;

export async function listProblems(req: Request) {
  const pagination = getPagination(req);
  const [problems, total] = await Promise.all([
    prisma.codingProblem.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        difficulty: true,
        skill: true,
        createdAt: true,
      },
    }),
    prisma.codingProblem.count(),
  ]);
  return paginatedResponse(problems, total, pagination);
}

export async function getProblemById(id: string) {
  const problem = await prisma.codingProblem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      skill: true,
      starterCode: true,
      visibleTests: true,
      // hiddenTests deliberately excluded — never sent to the client
    },
  });
  if (!problem) throw notFound("Coding problem");
  return problem;
}

export async function createProblem(input: CreateCodingProblemInput) {
  let skillId: string | undefined;
  if (input.skillName) {
    const skill = await findOrCreateSkill(input.skillName);
    skillId = skill.id;
  }

  return prisma.codingProblem.create({
    data: {
      title: input.title,
      description: input.description,
      difficulty: input.difficulty,
      skillId,
      starterCode: input.starterCode,
      visibleTests: input.visibleTests,
      hiddenTests: input.hiddenTests,
    },
    include: problemListInclude,
  });
}

async function runTestCases(language: string, code: string, tests: TestCase[]) {
  const results = [];
  for (const test of tests) {
    const result = await runOnJudge0({
      language,
      code,
      stdin: test.input,
      expectedOutput: test.expectedOutput,
    });
    results.push({
      input: test.input,
      expectedOutput: test.expectedOutput,
      actualOutput: result.stdout,
      passed: result.passed,
      stderr: result.stderr,
    });
  }
  return results;
}

export async function runCode(problemId: string, input: RunOrSubmitCodeInput) {
  if (!isSupportedLanguage(input.language)) {
    throw badRequest(`Unsupported language: ${input.language}`);
  }

  const problem = await prisma.codingProblem.findUnique({
    where: { id: problemId },
    select: { visibleTests: true },
  });
  if (!problem) throw notFound("Coding problem");

  const visibleTests = problem.visibleTests as unknown as TestCase[];
  const results = await runTestCases(input.language, input.code, visibleTests);
  const passedCount = results.filter((r) => r.passed).length;

  return { passedCount, totalCount: results.length, results };
}

export async function submitCode(
  studentId: string,
  problemId: string,
  input: RunOrSubmitCodeInput
) {
  if (!isSupportedLanguage(input.language)) {
    throw badRequest(`Unsupported language: ${input.language}`);
  }

  const problem = await prisma.codingProblem.findUnique({
    where: { id: problemId },
  });
  if (!problem) throw notFound("Coding problem");

  const visibleTests = problem.visibleTests as unknown as TestCase[];
  const hiddenTests = problem.hiddenTests as unknown as TestCase[];
  const allTests = [...visibleTests, ...hiddenTests];

  const results = await runTestCases(input.language, input.code, allTests);
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  const submission = await prisma.codingSubmission.create({
    data: {
      problemId,
      studentId,
      language: input.language,
      code: input.code,
      mode: "SUBMIT",
      status: allPassed ? "PASSED" : "FAILED",
      passedCount,
      totalCount,
      output: results,
    },
  });

  if (allPassed && problem.skillId) {
    await recordSkillEvidence({
      studentId,
      skillId: problem.skillId,
      sourceType: "CODING",
      sourceId: submission.id,
      score: 100,
    });
  }

  return submission;
}

interface ListSubmissionsFilters {
  problemId?: string;
}

export async function listSubmissions(
  req: Request,
  userId: string,
  role: string,
  filters: ListSubmissionsFilters
) {
  const pagination = getPagination(req);
  const where: Record<string, unknown> = {};

  if (filters.problemId) where.problemId = filters.problemId;

  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) throw notFound("Student profile");
    where.studentId = student.id;
  }

  const [submissions, total] = await Promise.all([
    prisma.codingSubmission.findMany({
      where,
      include: { problem: { select: { id: true, title: true } } },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { submittedAt: "desc" },
    }),
    prisma.codingSubmission.count({ where }),
  ]);

  return paginatedResponse(submissions, total, pagination);
}
