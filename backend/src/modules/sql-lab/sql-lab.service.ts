import { Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { sqlLabPrisma } from "../../config/sql-lab-prisma";
import { notFound } from "../../utils/errors";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { findOrCreateSkill } from "../skills/skills.service";
import { recordSkillEvidence } from "../skill-evidence/skill-evidence.service";
import { guardStudentQuery } from "../../utils/sql-guard";
import { CreateSqlProblemInput } from "./sql-lab.validators";

const PREVIEW_ROW_LIMIT = 50;

function schemaNameFor(problemId: string): string {
  return `sql_lab_p_${problemId.replace(/-/g, "").slice(0, 20)}`;
}

async function runStatements(sql: string, schemaName: string) {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });
}

export async function createProblem(input: CreateSqlProblemInput) {
  let skillId: string | undefined;
  if (input.skillName) {
    const skill = await findOrCreateSkill(input.skillName);
    skillId = skill.id;
  }

  const problem = await prisma.sqlProblem.create({
    data: {
      title: input.title,
      description: input.description,
      schemaSql: input.schemaSql,
      seedSql: input.seedSql,
      solutionQuery: input.solutionQuery,
      skillId,
    },
    include: { skill: true },
  });

  const schemaName = schemaNameFor(problem.id);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await prisma.$executeRawUnsafe(
    `GRANT USAGE ON SCHEMA "${schemaName}" TO sql_lab_runner`
  );
  await prisma.$executeRawUnsafe(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT SELECT ON TABLES TO sql_lab_runner`
  );

  await runStatements(input.schemaSql, schemaName);
  if (input.seedSql) {
    await runStatements(input.seedSql, schemaName);
  }

  // Grant on any tables that already existed before the default-privileges
  // rule was set (belt-and-suspenders — the ALTER DEFAULT PRIVILEGES above
  // only covers tables created AFTER it ran, but we set it before running
  // schemaSql, so this is just a safety net for statement-ordering edge cases).
  await prisma.$executeRawUnsafe(
    `GRANT SELECT ON ALL TABLES IN SCHEMA "${schemaName}" TO sql_lab_runner`
  );

  return problem;
}

const problemListSelect = {
  id: true,
  title: true,
  skill: true,
  createdAt: true,
} as const;

export async function listProblems(req: Request) {
  const pagination = getPagination(req);
  const [problems, total] = await Promise.all([
    prisma.sqlProblem.findMany({
      select: problemListSelect,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.sqlProblem.count(),
  ]);
  return paginatedResponse(problems, total, pagination);
}

export async function getProblemById(id: string) {
  const problem = await prisma.sqlProblem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      schemaSql: true,
      seedSql: true,
      skill: true,
      // solutionQuery deliberately excluded — never sent to the client
    },
  });
  if (!problem) throw notFound("SQL problem");
  return problem;
}

type Row = Record<string, unknown>;

function normalizeRowsForComparison(rows: Row[]): string[] {
  return rows
    .map((row) =>
      JSON.stringify(
        Object.keys(row)
          .sort()
          .reduce((acc, key) => {
            acc[key] = row[key];
            return acc;
          }, {} as Row)
      )
    )
    .sort();
}

function rowsAreEqual(a: Row[], b: Row[]): boolean {
  if (a.length !== b.length) return false;
  const normA = normalizeRowsForComparison(a);
  const normB = normalizeRowsForComparison(b);
  return normA.every((v, i) => v === normB[i]);
}

// node-postgres returns COUNT(*)/bigint columns as JS BigInt, which
// JSON.stringify (and Prisma's Json column serialization) cannot handle
// natively. Demo-scale row counts never exceed Number's safe range, so
// coercing to Number here is safe and keeps every downstream consumer
// (comparison, JSON storage, HTTP response) working with plain numbers.
function sanitizeRow(row: Row): Row {
  const sanitized: Row = {};
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return sanitized;
}

async function executeInSchema(schemaName: string, query: string): Promise<Row[]> {
  const rows = await sqlLabPrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '5000'`);
    return tx.$queryRawUnsafe<Row[]>(query);
  });
  return rows.map(sanitizeRow);
}

interface ExecutionOutcome {
  status: "PASSED" | "FAILED" | "ERROR";
  resultPreview: Row[] | null;
  expectedPreview: Row[] | null;
  errorMessage: string | null;
}

async function runAgainstProblem(problemId: string, studentQuery: string): Promise<ExecutionOutcome> {
  const guard = guardStudentQuery(studentQuery);
  if (!guard.ok) {
    return { status: "ERROR", resultPreview: null, expectedPreview: null, errorMessage: guard.reason ?? "Query rejected" };
  }

  const problem = await prisma.sqlProblem.findUnique({ where: { id: problemId } });
  if (!problem) throw notFound("SQL problem");

  const schemaName = schemaNameFor(problemId);

  let actualRows: Row[];
  try {
    actualRows = await executeInSchema(schemaName, studentQuery);
  } catch (err) {
    return {
      status: "ERROR",
      resultPreview: null,
      expectedPreview: null,
      errorMessage: err instanceof Error ? err.message : "Query execution failed",
    };
  }

  const expectedRows = await executeInSchema(schemaName, problem.solutionQuery);
  const passed = rowsAreEqual(actualRows, expectedRows);

  return {
    status: passed ? "PASSED" : "FAILED",
    resultPreview: actualRows.slice(0, PREVIEW_ROW_LIMIT),
    expectedPreview: passed ? null : expectedRows.slice(0, PREVIEW_ROW_LIMIT),
    errorMessage: null,
  };
}

export async function runQuery(problemId: string, query: string) {
  const outcome = await runAgainstProblem(problemId, query);
  return outcome;
}

export async function submitQuery(studentId: string, problemId: string, query: string) {
  const outcome = await runAgainstProblem(problemId, query);

  const submission = await prisma.sqlSubmission.create({
    data: {
      problemId,
      studentId,
      query,
      status: outcome.status,
      resultPreview: (outcome.resultPreview ?? undefined) as Prisma.InputJsonValue | undefined,
      errorMessage: outcome.errorMessage,
    },
  });

  if (outcome.status === "PASSED") {
    const problem = await prisma.sqlProblem.findUnique({ where: { id: problemId } });
    if (problem?.skillId) {
      await recordSkillEvidence({
        studentId,
        skillId: problem.skillId,
        sourceType: "SQL",
        sourceId: submission.id,
        score: 100,
      });
    }
  }

  return { id: submission.id, status: outcome.status, resultPreview: outcome.resultPreview };
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
    prisma.sqlSubmission.findMany({
      where,
      include: { problem: { select: { id: true, title: true } } },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { submittedAt: "desc" },
    }),
    prisma.sqlSubmission.count({ where }),
  ]);

  return paginatedResponse(submissions, total, pagination);
}
