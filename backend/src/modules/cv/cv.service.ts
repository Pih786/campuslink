import fs from "fs";
import path from "path";
import { prisma } from "../../config/prisma";
import { notFound } from "../../utils/errors";
import { privateResumeDir } from "../../utils/upload";
import { aiCvSummary } from "../../utils/ai-client";
import { saveResume } from "../students/students.service";
import { CvData, CvTemplate, cvDataSchema } from "./cv.schema";
import { renderCvDocx, renderCvPdf } from "./cv.render";

async function loadStudent(userId: string) {
  const student = await prisma.student.findUnique({
    where: { userId },
    include: {
      user: true,
      college: true,
      educations: { orderBy: { endYear: "desc" } },
      skills: { include: { skill: true } },
      projects: { orderBy: { createdAt: "desc" } },
      certifications: { orderBy: { issuedAt: "desc" } },
      assessmentAttempts: {
        where: { passed: true, submittedAt: { not: null } },
        include: { assessment: true },
        orderBy: { score: "desc" },
      },
      cv: true,
    },
  });
  if (!student) throw notFound("Student profile");
  return student;
}

type LoadedStudent = Awaited<ReturnType<typeof loadStudent>>;

function sentences(text: string | null | undefined) {
  return (text ?? "")
    .split(/\n+|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 4);
}

// Builds a first draft from everything already on the profile, so a student
// with no CV starts from a filled page rather than a blank form.
export function prefillFromProfile(student: LoadedStudent): CvData {
  const location = [student.college?.city, student.college?.state].filter(Boolean).join(", ");

  const education = student.educations.length
    ? student.educations.map((e) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.branch ?? "",
        start: e.startYear ? String(e.startYear) : "",
        end: e.endYear ? String(e.endYear) : "",
        score: e.cgpa ? `CGPA ${e.cgpa}/10` : e.percentage ? `${e.percentage}%` : "",
      }))
    : student.college
      ? [
          {
            institution: student.college.name,
            degree: "",
            field: student.department ?? "",
            start: "",
            end: student.graduationYear ? String(student.graduationYear) : "",
            score: student.cgpa ? `CGPA ${student.cgpa}/10` : "",
          },
        ]
      : [];

  // Verified and stronger skills first.
  const skills = [...student.skills]
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.proficiency - a.proficiency)
    .map((s) => s.skill.name)
    .slice(0, 24);

  const seenAssessments = new Set<string>();
  const achievements = student.assessmentAttempts
    .filter((a) => {
      if (seenAssessments.has(a.assessmentId)) return false;
      seenAssessments.add(a.assessmentId);
      return true;
    })
    .slice(0, 4)
    .map((a) => {
      const pct = a.totalPoints ? Math.round((a.score / a.totalPoints) * 100) : a.score;
      return `Scored ${pct}% in the ${a.assessment.title} assessment (verified on CampusLink)`;
    });

  return cvDataSchema.parse({
    header: {
      fullName: student.user.fullName,
      headline: [student.department && `${student.department} student`, student.graduationYear && `Class of ${student.graduationYear}`]
        .filter(Boolean)
        .join(" · "),
      email: student.user.email,
      phone: student.phone ?? "",
      location,
      links: [],
    },
    summary: "",
    education,
    skills,
    experience: [],
    projects: student.projects.map((p) => ({
      title: p.title,
      tech: p.techStack,
      url: p.url ?? "",
      bullets: sentences(p.description),
    })),
    certifications: student.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer ?? "",
      year: c.issuedAt ? String(c.issuedAt.getFullYear()) : "",
    })),
    achievements,
  });
}

export async function getCv(userId: string) {
  const student = await loadStudent(userId);
  const prefill = prefillFromProfile(student);
  if (!student.cv) {
    return { saved: false, template: "classic" as CvTemplate, data: prefill, updatedAt: null, hasResume: Boolean(student.resumeUrl) };
  }
  const parsed = cvDataSchema.safeParse(student.cv.data);
  return {
    saved: true,
    template: (student.cv.template === "modern" ? "modern" : "classic") as CvTemplate,
    data: parsed.success ? parsed.data : prefill,
    updatedAt: student.cv.updatedAt,
    hasResume: Boolean(student.resumeUrl),
  };
}

export async function getPrefill(userId: string) {
  return prefillFromProfile(await loadStudent(userId));
}

export async function saveCv(userId: string, template: CvTemplate, data: CvData) {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  if (!student) throw notFound("Student profile");
  const cv = await prisma.studentCv.upsert({
    where: { studentId: student.id },
    update: { template, data },
    create: { studentId: student.id, template, data },
  });
  return { saved: true, template, data, updatedAt: cv.updatedAt };
}

async function savedOrDraft(userId: string) {
  const { template, data } = await getCv(userId);
  return { template, data };
}

function fileBase(cv: CvData) {
  const name = (cv.header.fullName || "cv").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${name || "cv"}_CV`;
}

export async function exportCv(userId: string, format: "pdf" | "docx") {
  const { template, data } = await savedOrDraft(userId);
  const buffer = format === "pdf" ? await renderCvPdf(data, template) : await renderCvDocx(data, template);
  return {
    buffer,
    fileName: `${fileBase(data)}.${format}`,
    contentType:
      format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

// Renders the saved CV to PDF and stores it as the student's resume. Skills,
// projects and certificates typed into the CV are added to the profile.
export async function saveCvAsResume(userId: string) {
  const { template, data } = await savedOrDraft(userId);
  const buffer = await renderCvPdf(data, template);
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const filePath = path.join(privateResumeDir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return saveResume(
    userId,
    {
      filename,
      path: filePath,
      originalname: `${fileBase(data)}.pdf`,
      size: buffer.length,
      mimetype: "application/pdf",
    } as Express.Multer.File,
    {
      skills: data.skills,
      projects: data.projects.filter((p) => p.title).map((p) => ({ title: p.title, technologies: p.tech })),
      certifications: data.certifications.map((c) => c.name).filter(Boolean),
    }
  );
}

// AI draft of the summary paragraph, grounded on the CV content itself.
export async function suggestSummary(userId: string, data?: CvData) {
  const cv = data ?? (await savedOrDraft(userId)).data;
  return aiCvSummary({
    headline: cv.header.headline,
    education: cv.education.map((e) => [e.degree, e.field, e.institution, e.score].filter(Boolean).join(", ")),
    skills: cv.skills,
    projects: cv.projects.map((p) => ({ title: p.title, tech: p.tech })),
    experience: cv.experience.map((e) => [e.role, e.organization].filter(Boolean).join(" at ")),
    certifications: cv.certifications.map((c) => c.name),
  });
}
