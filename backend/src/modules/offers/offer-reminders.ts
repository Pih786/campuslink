import { prisma } from "../../config/prisma";
import { NotificationType, notify, recruiterUserIdsForCompany } from "../notifications/notifications.service";
import { officerUserIdsForCollege } from "../../utils/tenancy";
import { DOCUMENT_LABELS } from "./offer-documents.service";
import { DOCUMENT_OWNER } from "./offers.service";

const DAY_MS = 24 * 60 * 60000;
const DOCUMENT_DUE_WINDOW_DAYS = 2;
const OFFER_FOLLOW_UP_DAYS = 3;
const REMINDER_INTERVAL_MS = 60 * 60000;

// Skip users who already got this exact reminder in the last day.
async function notRecentlyReminded(userIds: string[], type: NotificationType, title: string) {
  if (userIds.length === 0) return [];
  const recent = await prisma.notification.findMany({
    where: { userId: { in: userIds }, type, title, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    select: { userId: true },
  });
  const skip = new Set(recent.map((r) => r.userId));
  return userIds.filter((id) => !skip.has(id));
}

export async function runOfferReminders(now = new Date()) {
  let documentReminders = 0;
  let offerFollowUps = 0;

  const dueSoon = await prisma.offerDocument.findMany({
    where: {
      status: { in: ["REQUIRED", "REJECTED"] },
      dueDate: { not: null, lte: new Date(now.getTime() + DOCUMENT_DUE_WINDOW_DAYS * DAY_MS) },
      offer: { acceptanceStatus: { in: ["PENDING", "ACCEPTED", "DEFERRED"] } },
    },
    include: { offer: { include: { student: true, company: true } } },
  });

  for (const doc of dueSoon) {
    if (DOCUMENT_OWNER[doc.type] !== "STUDENT" || !doc.dueDate) continue;
    const overdue = doc.dueDate < now;
    const label = DOCUMENT_LABELS[doc.type];
    const title = overdue ? `${label} is overdue` : `${label} due soon`;
    const recipients = await notRecentlyReminded([doc.offer.student.userId], "DOCUMENT_REMINDER", title);
    if (recipients.length === 0) continue;
    await notify(recipients, {
      type: "DOCUMENT_REMINDER",
      title,
      body: `${doc.offer.company.name} offer · due ${doc.dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`,
      link: "/student/offers",
    });
    documentReminders += recipients.length;
  }

  const stale = await prisma.offer.findMany({
    where: {
      acceptanceStatus: "PENDING",
      offerDate: { lte: new Date(now.getTime() - OFFER_FOLLOW_UP_DAYS * DAY_MS) },
    },
    include: { student: { include: { user: true } }, company: true },
  });

  for (const offer of stale) {
    const days = Math.floor((now.getTime() - offer.offerDate.getTime()) / DAY_MS);
    const title = `Follow up: ${offer.student.user.fullName} hasn't replied to the ${offer.company.name} offer`;
    const recipients = await notRecentlyReminded(
      [...(await recruiterUserIdsForCompany(offer.companyId)), ...(await officerUserIdsForCollege(offer.student.collegeId))],
      "OFFER_FOLLOW_UP",
      title
    );
    if (recipients.length === 0) continue;
    await notify(recipients, {
      type: "OFFER_FOLLOW_UP",
      title,
      body: `Offer sent ${days} days ago and still awaiting a response.`,
      link: "/placement/offers",
    });
    offerFollowUps += recipients.length;
  }

  return { documentReminders, offerFollowUps };
}

export function startOfferReminderSchedule() {
  const run = () =>
    runOfferReminders().catch((err) => console.error("[reminders] offer reminder run failed", err));
  setTimeout(run, 30000).unref();
  setInterval(run, REMINDER_INTERVAL_MS).unref();
}
