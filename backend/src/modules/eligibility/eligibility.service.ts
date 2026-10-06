// Pure, deterministic eligibility engine. No DB calls in here — callers are
// responsible for fetching the student + job requirements beforehand.

export interface EligibilitySkill {
  skillId: string;
  proficiency: number;
}

export interface EligibilityStudent {
  cgpa: number;
  department?: string | null;
  backlogCount: number;
  experienceMonths?: number;
  // Latest mock-interview overall score (0-10), or null if none recorded.
  mockInterviewScore?: number | null;
  skills: EligibilitySkill[];
}

export interface EligibilityRequirement {
  requirementType: "SKILL" | "CGPA" | "BRANCH" | "BACKLOG" | "EXPERIENCE" | "CERTIFICATION" | "MOCK_INTERVIEW";
  skillId?: string | null;
  skillName?: string | null;
  minimumProficiency?: number | null;
  mandatory: boolean;
  // CGPA -> number threshold
  // BRANCH -> string[] of allowed branches
  // BACKLOG -> number max allowed backlogs
  // EXPERIENCE -> number min months
  // MOCK_INTERVIEW -> number min latest mock-interview score (out of 10)
  value?: unknown;
}

// One evaluated criterion, with a detail that names the actual values
// involved (e.g. "Your CGPA (7.2) is below the 7.5 minimum").
export interface EligibilityCheck {
  type: EligibilityRequirement["requirementType"];
  mandatory: boolean;
  pass: boolean;
  label: string;
  detail: string;
  skillName?: string;
  have?: number | null;
  need?: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  checks: EligibilityCheck[];
}

export function checkEligibility(
  student: EligibilityStudent,
  requirements: EligibilityRequirement[]
): EligibilityResult {
  const reasons: string[] = [];
  const checks: EligibilityCheck[] = [];
  let eligible = true;

  for (const req of requirements) {
    const result = evaluateRequirement(student, req);
    if (result === null) {
      // Not applicable / no verdict to report
      continue;
    }

    reasons.push(result.reason);
    checks.push(result.check);

    if (req.mandatory && !result.pass) {
      eligible = false;
    }
  }

  return { eligible, reasons, checks };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Keeps acronyms like "CGPA" intact when a label is used mid-sentence.
function inSentence(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// Turns checks into one plain sentence, e.g. "Not eligible: your CGPA and
// branch meet the criteria, but the role requires Docker, which isn't on your profile."
export function explainEligibility(result: Pick<EligibilityResult, "eligible" | "checks">): string {
  const hard = result.checks.filter((c) => c.mandatory && c.type !== "CERTIFICATION");
  const passedCriteria = [...new Set(hard.filter((c) => c.pass && c.type !== "SKILL").map((c) => c.label))];
  const requiredSkills = hard.filter((c) => c.type === "SKILL");
  const preferredGaps = result.checks
    .filter((c) => !c.mandatory && c.type === "SKILL" && !c.pass)
    .map((c) => c.skillName as string);

  if (result.eligible) {
    const clauses: string[] = [];
    if (passedCriteria.length) {
      clauses.push(
        `your ${joinList(passedCriteria.map(inSentence))} ${passedCriteria.length === 1 ? "meets" : "meet"} the criteria`
      );
    }
    if (requiredSkills.length) {
      clauses.push(
        requiredSkills.length === 1
          ? "you have the required skill"
          : `you have all ${requiredSkills.length} required skills`
      );
    }
    let sentence = clauses.length
      ? `Eligible: ${clauses.join(" and ")}.`
      : "Eligible: this role has no hard requirements.";
    if (preferredGaps.length) sentence += ` Preferred skills you don't have yet: ${joinList(preferredGaps)}.`;
    return sentence;
  }

  const problems: string[] = hard.filter((c) => !c.pass && c.type !== "SKILL").map((c) => lowerFirst(c.detail));
  const missing = requiredSkills.filter((c) => !c.pass && c.have == null).map((c) => c.skillName as string);
  const weak = requiredSkills.filter((c) => !c.pass && c.have != null);
  if (missing.length) {
    problems.push(`the role requires ${joinList(missing)}, which ${missing.length === 1 ? "isn't" : "aren't"} on your profile`);
  }
  for (const c of weak) problems.push(`${c.skillName} is at level ${c.have} but the role needs level ${c.need}`);

  const opener = passedCriteria.length
    ? `Not eligible: your ${joinList(passedCriteria.map(inSentence))} ${passedCriteria.length === 1 ? "meets" : "meet"} the criteria, but `
    : "Not eligible: ";
  return `${opener}${joinList(problems)}.`;
}

// ------------------------------------------------------------------
// Mapping helpers — convert Prisma-shaped records (student with skills,
// job requirements) into the plain inputs this pure engine expects.
// These do NOT touch the DB themselves; callers pass already-fetched data.
// ------------------------------------------------------------------

export interface StudentLikeForEligibility {
  cgpa: number;
  department?: string | null;
  backlogCount: number;
  experienceMonths?: number | null;
  mockInterviewScore?: number | null;
  skills: { skillId: string; proficiency: number }[];
}

export function toEligibilityStudent(student: StudentLikeForEligibility): EligibilityStudent {
  return {
    cgpa: student.cgpa,
    department: student.department ?? null,
    backlogCount: student.backlogCount,
    experienceMonths: student.experienceMonths ?? 0,
    mockInterviewScore: student.mockInterviewScore ?? null,
    skills: student.skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
  };
}

export interface JobRequirementLike {
  requirementType: string;
  skillId?: string | null;
  skill?: { name: string } | null;
  minimumProficiency?: number | null;
  mandatory: boolean;
  value?: unknown;
}

export function toEligibilityRequirements(
  requirements: JobRequirementLike[]
): EligibilityRequirement[] {
  return requirements.map((r) => ({
    requirementType: r.requirementType as EligibilityRequirement["requirementType"],
    skillId: r.skillId ?? null,
    skillName: r.skill?.name ?? null,
    minimumProficiency: r.minimumProficiency ?? null,
    mandatory: r.mandatory,
    value: r.value,
  }));
}

interface Evaluation {
  pass: boolean;
  reason: string;
  check: EligibilityCheck;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function evaluateRequirement(student: EligibilityStudent, req: EligibilityRequirement): Evaluation | null {
  const base = { type: req.requirementType, mandatory: req.mandatory };

  switch (req.requirementType) {
    case "CGPA": {
      const threshold = Number(req.value);
      const pass = student.cgpa >= threshold;
      return {
        pass,
        reason: pass ? "CGPA requirement satisfied" : "CGPA below required threshold",
        check: {
          ...base,
          pass,
          label: "CGPA",
          detail: pass
            ? `CGPA ${student.cgpa} meets the ${threshold} minimum`
            : `Your CGPA (${student.cgpa}) is below the ${threshold} minimum`,
          have: student.cgpa,
          need: threshold,
        },
      };
    }

    case "BRANCH": {
      const allowed = Array.isArray(req.value) ? (req.value as string[]) : [];
      const branch = student.department || "";
      const pass =
        allowed.length === 0 || (!!branch && allowed.some((b) => b.toLowerCase() === branch.toLowerCase()));
      let detail: string;
      if (allowed.length === 0) detail = "Open to every branch";
      else if (pass) detail = `${branch} is an eligible branch`;
      else if (branch) detail = `Your branch (${branch}) isn't one of ${allowed.join(", ")}`;
      else detail = `Your branch isn't set; the role is open to ${allowed.join(", ")}`;
      return {
        pass,
        reason: pass ? "Eligible branch" : "Branch not eligible for this role",
        check: { ...base, pass, label: "Branch", detail },
      };
    }

    case "BACKLOG": {
      const maxAllowed = Number(req.value);
      const pass = student.backlogCount <= maxAllowed;
      return {
        pass,
        reason: pass ? "No active backlogs" : "Backlog count exceeds allowed limit",
        check: {
          ...base,
          pass,
          label: "Backlogs",
          detail: pass
            ? `${plural(student.backlogCount, "active backlog")}, within the limit of ${maxAllowed}`
            : `You have ${plural(student.backlogCount, "active backlog")} against a limit of ${maxAllowed}`,
          have: student.backlogCount,
          need: maxAllowed,
        },
      };
    }

    case "EXPERIENCE": {
      // Fresh-graduate platform: treat missing experience as 0 months.
      const minMonths = Number(req.value) || 0;
      const experience = student.experienceMonths ?? 0;
      const pass = experience >= minMonths;
      return {
        pass,
        reason: pass ? "Experience requirement satisfied" : "Insufficient experience",
        check: {
          ...base,
          pass,
          label: "Experience",
          detail: pass
            ? `${plural(experience, "month")} of experience meets the ${minMonths}-month minimum`
            : `You have ${plural(experience, "month")} of experience; the role asks for ${minMonths}`,
          have: experience,
          need: minMonths,
        },
      };
    }

    case "SKILL": {
      if (!req.skillId) return null;
      const studentSkill = student.skills.find((s) => s.skillId === req.skillId);
      const minProficiency = req.minimumProficiency ?? 1;
      const pass = !!studentSkill && studentSkill.proficiency >= minProficiency;
      const name = req.skillName ?? "A skill";
      const kind = req.mandatory ? "required" : "preferred";
      let detail: string;
      if (pass) detail = `${name} at level ${studentSkill!.proficiency} (${kind}: level ${minProficiency})`;
      else if (studentSkill) detail = `${name} is at level ${studentSkill.proficiency}; the role needs level ${minProficiency}`;
      else detail = `${name} is ${kind} but isn't on your profile`;

      const check: EligibilityCheck = {
        ...base,
        pass,
        label: name,
        skillName: name,
        have: studentSkill?.proficiency ?? null,
        need: minProficiency,
        detail,
      };

      if (!req.mandatory) {
        // Non-mandatory skill gaps never block eligibility; only report
        // informationally.
        return {
          pass,
          reason: pass ? "Preferred skill present" : "Preferred skill gap (does not block eligibility)",
          check,
        };
      }

      return {
        pass,
        reason: pass ? "Required skill present" : "Missing required skill",
        check,
      };
    }

    case "MOCK_INTERVIEW": {
      // Uses the latest mock interview: the student's current level, not
      // their best-ever day.
      const benchmark = Number(req.value) || 0;
      const score = student.mockInterviewScore ?? null;
      const pass = score != null && score >= benchmark;
      let detail: string;
      if (score == null) detail = `No mock interview on record; the role expects a score of at least ${benchmark}/10`;
      else if (pass) detail = `Mock-interview score ${score}/10 meets the ${benchmark}/10 benchmark`;
      else detail = `Your mock-interview score (${score}/10) is below the ${benchmark}/10 benchmark`;
      return {
        pass,
        reason: pass ? "Mock-interview benchmark met" : "Mock-interview score below benchmark",
        check: { ...base, pass, label: "Mock-interview score", detail, have: score, need: benchmark },
      };
    }

    case "CERTIFICATION": {
      // No certification data is modeled on the student yet. Treat as an
      // informational pass so it never blocks eligibility.
      return {
        pass: true,
        reason: "Certification requirement not enforced",
        check: { ...base, pass: true, label: "Certification", detail: "Certification requirements aren't checked yet" },
      };
    }

    default:
      return null;
  }
}
