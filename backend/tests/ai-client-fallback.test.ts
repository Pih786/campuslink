import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackMatchScore, fallbackReadiness } from "../src/utils/ai-client";

test("fallback scorer: full skill overlap -> overall 100", () => {
  const result = fallbackMatchScore(
    ["React", "Node.js", "MongoDB"],
    ["React", "Node.js"]
  );
  assert.equal(result.overall, 100);
  assert.equal(result.breakdown.skill_match, 100);
  assert.deepEqual(result.matched_skills.sort(), ["Node.js", "React"].sort());
  assert.deepEqual(result.gap_skills, []);
  assert.equal(result.aiUnavailable, true);
});

test("fallback scorer: partial skill overlap -> proportional score", () => {
  const result = fallbackMatchScore(["React"], ["React", "Node.js", "AWS", "SQL"]);
  // 1 of 4 required skills matched -> 25%
  assert.equal(result.overall, 25);
  assert.equal(result.breakdown.skill_match, 25);
  assert.deepEqual(result.matched_skills, ["React"]);
  assert.deepEqual(result.gap_skills.sort(), ["AWS", "Node.js", "SQL"].sort());
});

test("fallback scorer: no overlap -> overall 0", () => {
  const result = fallbackMatchScore(["Python"], ["React", "Node.js"]);
  assert.equal(result.overall, 0);
  assert.deepEqual(result.matched_skills, []);
  assert.deepEqual(result.gap_skills.sort(), ["Node.js", "React"].sort());
});

test("fallback scorer: job with no skill requirements -> treated as 100", () => {
  const result = fallbackMatchScore(["React", "Node.js"], []);
  assert.equal(result.overall, 100);
  assert.equal(result.breakdown.skill_match, 100);
});

test("fallback scorer: is case-insensitive when matching skill names", () => {
  const result = fallbackMatchScore(["react", "NODE.JS"], ["React", "Node.js"]);
  assert.equal(result.overall, 100);
});

test("fallback scorer: breakdown always includes all sub-scores with zeros for unknown dimensions", () => {
  const result = fallbackMatchScore(["React"], ["React"]);
  assert.deepEqual(result.breakdown, {
    skill_match: 100,
    education: 100,
    projects: 0,
    certifications: 0,
    assessment: 0,
    experience: 0,
  });
});

test("fallback readiness: averages proficiency out of 5 across required skills", () => {
  const result = fallbackReadiness(
    [
      { name: "React", proficiency: 5 },
      { name: "node.js", proficiency: 3 },
    ],
    ["React", "Node.js", "AWS"]
  );
  // (100 + 60 + 0) / 3 = 53.3 -> 53, matching ai-service compute_readiness
  assert.equal(result.score, 53);
  assert.equal(result.band, "Developing");
  assert.equal(result.aiUnavailable, true);
});

test("fallback readiness: no required skills scores 0, like the AI service", () => {
  const result = fallbackReadiness([{ name: "React", proficiency: 5 }], []);
  assert.equal(result.score, 0);
  assert.equal(result.band, "Not Ready");
});

test("fallback readiness: proficiency above 5 is capped", () => {
  const result = fallbackReadiness([{ name: "SQL", proficiency: 9 }], ["SQL"]);
  assert.equal(result.score, 100);
  assert.equal(result.band, "Highly Employable");
});
