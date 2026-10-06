import { z } from "zod";

// The CV is stored as one JSON document so students can edit freely without
// touching their structured profile (which drives eligibility and matching).
const text = (max: number) => z.string().trim().max(max).default("");
const bullets = z.array(z.string().trim().max(300)).max(8).default([]);

export const CV_TEMPLATES = ["classic", "modern"] as const;

export const cvDataSchema = z.object({
  header: z
    .object({
      fullName: text(120),
      headline: text(140),
      email: text(160),
      phone: text(40),
      location: text(120),
      links: z
        .array(z.object({ label: text(40), url: text(300) }))
        .max(5)
        .default([]),
    })
    .default({}),
  summary: text(1200),
  education: z
    .array(
      z.object({
        institution: text(160),
        degree: text(120),
        field: text(120),
        start: text(30),
        end: text(30),
        score: text(60),
      })
    )
    .max(6)
    .default([]),
  skills: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  experience: z
    .array(
      z.object({
        role: text(120),
        organization: text(160),
        location: text(120),
        start: text(30),
        end: text(30),
        bullets,
      })
    )
    .max(8)
    .default([]),
  projects: z
    .array(
      z.object({
        title: text(120),
        tech: z.array(z.string().trim().max(40)).max(15).default([]),
        url: text(300),
        bullets,
      })
    )
    .max(10)
    .default([]),
  certifications: z
    .array(z.object({ name: text(160), issuer: text(120), year: text(20) }))
    .max(12)
    .default([]),
  achievements: z.array(z.string().trim().max(300)).max(10).default([]),
});

export type CvData = z.infer<typeof cvDataSchema>;
export type CvTemplate = (typeof CV_TEMPLATES)[number];

export const saveCvSchema = z.object({
  template: z.enum(CV_TEMPLATES).default("classic"),
  data: cvDataSchema,
});
