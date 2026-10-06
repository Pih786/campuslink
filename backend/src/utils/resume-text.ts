import fs from "fs";
import path from "path";
import mammoth from "mammoth";

const MAX_CHARS = 60000;

// Plain text from an uploaded resume, or null if the format isn't readable.
export async function extractResumeText(filePath: string, originalName: string): Promise<string | null> {
  const ext = path.extname(originalName).toLowerCase();
  let text: string | null = null;

  if (ext === ".txt") {
    text = await fs.promises.readFile(filePath, "utf-8");
  } else if (ext === ".pdf") {
    // unpdf is ESM-only; loaded lazily so the CommonJS build can require it.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await fs.promises.readFile(filePath)));
    const result = await extractText(pdf, { mergePages: true });
    text = result.text;
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  }

  if (!text) return null;
  const cleaned = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned ? cleaned.slice(0, MAX_CHARS) : null;
}
