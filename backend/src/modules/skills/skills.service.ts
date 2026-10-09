import { Prisma, Skill } from "@prisma/client";
import { prisma } from "../../config/prisma";

// Keep these canonical names and aliases aligned with the AI skill dictionary.
const canonicalSkillNames = [
  "Python", "JavaScript", "TypeScript", "Java", "C++", "C", "C#", "Go", "Rust", "PHP", "Ruby",
  "Kotlin", "Swift", "R", "React", "Angular", "Vue.js", "HTML", "CSS", "Tailwind CSS", "Bootstrap",
  "Next.js", "Redux", "jQuery", "Svelte", "Node.js", "Express.js", "Django", "Flask", "FastAPI",
  "Spring Boot", "ASP.NET", ".NET", "Ruby on Rails", "Laravel", "NestJS", "GraphQL", "REST API",
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Oracle", "Cassandra", "DynamoDB",
  "Firebase", "Elasticsearch", "MariaDB", "AWS", "Azure", "Google Cloud Platform", "Heroku", "Vercel",
  "Netlify", "Docker", "Kubernetes", "Jenkins", "CI/CD", "Git", "GitHub", "GitHub Actions", "Terraform",
  "Linux", "Bash", "Machine Learning", "Deep Learning", "Data Science", "Pandas", "NumPy", "TensorFlow",
  "PyTorch", "Scikit-learn", "Natural Language Processing", "Computer Vision", "Data Analysis", "Power BI",
  "Tableau", "Excel", "Unit Testing", "Selenium", "Jest", "Pytest", "JUnit", "Cypress", "Postman",
  "React Native", "Flutter", "Android Development", "iOS Development", "Agile", "Scrum", "Project Management",
  "Communication", "Leadership", "Problem Solving", "Teamwork", "Time Management",
];

const skillAliases: Record<string, string> = Object.fromEntries(
  canonicalSkillNames.map((name) => [name.toLowerCase(), name])
);

Object.assign(skillAliases, {
  js: "JavaScript",
  ecmascript: "JavaScript",
  ts: "TypeScript",
  py: "Python",
  golang: "Go",
  cpp: "C++",
  "c plus plus": "C++",
  csharp: "C#",
  "c sharp": "C#",
  reactjs: "React",
  "react.js": "React",
  vue: "Vue.js",
  vuejs: "Vue.js",
  angularjs: "Angular",
  nextjs: "Next.js",
  tailwind: "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  node: "Node.js",
  nodejs: "Node.js",
  express: "Express.js",
  expressjs: "Express.js",
  dotnet: ".NET",
  "dot net": ".NET",
  aspnet: "ASP.NET",
  "asp.net core": "ASP.NET",
  rails: "Ruby on Rails",
  ror: "Ruby on Rails",
  nest: "NestJS",
  "restful api": "REST API",
  "restful apis": "REST API",
  "rest apis": "REST API",
  postgres: "PostgreSQL",
  psql: "PostgreSQL",
  mongo: "MongoDB",
  "elastic search": "Elasticsearch",
  gcp: "Google Cloud Platform",
  "google cloud": "Google Cloud Platform",
  "amazon web services": "AWS",
  k8s: "Kubernetes",
  kube: "Kubernetes",
  "gh actions": "GitHub Actions",
  cicd: "CI/CD",
  "ci cd": "CI/CD",
  "continuous integration": "CI/CD",
  "continuous deployment": "CI/CD",
  "continuous delivery": "CI/CD",
  unix: "Linux",
  "shell scripting": "Bash",
  "shell script": "Bash",
  ml: "Machine Learning",
  dl: "Deep Learning",
  nlp: "Natural Language Processing",
  sklearn: "Scikit-learn",
  "scikit learn": "Scikit-learn",
  powerbi: "Power BI",
  "power-bi": "Power BI",
  "ms excel": "Excel",
  "microsoft excel": "Excel",
  "unit test": "Unit Testing",
  "unit tests": "Unit Testing",
  reactnative: "React Native",
  android: "Android Development",
  ios: "iOS Development",
});

export async function listSkills() {
  return prisma.skill.findMany({ orderBy: { name: "asc" } });
}

export function normalizeSkillName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  return skillAliases[normalized.toLowerCase()] ?? normalized;
}

export const skillKey = (name: string) => normalizeSkillName(name).toLowerCase();

export function pickCanonical<T extends { name: string }>(candidates: T[]): T {
  return [...candidates].sort(
    (a, b) =>
      Number(normalizeSkillName(a.name) !== a.name) - Number(normalizeSkillName(b.name) !== b.name) ||
      Number(a.name === a.name.toLowerCase()) - Number(b.name === b.name.toLowerCase()) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  )[0];
}

function sameNameAs(names: string[]): Prisma.SkillWhereInput {
  return { OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })) };
}

function namesForSkills(names: string[]): string[] {
  const keys = new Set(names.map(skillKey));
  return [...new Set([
    ...names.map(normalizeSkillName),
    ...Object.entries(skillAliases)
      .filter(([, canonical]) => keys.has(skillKey(canonical)))
      .map(([alias]) => alias),
  ])];
}

export async function findOrCreateSkill(name: string, category?: string): Promise<Skill> {
  const normalized = normalizeSkillName(name);
  const existing = await prisma.skill.findMany({ where: sameNameAs(namesForSkills([normalized])) });
  if (existing.length) return pickCanonical(existing);
  try {
    return await prisma.skill.create({ data: { name: normalized, category } });
  } catch (err) {
    // Created by a concurrent request in the meantime.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return pickCanonical(await prisma.skill.findMany({ where: sameNameAs(namesForSkills([normalized])) }));
    }
    throw err;
  }
}

// Batch version for many names at once: a fixed three round trips instead of
// several per skill, which matters on a remote database. Returns one skill
// per distinct (case-insensitive) name.
export async function findOrCreateSkills(names: string[]): Promise<Skill[]> {
  const byKey = new Map<string, string>();
  for (const n of names) {
    const normalized = normalizeSkillName(n);
    if (normalized && !byKey.has(normalized.toLowerCase())) byKey.set(normalized.toLowerCase(), normalized);
  }
  if (!byKey.size) return [];
  const wanted = [...byKey.values()];

  const load = async () => {
    const rows = await prisma.skill.findMany({ where: sameNameAs(namesForSkills(wanted)) });
    const groups = new Map<string, Skill[]>();
    for (const row of rows) groups.set(skillKey(row.name), [...(groups.get(skillKey(row.name)) ?? []), row]);
    return groups;
  };

  let groups = await load();
  const missing = wanted.filter((n) => !groups.has(n.toLowerCase()));
  if (missing.length) {
    await prisma.skill.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
    groups = await load();
  }
  return [...groups.values()].map(pickCanonical);
}
