import { Request } from "express";
import { prisma } from "../../config/prisma";
import { ApiError, notFound, badRequest } from "../../utils/errors";
import { AiWrittenResult, aiScoreWritten } from "../../utils/ai-client";
import { Prisma } from "@prisma/client";
import { getPagination, paginatedResponse } from "../../utils/pagination";
import { findOrCreateSkill } from "../skills/skills.service";
import { recordSkillEvidence } from "../skill-evidence/skill-evidence.service";
import { CreateAssessmentInput, SubmitAttemptInput } from "./assessments.validators";

export async function listAssessments(req: Request) {
  const pagination = getPagination(req);
  const [assessments, total] = await Promise.all([
    prisma.assessment.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        durationMinutes: true,
        passScore: true,
        skill: true,
        createdAt: true,
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.assessment.count(),
  ]);
  return paginatedResponse(assessments, total, pagination);
}

export async function getAssessmentById(id: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: {
      skill: true,
      // Never the answer key: no correct index, no rubric.
      questions: {
        select: { id: true, questionText: true, options: true, maxWords: true, points: true },
      },
    },
  });
  if (!assessment) throw notFound("Assessment");
  return assessment;
}

export async function createAssessment(input: CreateAssessmentInput) {
  let skillId: string | undefined;
  if (input.skillName) {
    const skill = await findOrCreateSkill(input.skillName);
    skillId = skill.id;
  }

  return prisma.assessment.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      durationMinutes: input.durationMinutes,
      passScore: input.passScore,
      skillId,
      questions: {
        create: input.questions.map((q) => ({
          questionText: q.questionText,
          options: q.options ?? [],
          correctOptionIndex: q.correctOptionIndex ?? -1,
          rubric: q.rubric,
          maxWords: q.maxWords,
          points: q.points,
        })),
      },
    },
    include: { skill: true, questions: true },
  });
}

export async function startAttempt(studentId: string, assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) throw notFound("Assessment");

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      assessmentId,
      studentId,
      answers: {},
    },
  });

  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    durationMinutes: assessment.durationMinutes,
  };
}

export async function submitAttempt(
  studentId: string,
  assessmentId: string,
  attemptId: string,
  input: SubmitAttemptInput
) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { assessment: { include: { questions: true } } },
  });
  if (!attempt) throw notFound("Assessment attempt");
  if (attempt.studentId !== studentId) throw badRequest("This attempt does not belong to you");
  if (attempt.assessmentId !== assessmentId) throw badRequest("Attempt does not match this assessment");
  if (attempt.submittedAt) throw badRequest("This attempt has already been submitted");

  let score = 0;
  let totalPoints = 0;
  // WRITTEN only: per-question feedback, and whether a real reader (the LLM)
  // scored it. Provisional (heuristic) scores never verify a skill.
  let feedback: { source: "llm" | "heuristic"; results: AiWrittenResult[] } | null = null;

  if (attempt.assessment.type === "WRITTEN") {
    const answers: Record<string, string> = {};
    for (const q of attempt.assessment.questions) {
      const value = input.answers[q.id];
      answers[q.id] = typeof value === "string" ? value : "";
    }
    const scored = await aiScoreWritten(
      attempt.assessment.questions.map((q) => ({
        id: q.id,
        prompt: q.questionText,
        rubric: q.rubric ?? undefined,
        maxPoints: q.points,
        maxWords: q.maxWords ?? undefined,
      })),
      answers
    );
    if (!scored) {
      // The attempt stays open so the student can submit again.
      throw new ApiError(503, "SCORING_UNAVAILABLE", "Your answers couldn't be scored right now. Please submit again in a minute.");
    }
    for (const q of attempt.assessment.questions) totalPoints += q.points;
    score = Math.round(scored.results.reduce((sum, r) => sum + r.score, 0));
    feedback = { source: scored.source, results: scored.results };
    input = { answers };
  } else {
    for (const question of attempt.assessment.questions) {
      totalPoints += question.points;
      const selected = input.answers[question.id];
      if (selected !== undefined && selected === question.correctOptionIndex) {
        score += question.points;
      }
    }
  }

  const percentage = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
  const passed = percentage >= attempt.assessment.passScore;

  const updated = await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      answers: input.answers,
      score,
      totalPoints,
      passed,
      ...(feedback ? { feedback: feedback as unknown as Prisma.InputJsonValue } : {}),
      submittedAt: new Date(),
    },
  });

  const verifies = passed && (!feedback || feedback.source === "llm");
  if (verifies && attempt.assessment.skillId) {
    await recordSkillEvidence({
      studentId,
      skillId: attempt.assessment.skillId,
      sourceType: "ASSESSMENT",
      sourceId: updated.id,
      score: Math.round(percentage),
    });
  }

  return {
    score: updated.score,
    totalPoints: updated.totalPoints,
    passed: updated.passed,
    feedback,
    // False when a pass was scored provisionally and so didn't verify the skill.
    skillVerified: Boolean(verifies && attempt.assessment.skillId),
  };
}

export async function listAttempts(
  req: Request,
  userId: string,
  role: string,
  assessmentId: string
) {
  const pagination = getPagination(req);
  const where: Record<string, unknown> = { assessmentId };

  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) throw notFound("Student profile");
    where.studentId = student.id;
  }

  const [attempts, total] = await Promise.all([
    prisma.assessmentAttempt.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { startedAt: "desc" },
    }),
    prisma.assessmentAttempt.count({ where }),
  ]);

  return paginatedResponse(attempts, total, pagination);
}
