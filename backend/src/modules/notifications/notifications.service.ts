import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { notFound } from "../../utils/errors";
import { renderEmail, sendEmail } from "../../utils/email";

export type NotificationType =
  | "APPLICATION_SHORTLISTED"
  | "APPLICATION_SELECTED"
  | "APPLICATION_REJECTED"
  | "APPLICATION_RECEIVED"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_RESCHEDULED"
  | "INTERVIEW_CANCELLED"
  | "OFFER_RECEIVED"
  | "OFFER_RESPONSE"
  | "OFFER_WITHDRAWN"
  | "DOCUMENT_REQUESTED"
  | "DOCUMENT_SUBMITTED"
  | "DOCUMENT_REVIEWED"
  | "DOCUMENT_REMINDER"
  | "OFFER_FOLLOW_UP"
  | "DRIVE_ANNOUNCED"
  | "PLACEMENT_SUPPORT"
  | "STAFF_REQUEST"
  | "STAFF_DECISION"
  | "ESCALATION"
  | "ASSIGNMENT_RECEIVED"
  | "ASSIGNMENT_SUBMITTED"
  | "ASSIGNMENT_REVIEWED"
  | "MOCK_INTERVIEW_RECORDED";

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

// Notifications that also go out by email: the ones that replace the email
// and WhatsApp messages a placement cell sends by hand today. High-volume
// staff-side events (every new applicant, every uploaded document) stay
// in-app only, so nobody's inbox fills up.
export const EMAILED_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "APPLICATION_SHORTLISTED",
  "APPLICATION_SELECTED",
  "APPLICATION_REJECTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEW_RESCHEDULED",
  "INTERVIEW_CANCELLED",
  "OFFER_RECEIVED",
  "OFFER_WITHDRAWN",
  "OFFER_FOLLOW_UP",
  "DOCUMENT_REQUESTED",
  "DOCUMENT_REVIEWED",
  "DOCUMENT_REMINDER",
  "DRIVE_ANNOUNCED",
  "ASSIGNMENT_RECEIVED",
  "ASSIGNMENT_REVIEWED",
  "MOCK_INTERVIEW_RECORDED",
  "PLACEMENT_SUPPORT",
  "ESCALATION",
  "STAFF_DECISION",
]);

export function shouldEmail(type: NotificationType): boolean {
  return Boolean(env.RESEND_API_KEY) && env.EMAIL_NOTIFICATIONS && EMAILED_TYPES.has(type);
}

// Demo accounts (scripts/seed-demo.ts) use this domain and never get email.
export const DEMO_EMAIL_DOMAIN = "@demo.campuslink.dev";

async function emailNotification(userIds: string[], input: NotificationInput) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, NOT: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
    select: { email: true, fullName: true },
  });
  const action = input.link ? { label: "Open in CampusLink", url: `${env.APP_URL}${input.link}` } : undefined;
  for (const user of users) {
    const firstName = user.fullName.split(" ")[0] || user.fullName;
    const { html, text } = renderEmail({
      heading: input.title,
      paragraphs: [`Hi ${firstName},`, ...(input.body ? [input.body] : [])],
      action,
    });
    await sendEmail({ to: user.email, subject: input.title, html, text });
  }
}

// Best effort: a failed notification must never fail the action that caused it.
// Emails go out in the background, so the request that triggered them never
// waits on the mail provider.
export async function notify(userIds: (string | null | undefined)[], input: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, ...input })),
    });
  } catch (err) {
    console.error("[notifications] failed to create notifications", err);
  }
  if (shouldEmail(input.type)) {
    void emailNotification(unique, input).catch((err) => console.error("[notifications] email delivery failed", err));
  }
}

export async function recruiterUserIdsForCompany(companyId: string): Promise<string[]> {
  const recruiters = await prisma.recruiter.findMany({ where: { companyId }, select: { userId: true } });
  return recruiters.map((r) => r.userId);
}

export async function listNotifications(userId: string, { unreadOnly = false, limit = 30 } = {}) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string) {
  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) throw notFound("Notification");
  if (existing.readAt) return existing;
  return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
