import { test } from "node:test";
import assert from "node:assert/strict";
import { assessUnplacedRisk, bandFor, roleReadinessScore } from "../src/modules/analytics/risk";

const healthy = {
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

test("readiness score matches the ai-service formula", () => {
  const prof = new Map([
    ["react", 5],
    ["node", 3],
  ]);
  assert.equal(roleReadinessScore(prof, ["react", "node", "aws"]), 53);
  assert.equal(roleReadinessScore(prof, []), 0);
  assert.equal(bandFor(53), "Developing");
  assert.equal(bandFor(80), "Highly Employable");
});

test("risk: an active, eligible, ready student is low risk with no factors", () => {
  const r = assessUnplacedRisk(healthy);
  assert.equal(r.level, "Low");
  assert.equal(r.score, 0);
  assert.deepEqual(r.factors, []);
});

test("risk: no applications and no eligible roles is high risk, with reasons ordered by weight", () => {
  const r = assessUnplacedRisk({ ...healthy, applications: 0, eligibleOpenRoles: 0, bestReadiness: 20 });
  assert.equal(r.level, "High");
  assert.equal(r.score, 70);
  assert.deepEqual(
    r.factors.map((f) => f.reason),
    ["Hasn't applied to any role yet", "Not eligible for any open role", "Best role readiness is 20 (not ready)"]
  );
});

test("risk: medium band for several smaller issues", () => {
  const r = assessUnplacedRisk({ ...healthy, rejections: 2, noShows: 1, verifiedSkills: 0 });
  assert.equal(r.score, 25);
  assert.equal(r.level, "Medium");
});

test("risk: no open roles does not count against the student", () => {
  const r = assessUnplacedRisk({ ...healthy, openRoles: 0, eligibleOpenRoles: 0 });
  assert.equal(r.score, 0);
});

test("readiness score ignores repeated required-skill entries", () => {
  const prof = new Map([
    ["react", 5],
    ["node", 3],
  ]);
  assert.equal(roleReadinessScore(prof, ["react", "react", "node", "aws"]), 53);
});
