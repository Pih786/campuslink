import { env } from "../config/env";

const DEFAULT_TIMEOUT_MS = 5000;
const LLM_TIMEOUT_MS = 30000;

// ------------------------------------------------------------------
// Shared request/response shapes (mirrors the AI service contract)
// ------------------------------------------------------------------

export interface AiStudentSkill {
  name: string;
  proficiency: number;
  verified?: boolean;
}

export interface AiStudentProject {
  title: string;
  technologies: string[];
}

export interface AiStudentCertification {
  name: string;
  verified?: boolean;
}

export interface AiMatchStudent {
  id: string;
  cgpa: number;
  branch: string;
  skills: AiStudentSkill[];
  projects: AiStudentProject[];
  certifications: AiStudentCertification[];
  experienceMonths: number;
}

export interface AiJobRequirement {
  type: string;
  skillName?: string;
  mandatory?: boolean;
  weight?: number;
  minimumProficiency?: number;
  value?: unknown;
}

export interface AiMatchJob {
  id: string;
  title: string;
  requirements: AiJobRequirement[];
}

export interface AiMatchBreakdown {
  skill_match: number;
  education: number;
  projects: number;
  certifications: number;
  assessment: number;
  experience: number;
}

export interface AiMatchResult {
  overall: number;
  breakdown: AiMatchBreakdown;
  matched_skills: string[];
  gap_skills: string[];
  explanation: string[];
  aiUnavailable?: boolean;
}

export interface AiResumeAnalysis {
  skills: string[];
  projects: AiStudentProject[];
  education: { degree?: string; cgpa?: number } | null;
  experience: unknown[];
  certifications: string[];
  aiUnavailable?: boolean;
}

export interface AiJdAnalysis {
  role: string | null;
  skills: string[];
  mandatorySkills: string[];
  optionalSkills: string[];
  minimumCgpa: number | null;
  branches: string[];
  experienceYears?: number | null;
  location?: string | null;
  responsibilities?: string[];
  source?: "llm" | "rules";
  aiUnavailable?: boolean;
}

export interface AiCopilotResult {
  answer: string;
  source: "llm" | "unavailable";
  unverifiedNumbers: string[];
}

export interface AiSkillGapResult {
  matched: string[];
  missing: string[];
  aiUnavailable?: boolean;
}

export interface AiReadinessResult {
  score: number;
  band: "Not Ready" | "Developing" | "Ready" | "Highly Employable";
  aiUnavailable?: boolean;
}

// ------------------------------------------------------------------
// Low-level POST helper with timeout. Returns null on any failure
// (network error, timeout, non-2xx) so callers can fall back.
// ------------------------------------------------------------------

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ------------------------------------------------------------------
// Fallback (Node-side) scorers — used whenever the AI service is
// unreachable or errors, so the platform still works standalone.
// ------------------------------------------------------------------

export function fallbackMatchScore(
  studentSkillNames: string[],
  jobRequiredSkillNames: string[]
): AiMatchResult {
  const studentSet = new Set(studentSkillNames.map((s) => s.toLowerCase().trim()));
  const requiredNorm = jobRequiredSkillNames.map((s) => s.trim());
  const requiredSet = new Set(requiredNorm.map((s) => s.toLowerCase()));

  let overall: number;
  if (requiredSet.size === 0) {
    overall = 100;
  } else {
    const intersectionCount = [...requiredSet].filter((s) => studentSet.has(s)).length;
    const skillOverlap = intersectionCount / requiredSet.size;
    overall = Math.round(skillOverlap * 100);
  }

  const matched = requiredNorm.filter((s) => studentSet.has(s.toLowerCase()));
  const gap = requiredNorm.filter((s) => !studentSet.has(s.toLowerCase()));

  return {
    overall,
    breakdown: {
      skill_match: overall,
      education: 100,
      projects: 0,
      certifications: 0,
      assessment: 0,
      experience: 0,
    },
    matched_skills: matched,
    gap_skills: gap,
    explanation: ["AI service unavailable — score computed with basic skill-overlap fallback."],
    aiUnavailable: true,
  };
}

function fallbackSkillGap(studentSkills: string[], requiredSkills: string[]): AiSkillGapResult {
  const studentSet = new Set(studentSkills.map((s) => s.toLowerCase().trim()));
  const matched = requiredSkills.filter((s) => studentSet.has(s.toLowerCase().trim()));
  const missing = requiredSkills.filter((s) => !studentSet.has(s.toLowerCase().trim()));
  return { matched, missing, aiUnavailable: true };
}

function bandForScore(score: number): AiReadinessResult["band"] {
  if (score >= 80) return "Highly Employable";
  if (score >= 60) return "Ready";
  if (score >= 40) return "Developing";
  return "Not Ready";
}

// Mirrors ai-service compute_readiness so scores don't jump when the
// service is down: mean of proficiency/5 over required skills, absent = 0,
// and no required skills = 0 (nothing demonstrated).
export function fallbackReadiness(
  studentSkills: AiStudentSkill[],
  requiredSkills: string[]
): AiReadinessResult {
  if (requiredSkills.length === 0) {
    return { score: 0, band: bandForScore(0), aiUnavailable: true };
  }
  const proficiencyByName = new Map<string, number>();
  for (const s of studentSkills) {
    const key = s.name.toLowerCase().trim();
    proficiencyByName.set(key, Math.max(proficiencyByName.get(key) ?? 0, s.proficiency ?? 0));
  }
  const total = requiredSkills.reduce((sum, skill) => {
    const prof = proficiencyByName.get(skill.toLowerCase().trim()) ?? 0;
    return sum + (Math.max(0, Math.min(5, prof)) / 5) * 100;
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round(total / requiredSkills.length)));
  return { score, band: bandForScore(score), aiUnavailable: true };
}

// ------------------------------------------------------------------
// Public client functions
// ------------------------------------------------------------------

export async function aiMatch(student: AiMatchStudent, job: AiMatchJob): Promise<AiMatchResult> {
  const result = await postJson<AiMatchResult>("/ai/match", { student, job });
  if (result) return result;

  const studentSkillNames = student.skills.map((s) => s.name);
  const jobRequiredSkillNames = job.requirements
    .filter((r) => r.type === "SKILL" && r.skillName)
    .map((r) => r.skillName as string);
  return fallbackMatchScore(studentSkillNames, jobRequiredSkillNames);
}

export async function aiAnalyzeResume(text: string): Promise<AiResumeAnalysis> {
  const result = await postJson<AiResumeAnalysis>("/ai/resume/analyze", { text });
  if (result) return result;
  return {
    skills: [],
    projects: [],
    education: null,
    experience: [],
    certifications: [],
    aiUnavailable: true,
  };
}

export async function aiAnalyzeJd(text: string): Promise<AiJdAnalysis> {
  const result = await postJson<AiJdAnalysis>("/ai/jd/analyze", { text }, LLM_TIMEOUT_MS);
  if (result) return result;
  return {
    role: null,
    skills: [],
    mandatorySkills: [],
    optionalSkills: [],
    minimumCgpa: null,
    branches: [],
    aiUnavailable: true,
  };
}

export async function aiCopilot(
  question: string,
  facts: Record<string, unknown>,
  audience: string
): Promise<AiCopilotResult> {
  const result = await postJson<AiCopilotResult>(
    "/ai/copilot",
    { question, facts, audience },
    LLM_TIMEOUT_MS
  );
  if (result) return result;
  return {
    answer:
      "The AI service is unreachable right now, so I can't compose an answer. The underlying data is still available in the dashboards.",
    source: "unavailable",
    unverifiedNumbers: [],
  };
}

export async function aiSkillGap(
  studentSkills: string[],
  requiredSkills: string[]
): Promise<AiSkillGapResult> {
  const result = await postJson<AiSkillGapResult>("/ai/skill-gap", {
    studentSkills,
    requiredSkills,
  });
  if (result) return result;
  return fallbackSkillGap(studentSkills, requiredSkills);
}

export async function aiReadiness(
  studentSkills: AiStudentSkill[],
  requiredSkills: string[]
): Promise<AiReadinessResult> {
  const result = await postJson<AiReadinessResult>("/ai/readiness", {
    studentSkills,
    requiredSkills,
  });
  if (result) return result;
  return fallbackReadiness(studentSkills, requiredSkills);
}

// ------------------------------------------------------------------
// CV summary and AI tutor
// ------------------------------------------------------------------

export interface AiCvSummaryInput {
  headline: string;
  education: string[];
  skills: string[];
  projects: { title: string; tech: string[] }[];
  experience: string[];
  certifications: string[];
}

export interface AiCvSummaryResult {
  summary: string;
  source: "llm" | "template";
}

function joinWords(items: string[]) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

export async function aiCvSummary(input: AiCvSummaryInput): Promise<AiCvSummaryResult> {
  const result = await postJson<AiCvSummaryResult>("/ai/cv/summary", input, LLM_TIMEOUT_MS);
  if (result) return result;
  const parts: string[] = [];
  const lead = input.headline || input.education[0];
  if (lead) parts.push(`${lead.replace(/\.$/, "")}.`);
  if (input.skills.length) parts.push(`Skilled in ${joinWords(input.skills.slice(0, 5))}.`);
  const titles = input.projects.map((p) => p.title).filter(Boolean).slice(0, 2);
  if (titles.length) parts.push(`Built projects including ${joinWords(titles)}.`);
  return { summary: parts.join(" "), source: "template" };
}

export interface AiTutorResource {
  id: string;
  title: string;
  type: string;
  provider: string;
  level: string;
  description: string;
}

export interface AiTutorResult {
  answer: string;
  resources: string[];
  source: "llm" | "unavailable";
}

export async function aiTutor(input: {
  question: string;
  skill?: string;
  studentSkills: string[];
  history: { role: "user" | "assistant"; content: string }[];
  resources: AiTutorResource[];
}): Promise<AiTutorResult> {
  const result = await postJson<AiTutorResult>("/ai/tutor", input, LLM_TIMEOUT_MS);
  if (result) return result;
  return {
    answer: "The AI tutor is unreachable right now. The resources on this page are still a good place to start.",
    resources: [],
    source: "unavailable",
  };
}

// ------------------------------------------------------------------
// Written (free-text) assessment scoring
// ------------------------------------------------------------------

export interface AiWrittenQuestion {
  id: string;
  prompt: string;
  rubric?: string;
  maxPoints: number;
  maxWords?: number;
}

export interface AiWrittenResult {
  id: string;
  score: number;
  clarity: number;
  structure: number;
  grammar: number;
  relevance: number;
  feedback: string;
}

export interface AiWrittenScores {
  results: AiWrittenResult[];
  source: "llm" | "heuristic";
}

// Null when the AI service is unreachable: the caller keeps the attempt open
// rather than scoring a student's written answers with nothing.
export async function aiScoreWritten(
  questions: AiWrittenQuestion[],
  answers: Record<string, string>
): Promise<AiWrittenScores | null> {
  return postJson<AiWrittenScores>("/ai/assess/written", { questions, answers }, LLM_TIMEOUT_MS);
}
