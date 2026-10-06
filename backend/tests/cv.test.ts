import { test } from "node:test";
import assert from "node:assert/strict";
import { cvDataSchema, saveCvSchema } from "../src/modules/cv/cv.schema";
import { cvSections, renderCvDocx, renderCvPdf } from "../src/modules/cv/cv.render";
import { env } from "../src/config/env";
import { videosForSkill } from "../src/utils/youtube";

const sample = cvDataSchema.parse({
  header: { fullName: "Asha Verma", email: "asha@college.edu", links: [{ label: "GitHub", url: "https://github.com/asha" }] },
  summary: "Final-year IT student.",
  education: [{ institution: "NIT Warangal", degree: "B.Tech", field: "IT", end: "2026", score: "CGPA 8.9/10" }],
  skills: ["Java", "SQL"],
  experience: [{ role: "", organization: "" }],
  projects: [{ title: "Bus Pass App", tech: ["Kotlin"], bullets: ["Issued 1,200 passes in the first term.", ""] }],
  achievements: ["Winner, college hackathon — ₹10,000"],
});

test("schema fills defaults so a partial CV is still valid", () => {
  const parsed = saveCvSchema.parse({ data: {} });
  assert.equal(parsed.template, "classic");
  assert.deepEqual(parsed.data.skills, []);
  assert.equal(parsed.data.header.fullName, "");
});

test("schema rejects unknown templates", () => {
  assert.equal(saveCvSchema.safeParse({ template: "fancy", data: {} }).success, false);
});

test("sections follow a fixed order and skip empty ones", () => {
  const headings = cvSections(sample).map((s) => s.heading);
  // Experience has only a blank entry and there are no certifications.
  assert.deepEqual(headings, ["Summary", "Education", "Skills", "Projects", "Achievements"]);
});

test("empty bullets never reach the output", () => {
  const projects = cvSections(sample).find((s) => s.heading === "Projects")!;
  assert.deepEqual(projects.entries![0].bullets, ["Issued 1,200 passes in the first term."]);
});

test("renders a PDF and a Word file for both templates", async () => {
  for (const template of ["classic", "modern"] as const) {
    const pdf = await renderCvPdf(sample, template);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const docx = await renderCvDocx(sample, template);
    assert.equal(docx.subarray(0, 2).toString(), "PK");
  }
});

test("without an API key, video suggestions fall back to YouTube searches", async () => {
  const saved = env.YOUTUBE_API_KEY;
  env.YOUTUBE_API_KEY = "";
  try {
    const result = await videosForSkill("Docker", "improve");
    assert.equal(result.source, "search");
    assert.equal(result.videos.length, 0);
    assert.equal(result.searches.length, 3);
    assert.ok(result.searches.every((s) => s.url.startsWith("https://www.youtube.com/results?search_query=")));
    assert.match(result.searches[1].label, /interview questions/);
  } finally {
    env.YOUTUBE_API_KEY = saved;
  }
});
