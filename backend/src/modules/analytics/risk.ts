// Pure scoring for placement readiness and unplaced-risk. Kept rule-based so
// every flag can be explained to the student and the placement office.

export type ReadinessBand = "Not Ready" | "Developing" | "Ready" | "Highly Employable";

export function bandFor(score: number): ReadinessBand {
  if (score >= 80) return "Highly Employable";
  if (score >= 60) return "Ready";
  if (score >= 40) return "Developing";
  return "Not Ready";
}

// Same formula as ai-service compute_readiness: mean of proficiency/5 over
// the role's required skills (absent = 0); no required skills = 0.
export function roleReadinessScore(proficiencyBySkillId: Map<string, number>, requiredSkillIds: string[]): number {
  if (requiredSkillIds.length === 0) return 0;
  const total = requiredSkillIds.reduce((sum, id) => {
    const prof = proficiencyBySkillId.get(id) ?? 0;
    return sum + (Math.max(0, Math.min(5, prof)) / 5) * 100;
  }, 0);
  return Math.round(total / requiredSkillIds.length);
}

export interface RiskInput {
  applications: number;
  rejections: number;
  noShows: number;
  eligibleOpenRoles: number;
  openRoles: number;
  bestReadiness: number | null;
  backlogCount: number;
  profileCompletion: number;
  verifiedSkills: number;
  // Latest mock-interview score out of 10; null/undefined when none recorded.
  mockInterviewScore?: number | null;
}

export interface RiskFactor {
  points: number;
  reason: string;
}

export interface RiskAssessment {
  score: number;
  level: "High" | "Medium" | "Low";
  factors: RiskFactor[];
}

export const RISK_LEVELS = { high: 50, medium: 25 } as const;

export function assessUnplacedRisk(input: RiskInput): RiskAssessment {
  const factors: RiskFactor[] = [];
  const add = (points: number, reason: string) => factors.push({ points, reason });

  if (input.applications === 0) add(25, "Hasn't applied to any role yet");
  if (input.openRoles > 0 && input.eligibleOpenRoles === 0) add(25, "Not eligible for any open role");
  else if (input.openRoles > 0 && input.eligibleOpenRoles === 1) add(10, "Eligible for only one open role");

  if (input.bestReadiness != null) {
    if (input.bestReadiness < 40) add(20, `Best role readiness is ${input.bestReadiness} (not ready)`);
    else if (input.bestReadiness < 60) add(10, `Best role readiness is ${input.bestReadiness} (developing)`);
  }

  if (input.rejections >= 2) add(10, `Rejected from ${input.rejections} applications`);
  if (input.noShows > 0) add(10, `Missed ${input.noShows} interview${input.noShows === 1 ? "" : "s"}`);
  if (input.backlogCount > 0) add(10, `${input.backlogCount} active backlog${input.backlogCount === 1 ? "" : "s"}`);
  if (input.profileCompletion < 60) add(10, `Profile only ${input.profileCompletion}% complete`);
  if (input.verifiedSkills === 0) add(5, "No skills verified in labs or assessments");
  if (input.mockInterviewScore != null && input.mockInterviewScore < 5) {
    add(10, `Latest mock-interview score is ${input.mockInterviewScore}/10`);
  }

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  const level = score >= RISK_LEVELS.high ? "High" : score >= RISK_LEVELS.medium ? "Medium" : "Low";
  factors.sort((a, b) => b.points - a.points);
  return { score, level, factors };
}
