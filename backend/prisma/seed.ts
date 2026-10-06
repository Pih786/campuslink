import { PrismaClient, RequirementType } from "@prisma/client";

const prisma = new PrismaClient();

const SKILL_NAMES = [
  "React",
  "Node.js",
  "MongoDB",
  "SQL",
  "AWS",
  "Docker",
  "Python",
  "Java",
  "Kubernetes",
  "Git",
  "TypeScript",
  "Express",
  "PostgreSQL",
  "System Design",
  "REST API",
  "Statistics",
  "Power BI",
  "Linux",
];

interface DemoJobSpec {
  companyName: string;
  industry: string;
  location: string;
  jobTitle: string;
  jobLocation: string;
  requiredSkills: string[];
  minCgpa: number;
  allowedBranches: string[];
}

const DEMO_JOBS: DemoJobSpec[] = [
  {
    companyName: "ABC Technologies",
    industry: "Software",
    location: "Bengaluru, India",
    jobTitle: "Software Engineer",
    jobLocation: "Bengaluru, India",
    requiredSkills: ["React", "Node.js", "MongoDB", "SQL", "AWS"],
    minCgpa: 6.5,
    allowedBranches: ["CSE", "IT", "ECE"],
  },
  {
    companyName: "XYZ Analytics",
    industry: "Data & Analytics",
    location: "Pune, India",
    jobTitle: "Data Analyst",
    jobLocation: "Pune, India",
    requiredSkills: ["Python", "SQL", "Statistics", "Power BI"],
    minCgpa: 6.0,
    allowedBranches: ["CSE", "IT", "ECE", "Mechanical"],
  },
  {
    companyName: "CloudNova",
    industry: "Cloud Infrastructure",
    location: "Hyderabad, India",
    jobTitle: "Cloud Engineer",
    jobLocation: "Hyderabad, India",
    requiredSkills: ["Linux", "Docker", "AWS", "Kubernetes"],
    minCgpa: 7.0,
    allowedBranches: ["CSE", "IT"],
  },
];

async function main() {
  console.log("Seeding demo college...");
  const college = await prisma.college.upsert({
    where: { name: "Demo Institute of Technology" },
    update: {},
    create: { name: "Demo Institute of Technology" },
  });
  console.log(`  College ready: ${college.name}`);

  console.log("Seeding skills...");
  const skillsByName = new Map<string, { id: string; name: string }>();
  for (const name of SKILL_NAMES) {
    const skill = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    skillsByName.set(name, skill);
  }
  console.log(`  ${skillsByName.size} skills ready`);

  console.log("Seeding demo companies + jobs...");
  for (const spec of DEMO_JOBS) {
    const company = await prisma.company.upsert({
      where: { name: spec.companyName },
      update: {},
      create: {
        name: spec.companyName,
        industry: spec.industry,
        location: spec.location,
        status: "ACTIVE",
      },
    });

    const existingJob = await prisma.job.findFirst({
      where: { companyId: company.id, title: spec.jobTitle },
    });

    const job =
      existingJob ??
      (await prisma.job.create({
        data: {
          companyId: company.id,
          title: spec.jobTitle,
          description: `${spec.jobTitle} role at ${spec.companyName}. Great opportunity for fresh graduates.`,
          location: spec.jobLocation,
          employmentType: "Full-time",
          experienceRequired: 0,
          status: "PUBLISHED",
        },
      }));

    // Reset requirements so the seed script is safely re-runnable.
    await prisma.jobRequirement.deleteMany({ where: { jobId: job.id } });

    const requirementRows = [
      {
        jobId: job.id,
        requirementType: RequirementType.CGPA,
        mandatory: true,
        weight: 1,
        value: spec.minCgpa,
      },
      {
        jobId: job.id,
        requirementType: RequirementType.BRANCH,
        mandatory: true,
        weight: 1,
        value: spec.allowedBranches,
      },
      {
        jobId: job.id,
        requirementType: RequirementType.BACKLOG,
        mandatory: true,
        weight: 1,
        value: 0,
      },
      ...spec.requiredSkills.map((skillName) => ({
        jobId: job.id,
        requirementType: RequirementType.SKILL,
        skillId: skillsByName.get(skillName)!.id,
        minimumProficiency: 3,
        mandatory: true,
        weight: 1,
      })),
    ];

    await prisma.jobRequirement.createMany({ data: requirementRows });

    console.log(`  ${spec.companyName} -> ${spec.jobTitle} (${requirementRows.length} requirements)`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
