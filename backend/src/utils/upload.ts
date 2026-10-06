import multer from "multer";
import path from "path";
import fs from "fs";
import { badRequest } from "./errors";

// Resumes hold personal data, so they are stored outside any statically
// served folder and only streamed through access-checked endpoints.
export const privateResumeDir = path.join(process.cwd(), "private-uploads", "resumes");
fs.mkdirSync(privateResumeDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, privateResumeDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".docx"];

export const resumeUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(badRequest(`Unsupported file type ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }
    cb(null, true);
  },
});

// Offer documents (ID proofs, marksheets) are personal data: they live outside
// the publicly served /uploads folder and are only streamed through an
// access-checked endpoint.
export const privateDocumentDir = path.join(process.cwd(), "private-uploads", "offer-documents");
fs.mkdirSync(privateDocumentDir, { recursive: true });

const DOCUMENT_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];

export const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, privateDocumentDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      return cb(badRequest(`Unsupported file type ${ext}. Allowed: ${DOCUMENT_EXTENSIONS.join(", ")}`));
    }
    cb(null, true);
  },
});

// Take-home assignment submissions: private, streamed through access checks.
export const privateAssignmentDir = path.join(process.cwd(), "private-uploads", "assignments");
fs.mkdirSync(privateAssignmentDir, { recursive: true });

const ASSIGNMENT_EXTENSIONS = [
  ".pdf", ".docx", ".txt", ".md", ".zip", ".ipynb", ".py", ".js", ".ts", ".java", ".cpp", ".c", ".sql", ".png", ".jpg", ".jpeg",
];

export const assignmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, privateAssignmentDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ASSIGNMENT_EXTENSIONS.includes(ext)) {
      return cb(badRequest(`Unsupported file type ${ext}. Allowed: ${ASSIGNMENT_EXTENSIONS.join(", ")}`));
    }
    cb(null, true);
  },
});
