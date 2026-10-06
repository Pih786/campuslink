// Mock interviews: practice interviews the placement office or a mentor runs
// before a student meets recruiters. They feed three places:
//   * eligibility: a job can set a MOCK_INTERVIEW benchmark (latest score),
//   * readiness: strong sub-scores become verified skill evidence
//     (communication -> "Communication", technical -> the focus skill),
//   * risk: a low latest score is flagged on the at-risk list.
import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { forbidden, notFound } from "../../utils/errors";
import { assertStudentInCollege, resolveScope } from "../../utils/tenancy";
import { notify } from "../notifications/notifications.service";
import { findOrCreateSkill } from "../skills/skills.service";
import { recordSkillEvidence } from "../skill-evidence/skill-evidence.service";

// Sub-scores (out of 10) at or above this count as verified evidence.
export const EVIDENCE_THRESHOLD = 6;

// Spread into a student query so eligibility can see the latest mock score.
export const latestMockInclude = {
  mockInterviews: {
    orderBy: { conductedAt: "desc" as const },
    take: 1,
    select: { overallScore: true },
  },
};

export function latestMockScore(student: { mockInterviews?: { overallScore: number }[] }): number | null {
  return student.mockInterviews?.[0]?.overallScore ?? null;
}

export function overallScore(scores: { technical: number; communication: number; problemSolving: number; confidence: number }) {
  const mean = (scores.technical + scores.communication + scores.problemSolving + scores.confidence) / 4;
  return Math.round(mean * 10) / 10;
}

const interviewerSelect = { select: { id: true, fullName: true, role: true } } as const;
const studentSelect = {
  select: { id: true, department: true, user: { select: { fullName: true, email: true } } },
} as const;

export interface RecordMockInterviewInput {
  studentId: string;
  conductedAt?: string;
  focus?: string;
  skillName?: string;
  technical: number;
  communication: number;
  problemSolving: number;
  confidence: number;
  feedback?: string;
}

export async function recordMockInterview(userId: string, role: Role, input: RecordMockInterviewInput) {
  const scope = await resolveScope(userId, role);
  const student = await prisma.student.findUnique({ where: { id: input.studentId }, select: { id: true, userId: true } });
  if (!student) throw notFound("Student");
  await assertStudentInCollege(scope, student.id);

  const interview = await prisma.mockInterview.create({
    data: {
      studentId: student.id,
      interviewerId: userId,
      conductedAt: input.conductedAt ? new Date(input.conductedAt) : new Date(),
      focus: input.focus?.trim() || (input.skillName ? input.skillName.trim() : null),
      technical: input.technical,
      communication: input.communication,
      problemSolving: input.problemSolving,
      confidence: input.confidence,
      overallScore: overallScore(input),
      feedback: input.feedback?.trim() || null,
    },
    include: { interviewer: interviewerSelect },
  });

  // Strong sub-scores become verified skill evidence, which raises readiness
  // and match scores the same way a passed lab or assessment does.
  const evidence: { skill: string; score: number }[] = [];
  if (input.communication >= EVIDENCE_THRESHOLD) evidence.push({ skill: "Communication", score: input.communication * 10 });
  if (input.skillName?.trim() && input.technical >= EVIDENCE_THRESHOLD) {
    evidence.push({ skill: input.skillName.trim(), score: input.technical * 10 });
  }
  for (const e of evidence) {
    const skill = await findOrCreateSkill(e.skill);
    await recordSkillEvidence({
      studentId: student.id,
      skillId: skill.id,
      sourceType: "MOCK_INTERVIEW",
      sourceId: interview.id,
      score: e.score,
    });
  }

  await notify([student.userId], {
    type: "MOCK_INTERVIEW_RECORDED",
    title: `Mock interview scored ${interview.overallScore}/10`,
    body: interview.feedback
      ? `Feedback: ${interview.feedback.slice(0, 300)}`
      : "See the breakdown and feedback on your mock interviews page.",
    link: "/student/mock-interviews",
  });

  return { ...interview, verifiedSkills: evidence.map((e) => e.skill) };
}

export async function myMockInterviews(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw notFound("Student profile");
  return prisma.mockInterview.findMany({
    where: { studentId: student.id },
    include: { interviewer: interviewerSelect },
    orderBy: { conductedAt: "desc" },
  });
}

// Staff view: every mock interview at the caller's college, or one student's.
export async function listMockInterviews(userId: string, role: Role, studentId?: string) {
  const scope = await resolveScope(userId, role);
  if (!scope.isAdmin && !scope.collegeId) throw forbidden();
  if (studentId) await assertStudentInCollege(scope, studentId);
  return prisma.mockInterview.findMany({
    where: {
      ...(studentId ? { studentId } : {}),
      ...(scope.isAdmin ? {} : { student: { collegeId: scope.collegeId } }),
    },
    include: { interviewer: interviewerSelect, student: studentSelect },
    orderBy: { conductedAt: "desc" },
    take: 200,
  });
}
