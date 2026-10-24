// Family notifications. Sends through Resend when configured; otherwise records
// the email on the dashboard ("demo mode") so the demo still shows the full loop.
import { update, newId } from "./db.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function buildAlertEmail({ elderName, heading, explanation, cues = [], details = [] }) {
  const cueRows = cues
    .filter((c) => c.quote)
    .slice(0, 6)
    .map(
      (c) =>
        `<li style="margin:0 0 8px"><strong>${escapeHtml(c.label || c.cue)}:</strong> &ldquo;${escapeHtml(c.quote)}&rdquo;</li>`
    )
    .join("");
  const detailRows = details.map((d) => `<li style="margin:0 0 6px">${escapeHtml(d)}</li>`).join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#16302A;max-width:560px">
  <h2 style="margin:0 0 12px;font-size:22px">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 16px">${escapeHtml(explanation)}</p>
  ${detailRows ? `<ul style="padding-left:20px;margin:0 0 16px">${detailRows}</ul>` : ""}
  ${cueRows ? `<p style="margin:0 0 8px"><strong>Warning signs we found</strong></p><ul style="padding-left:20px;margin:0 0 16px">${cueRows}</ul>` : ""}
  <p style="margin:0 0 16px"><strong>What to do now:</strong> call ${escapeHtml(elderName)} and ask what's going on before any money moves.</p>
  <p style="margin:0"><a href="${DASHBOARD_URL}" style="color:#23784F">Open the KinGuard dashboard</a></p>
</div>`;

  const text = [
    heading,
    "",
    explanation,
    ...details,
    "",
    ...cues.filter((c) => c.quote).map((c) => `- ${c.label || c.cue}: "${c.quote}"`),
    "",
    `What to do now: call ${elderName} before any money moves.`,
    DASHBOARD_URL,
  ].join("\n");

  return { html, text };
}

export async function sendFamilyEmail({ to, subject, html, text, alertId }) {
  let status = "demo mode (not sent)";
  const key = process.env.RESEND_API_KEY;

  if (key && to) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "KinGuard <onboarding@resend.dev>",
          to: [to],
          subject,
          html,
          text,
        }),
      });
      status = res.ok ? "sent" : `failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
    } catch (e) {
      status = `failed: ${e.message}`;
    }
  } else if (key && !to) {
    status = "not sent: set FAMILY_EMAIL in .env.local";
  }

  const entry = { id: newId("mail"), ts: new Date().toISOString(), to: to || "(no FAMILY_EMAIL set)", subject, text, status, alertId };
  update((db) => {
    db.outbox.unshift(entry);
    db.outbox = db.outbox.slice(0, 50);
  });
  if (!status.startsWith("sent")) console.log(`[KinGuard email: ${status}] ${subject}\n${text}\n`);
  return entry;
}
