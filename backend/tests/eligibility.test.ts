import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkEligibility,
  explainEligibility,
  EligibilityRequirement,
  EligibilityStudent,
} from "../src/modules/eligibility/eligibility.service";

const SKILL_REACT = "skill-react-id";
const SKILL_NODE = "skill-node-id";

function baseStudent(overrides: Partial<EligibilityStudent> = {}): EligibilityStudent {
  return {
    cgpa: 8.0,
    department: "CSE",
    backlogCount: 0,
    experienceMonths: 0,
    skills: [
      { skillId: SKILL_REACT, proficiency: 4 },
      { skillId: SKILL_NODE, proficiency: 3 },
    ],
    ...overrides,
  };
}

function baseRequirements(overrides: EligibilityRequirement[] = []): EligibilityRequirement[] {
  return [
    { requirementType: "CGPA", mandatory: true, value: 7 },
    { requirementType: "BRANCH", mandatory: true, value: ["CSE", "IT"] },
    { requirementType: "BACKLOG", mandatory: true, value: 0 },
    { requirementType: "SKILL", skillId: SKILL_REACT, minimumProficiency: 3, mandatory: true },
    ...overrides,
  ];
}

test("eligibility: all requirements pass -> eligible with all-pass reasons", () => {
  const result = checkEligibility(baseStudent(), baseRequirements());
  assert.equal(result.eligible, true);
  assert.ok(result.reasons.includes("CGPA requirement satisfied"));
  assert.ok(result.reasons.includes("Eligible branch"));
  assert.ok(result.reasons.includes("No active backlogs"));
  assert.ok(result.reasons.includes("Required skill present"));
});

test("eligibility: CGPA below threshold -> not eligible", () => {
  const student = baseStudent({ cgpa: 6.5 });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("CGPA below required threshold"));
});

test("eligibility: branch not in allowed list -> not eligible", () => {
  const student = baseStudent({ department: "Mechanical" });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Branch not eligible for this role"));
});

test("eligibility: backlog count exceeds allowed limit -> not eligible", () => {
  const student = baseStudent({ backlogCount: 2 });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Backlog count exceeds allowed limit"));
});

test("eligibility: missing mandatory skill -> not eligible", () => {
  const student = baseStudent({ skills: [{ skillId: SKILL_NODE, proficiency: 5 }] });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Missing required skill"));
});

test("eligibility: mandatory skill present but below minimum proficiency -> not eligible", () => {
  const student = baseStudent({ skills: [{ skillId: SKILL_REACT, proficiency: 1 }] });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("Missing required skill"));
});

test("eligibility: non-mandatory skill gap does not block eligibility", () => {
  const student = baseStudent({
    skills: [{ skillId: SKILL_REACT, proficiency: 4 }], // no AWS-equivalent skill at all
  });
  const requirements = baseRequirements([
    {
      requirementType: "SKILL",
      skillId: "skill-aws-id",
      minimumProficiency: 3,
      mandatory: false,
    },
  ]);

  const result = checkEligibility(student, requirements);
  assert.equal(result.eligible, true);
  assert.ok(result.reasons.includes("Preferred skill gap (does not block eligibility)"));
});

test("eligibility: multiple mandatory failures are all reported", () => {
  const student = baseStudent({ cgpa: 5, backlogCount: 3, department: "Civil" });
  const result = checkEligibility(student, baseRequirements());
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("CGPA below required threshold"));
  assert.ok(result.reasons.includes("Branch not eligible for this role"));
  assert.ok(result.reasons.includes("Backlog count exceeds allowed limit"));
});

test("eligibility: empty branch allow-list means any branch passes", () => {
  const student = baseStudent({ department: "Civil" });
  const requirements = baseRequirements().map((r) =>
    r.requirementType === "BRANCH" ? { ...r, value: [] } : r
  );
  const result = checkEligibility(student, requirements);
  assert.equal(result.eligible, true);
});

test("explanation: ineligible names what passed and what blocked it", () => {
  const student = baseStudent({ skills: [] });
  const requirements = baseRequirements().map((r) =>
    r.requirementType === "SKILL" ? { ...r, skillName: "Docker" } : r
  );
  const result = checkEligibility(student, requirements);
  assert.equal(result.eligible, false);
  assert.equal(
    explainEligibility(result),
    "Not eligible: your CGPA, branch and backlogs meet the criteria, but the role requires Docker, which isn't on your profile."
  );
});

test("explanation: reports actual CGPA and threshold, and weak skill levels", () => {
  const student = baseStudent({ cgpa: 6.4, skills: [{ skillId: SKILL_REACT, proficiency: 2 }] });
  const requirements = baseRequirements().map((r) =>
    r.requirementType === "SKILL" ? { ...r, skillName: "React" } : r
  );
  const result = checkEligibility(student, requirements);
  const cgpa = result.checks.find((c) => c.type === "CGPA");
  assert.equal(cgpa?.detail, "Your CGPA (6.4) is below the 7 minimum");
  assert.match(explainEligibility(result), /your CGPA \(6\.4\) is below the 7 minimum and React is at level 2 but the role needs level 3\.$/);
});

test("explanation: eligible lists met requirements and preferred gaps", () => {
  const requirements = baseRequirements([
    { requirementType: "SKILL", skillId: "skill-aws-id", skillName: "AWS", mandatory: false, minimumProficiency: 2 },
  ]);
  const result = checkEligibility(baseStudent(), requirements);
  assert.equal(result.eligible, true);
  assert.equal(
    explainEligibility(result),
    "Eligible: your CGPA, branch and backlogs meet the criteria and you have the required skill. Preferred skills you don't have yet: AWS."
  );
});
