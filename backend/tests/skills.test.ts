import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSkillName, pickCanonical, skillKey } from "../src/modules/skills/skills.service";

test("skill names that differ only in case or spacing share a key", () => {
  assert.equal(skillKey("  java "), skillKey("Java"));
  assert.equal(skillKey("REST   API"), skillKey("rest api"));
  assert.notEqual(skillKey("Java"), skillKey("JavaScript"));
  assert.equal(normalizeSkillName("  REST   API "), "REST API");
});

test("common skill aliases normalize to the same canonical key", () => {
  assert.equal(skillKey("ReactJS"), skillKey("React"));
  assert.equal(skillKey("postgres"), skillKey("PostgreSQL"));
  assert.equal(skillKey("k8s"), skillKey("Kubernetes"));
  assert.equal(skillKey("Google Cloud"), skillKey("Google Cloud Platform"));
  assert.equal(normalizeSkillName("node"), "Node.js");
  assert.equal(skillKey("Java"), skillKey("java"));
  assert.notEqual(skillKey("Java"), skillKey("JavaScript"));
  assert.equal(normalizeSkillName("Blender"), "Blender");
});

test("the kept spelling is the one that isn't all lowercase", () => {
  assert.equal(pickCanonical([{ name: "java" }, { name: "Java" }]).name, "Java");
  assert.equal(pickCanonical([{ name: "rest api" }, { name: "REST API" }, { name: "Rest API" }]).name, "REST API");
  assert.equal(pickCanonical([{ name: "git" }]).name, "git");
});

test("canonical spelling wins over an alias when selecting a database row", () => {
  assert.equal(pickCanonical([{ name: "Node" }, { name: "Node.js" }]).name, "Node.js");
  assert.equal(pickCanonical([{ name: "reactjs" }, { name: "React" }]).name, "React");
});
