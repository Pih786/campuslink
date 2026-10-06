import { env } from "../config/env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_URL = "https://api.resend.com/emails";

// Sends through Resend when RESEND_API_KEY is set; otherwise prints the
// message to the server console so flows like password reset still work in
// development. Never throws: callers shouldn't fail because email did.
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(
      `\n[email:dev] RESEND_API_KEY not set — not sent.\n  To: ${message.to}\n  Subject: ${message.subject}\n  ${message.text.replace(/\n/g, "\n  ")}\n`
    );
    return false;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[email] Resend rejected the message (${res.status}): ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] sending failed", err);
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Simple, readable transactional layout.
export function renderEmail({ heading, paragraphs, action }: { heading: string; paragraphs: string[]; action?: { label: string; url: string } }) {
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#1f4f82;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1c1f">
  <p style="font-weight:700;font-size:16px;margin:0 0 20px">CampusLink</p>
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
  ${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.6;color:#4d5058">${escapeHtml(p)}</p>`).join("\n  ")}
  ${button}
  ${action ? `<p style="font-size:12px;color:#7c7f87">If the button doesn't work, paste this link into your browser:<br>${escapeHtml(action.url)}</p>` : ""}
</div>`;
  const text = [heading, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
  return { html, text };
}
