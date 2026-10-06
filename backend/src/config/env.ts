import dotenv from "dotenv";

dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  PORT: parseInt(process.env.PORT || "5000", 10),
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || "http://localhost:8000",
  JUDGE0_URL: process.env.JUDGE0_URL || "https://ce.judge0.com",
  SQL_LAB_DATABASE_URL: process.env.SQL_LAB_DATABASE_URL || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  NODE_ENV: process.env.NODE_ENV || "development",
  // Public URL of the frontend, used in emailed links.
  APP_URL: (process.env.APP_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, ""),
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "CampusLink <onboarding@resend.dev>",
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || "",
  // Email copies of notifications (shortlists, interviews, offers, deadlines).
  // Only sent when RESEND_API_KEY is set; "off" disables them even then.
  EMAIL_NOTIFICATIONS: (process.env.EMAIL_NOTIFICATIONS || "on").toLowerCase() !== "off",
};
