import PDFDocument from "pdfkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { CvData, CvTemplate } from "./cv.schema";

// Both renderers walk the same section list so the PDF and the Word file
// always contain the same content in the same order.

const ACCENT = "1F4F82";
const INK = "1C1B18";
const MUTED = "5B5850";

function range(start: string, end: string) {
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}

function joinParts(parts: (string | undefined)[], sep = " · ") {
  return parts.map((p) => p?.trim()).filter(Boolean).join(sep);
}

function contactLine(cv: CvData) {
  const h = cv.header;
  return joinParts([h.email, h.phone, h.location, ...h.links.map((l) => l.url.replace(/^https?:\/\//, ""))], "  |  ");
}

// The built-in PDF fonts only cover Windows-1252; swap the few characters
// students commonly type that fall outside it.
function pdfSafe(value: string) {
  return value.replace(/₹/g, "Rs. ").replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€]/g, "");
}

interface Entry {
  title: string;
  right?: string;
  subtitle?: string;
  bullets?: string[];
  link?: string;
}

interface Section {
  heading: string;
  paragraph?: string;
  inline?: string;
  entries?: Entry[];
  list?: string[];
}

export function cvSections(cv: CvData): Section[] {
  const sections: Section[] = [];
  if (cv.summary.trim()) sections.push({ heading: "Summary", paragraph: cv.summary.trim() });

  const education = cv.education.filter((e) => e.institution || e.degree);
  if (education.length) {
    sections.push({
      heading: "Education",
      entries: education.map((e) => ({
        title: e.institution,
        right: range(e.start, e.end),
        subtitle: joinParts([joinParts([e.degree, e.field], ", "), e.score]),
      })),
    });
  }

  if (cv.skills.length) sections.push({ heading: "Skills", inline: cv.skills.join(", ") });

  const experience = cv.experience.filter((e) => e.role || e.organization);
  if (experience.length) {
    sections.push({
      heading: "Experience",
      entries: experience.map((e) => ({
        title: joinParts([e.role, e.organization], ", "),
        right: range(e.start, e.end),
        subtitle: e.location,
        bullets: e.bullets.filter(Boolean),
      })),
    });
  }

  const projects = cv.projects.filter((p) => p.title);
  if (projects.length) {
    sections.push({
      heading: "Projects",
      entries: projects.map((p) => ({
        title: p.title,
        subtitle: p.tech.filter(Boolean).join(", "),
        bullets: p.bullets.filter(Boolean),
        link: p.url,
      })),
    });
  }

  const certifications = cv.certifications.filter((c) => c.name);
  if (certifications.length) {
    sections.push({
      heading: "Certifications",
      entries: certifications.map((c) => ({ title: joinParts([c.name, c.issuer], ", "), right: c.year })),
    });
  }

  const achievements = cv.achievements.filter(Boolean);
  if (achievements.length) sections.push({ heading: "Achievements", list: achievements });
  return sections;
}

// ------------------------------------------------------------------
// PDF
// ------------------------------------------------------------------

export function renderCvPdf(cv: CvData, template: CvTemplate): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: 54, right: 54 },
    info: { Title: `${cv.header.fullName || "CV"}`, Creator: "CampusLink CV maker" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const modern = template === "modern";
  const accent = modern ? `#${ACCENT}` : `#${INK}`;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const align = modern ? "left" : "center";

  // Bullet glyph sits in a gutter so wrapped lines stay aligned with the text.
  const bullet = (value: string) => {
    doc.font("Helvetica").fontSize(10).fillColor(`#${INK}`);
    const top = doc.y + 1;
    doc.text("•", left + 2, top, { width: 10, lineBreak: false });
    doc.text(pdfSafe(value), left + 12, top, { width: width - 12, lineGap: 1 });
  };

  doc.font("Helvetica-Bold").fontSize(modern ? 22 : 20).fillColor(accent);
  doc.text(pdfSafe(cv.header.fullName || "Your name"), left, doc.y, { width, align });
  if (cv.header.headline) {
    doc.moveDown(0.15).font("Helvetica").fontSize(11).fillColor(`#${MUTED}`);
    doc.text(pdfSafe(cv.header.headline), { width, align });
  }
  const contact = contactLine(cv);
  if (contact) {
    doc.moveDown(0.25).font("Helvetica").fontSize(9.5).fillColor(`#${MUTED}`);
    doc.text(pdfSafe(contact), { width, align });
  }
  doc.moveDown(0.6);

  for (const section of cvSections(cv)) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(accent);
    doc.text(section.heading.toUpperCase(), left, doc.y, { width, characterSpacing: 0.6 });
    const ruleY = doc.y + 2;
    doc
      .moveTo(left, ruleY)
      .lineTo(left + width, ruleY)
      .lineWidth(modern ? 1.2 : 0.6)
      .strokeColor(modern ? `#${ACCENT}` : "#9A968C")
      .stroke();
    doc.y = ruleY + 6;
    doc.fillColor(`#${INK}`);

    if (section.paragraph || section.inline) {
      doc.font("Helvetica").fontSize(10).text(pdfSafe(section.paragraph ?? section.inline ?? ""), left, doc.y, {
        width,
        lineGap: 1.5,
      });
    }

    for (const entry of section.entries ?? []) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
      const top = doc.y;
      const rightWidth = entry.right ? 130 : 0;
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(`#${INK}`);
      doc.text(pdfSafe(entry.title), left, top, { width: width - rightWidth - 8 });
      const afterTitle = doc.y;
      if (entry.right) {
        doc.font("Helvetica").fontSize(9.5).fillColor(`#${MUTED}`);
        doc.text(pdfSafe(entry.right), left + width - rightWidth, top + 1, { width: rightWidth, align: "right" });
      }
      doc.y = Math.max(afterTitle, doc.y);
      if (entry.subtitle) {
        doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(`#${MUTED}`);
        doc.text(pdfSafe(entry.subtitle), left, doc.y, { width });
      }
      if (entry.link) {
        doc.font("Helvetica").fontSize(9).fillColor(`#${ACCENT}`);
        doc.text(pdfSafe(entry.link.replace(/^https?:\/\//, "")), left, doc.y, {
          width,
          link: /^https?:\/\//i.test(entry.link) ? entry.link : undefined,
        });
      }
      for (const b of entry.bullets ?? []) bullet(b);
      doc.moveDown(0.35);
    }

    for (const item of section.list ?? []) bullet(item);
    doc.x = left;
  }

  doc.end();
  return done;
}

// ------------------------------------------------------------------
// DOCX
// ------------------------------------------------------------------

// A4 width minus 0.75" margins each side, in twips.
const DOCX_CONTENT_WIDTH = 11906 - 1080 * 2;

export async function renderCvDocx(cv: CvData, template: CvTemplate): Promise<Buffer> {
  const modern = template === "modern";
  const accent = modern ? ACCENT : INK;
  const align = modern ? AlignmentType.LEFT : AlignmentType.CENTER;
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: align,
      children: [new TextRun({ text: cv.header.fullName || "Your name", bold: true, size: modern ? 44 : 40, color: accent })],
    })
  );
  if (cv.header.headline) {
    children.push(
      new Paragraph({ alignment: align, children: [new TextRun({ text: cv.header.headline, size: 22, color: MUTED })] })
    );
  }
  const contact = contactLine(cv);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 120 },
        children: [new TextRun({ text: contact, size: 19, color: MUTED })],
      })
    );
  }

  for (const section of cvSections(cv)) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: modern ? 10 : 4, color: modern ? ACCENT : "9A968C", space: 2 },
        },
        children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 21, color: accent, characterSpacing: 12 })],
      })
    );

    if (section.paragraph || section.inline) {
      children.push(new Paragraph({ children: [new TextRun({ text: section.paragraph ?? section.inline ?? "", size: 20 })] }));
    }

    for (const entry of section.entries ?? []) {
      children.push(
        new Paragraph({
          spacing: { before: 80 },
          tabStops: [{ type: TabStopType.RIGHT, position: DOCX_CONTENT_WIDTH }],
          children: [
            new TextRun({ text: entry.title, bold: true, size: 21 }),
            ...(entry.right ? [new TextRun({ text: `\t${entry.right}`, size: 19, color: MUTED })] : []),
          ],
        })
      );
      if (entry.subtitle) {
        children.push(new Paragraph({ children: [new TextRun({ text: entry.subtitle, italics: true, size: 19, color: MUTED })] }));
      }
      if (entry.link) {
        const link = entry.link;
        children.push(
          new Paragraph({
            children: /^https?:\/\//i.test(link)
              ? [
                  new ExternalHyperlink({
                    link,
                    children: [new TextRun({ text: link.replace(/^https?:\/\//, ""), size: 18, color: ACCENT, underline: {} })],
                  }),
                ]
              : [new TextRun({ text: link, size: 18, color: ACCENT })],
          })
        );
      }
      for (const b of entry.bullets ?? []) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b, size: 20 })] }));
      }
    }

    for (const item of section.list ?? []) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: item, size: 20 })] }));
    }
  }

  const doc = new Document({
    creator: "CampusLink CV maker",
    title: cv.header.fullName || "CV",
    styles: { default: { document: { run: { font: "Calibri", color: INK } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 900, bottom: 900, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
