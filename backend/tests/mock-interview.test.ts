import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEligibility, explainEligibility, EligibilityRequirement } from "../src/modules/eligibility/eligibility.service";
import { assessUnplacedRisk } from "../src/modules/analytics/risk";
import { latestMockScore, overallScore } from "../src/modules/mock-interviews/mock-interviews.service";

const student = { cgpa: 8.2, department: "CSE", backlogCount: 0, skills: [{ skillId: "aws", proficiency: 4 }] };
const mockReq = (mandatory = true, value = 7): EligibilityRequirement => ({
  requirementType: "MOCK_INTERVIEW",
  mandatory,
  value,
});
const cgpaReq: EligibilityRequirement = { requirementType: "CGPA", mandatory: true, value: 7 };
const cloudReq: EligibilityRequirement = {
  requirementType: "SKILL",
  skillId: "k8s",
  skillName: "Kubernetes",
  minimumProficiency: 3,
  mandatory: true,
};

test("mock-interview benchmark passes at or above the threshold", () => {
  const r = checkEligibility({ ...student, mockInterviewScore: 7 }, [mockReq()]);
  assert.equal(r.eligible, true);
  assert.equal(r.checks[0].detail, "Mock-interview score 7/10 meets the 7/10 benchmark");
});

test("a low or missing mock-interview score blocks a mandatory benchmark", () => {
  assert.equal(checkEligibility({ ...student, mockInterviewScore: 5.5 }, [mockReq()]).eligible, false);
  const none = checkEligibility({ ...student, mockInterviewScore: null }, [mockReq()]);
  assert.equal(none.eligible, false);
  assert.match(none.checks[0].detail, /No mock interview on record/);
});

test("a preferred benchmark never blocks eligibility", () => {
  assert.equal(checkEligibility({ ...student, mockInterviewScore: 3 }, [mockReq(false)]).eligible, true);
});

test("explanation reads like the problem statement's example", () => {
  const result = checkEligibility({ ...student, mockInterviewScore: 5.5 }, [cgpaReq, cloudReq, mockReq()]);
  assert.equal(
    explainEligibility(result),
    "Not eligible: your CGPA meets the criteria, but your mock-interview score (5.5/10) is below the 7/10 benchmark and the role requires Kubernetes, which isn't on your profile."
  );
});

test("overall mock score is the mean of the four sub-scores, one decimal", () => {
  assert.equal(overallScore({ technical: 7, communication: 8, problemSolving: 6, confidence: 8 }), 7.3);
  assert.equal(overallScore({ technical: 10, communication: 10, problemSolving: 10, confidence: 10 }), 10);
});

test("latest mock score reads the first (most recent) row, null when none", () => {
  assert.equal(latestMockScore({ mockInterviews: [{ overallScore: 6.5 }, { overallScore: 9 }] }), 6.5);
  assert.equal(latestMockScore({ mockInterviews: [] }), null);
  assert.equal(latestMockScore({}), null);
});

test("risk: a low latest mock score is flagged, a missing one is not", () => {
  const base = {
    applications: 3,
    rejections: 0,
    noShows: 0,
    eligibleOpenRoles: 4,
    openRoles: 5,
    bestReadiness: 72,
    backlogCount: 0,
    profileCompletion: 90,
    verifiedSkills: 2,
  };
  const low = assessUnplacedRisk({ ...base, mockInterviewScore: 4 });
  assert.ok(low.factors.some((f) => f.reason === "Latest mock-interview score is 4/10"));
  assert.equal(assessUnplacedRisk({ ...base, mockInterviewScore: null }).factors.length, 0);
  assert.equal(assessUnplacedRisk({ ...base, mockInterviewScore: 8 }).factors.length, 0);
});
