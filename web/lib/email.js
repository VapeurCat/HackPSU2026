// Family notifications. Sends through Resend when configured; otherwise records
// the email on the dashboard ("demo mode") so the demo still shows the full loop.
import { update, newId } from "./db.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * The family alert email. Gives enough context to judge the situation:
 * what happened, where, how sure KinGuard is, the exact text, recent activity,
 * questions to ask, what to do, and trusted sources about the scam type.
 * context: { facts: [[label, value]], excerpt, recent: [lines], ask: [questions], guide, help }
 */
export function buildAlertEmail({ elderName, heading, explanation, cues = [], details = [], context = {} }) {
  const { facts = [], excerpt = "", recent = [], ask = [], guide = null, help = null } = context;
  const h3 = (t) => `<h3 style="margin:22px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.04em;color:#55706A">${escapeHtml(t)}</h3>`;
  const list = (items) => `<ul style="padding-left:20px;margin:0 0 8px">${items.map((i) => `<li style="margin:0 0 6px">${i}</li>`).join("")}</ul>`;
  const signs = cues.filter((c) => c.quote).slice(0, 8);
  const callLine = `Call ${elderName}. Keep it calm: they're not in trouble, and scammers often tell people to keep secrets or stay on the line.`;
  const moneyLine = "If money was sent or account details were shared, call their bank's fraud line right away, then report it at ReportFraud.ftc.gov.";

  const factRows = facts
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#55706A;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0;vertical-align:top;word-break:break-word">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#16302A;max-width:600px">
  <h2 style="margin:0 0 12px;font-size:22px">${escapeHtml(heading)}</h2>
  <p style="margin:0 0 16px">${escapeHtml(explanation)}</p>
  ${factRows ? `<table style="border-collapse:collapse;width:100%;margin:0 0 8px;font-size:15px">${factRows}</table>` : ""}
  ${details.length ? list(details.map(escapeHtml)) : ""}
  ${excerpt ? `${h3(`What ${elderName} saw`)}<blockquote style="margin:0;padding:10px 14px;border-left:4px solid #C9D6D0;background:#F4F8F6;font-size:15px;white-space:pre-wrap">${escapeHtml(excerpt)}</blockquote>` : ""}
  ${signs.length ? `${h3("Warning signs we found")}${list(signs.map((c) => `<strong>${escapeHtml(c.label || c.cue)}:</strong> &ldquo;${escapeHtml(c.quote)}&rdquo;`))}` : ""}
  ${recent.length ? `${h3("Other activity in the last 2 hours")}${list(recent.map(escapeHtml))}` : ""}
  ${h3("What to do now")}
  ${list([escapeHtml(callLine), ...(ask.length ? [`Ask:${list(ask.map(escapeHtml))}`] : []), escapeHtml(moneyLine)])}
  ${guide ? `${h3(`About this scam: ${guide.title}`)}<p style="margin:0 0 8px">${escapeHtml(guide.what)}</p>${list(guide.sources.map((s) => `<a href="${escapeHtml(s.url)}" style="color:#1B5FD1">${escapeHtml(s.name)}</a>`))}` : ""}
  ${help ? `<p style="margin:12px 0 0;font-size:14px;color:#55706A">${escapeHtml(help.text)}</p>` : ""}
  <p style="margin:20px 0 0"><a href="${DASHBOARD_URL}" style="color:#23784F;font-weight:bold">Open the KinGuard dashboard</a></p>
  <p style="margin:8px 0 0;font-size:13px;color:#55706A">For your safety, suspicious web addresses are shown as text, not links. Don't open them.</p>
</div>`;

  const section = (title, lines) => (lines.length ? ["", title.toUpperCase(), ...lines] : []);
  const text = [
    heading,
    "",
    explanation,
    "",
    ...facts.map(([k, v]) => `${k}: ${v}`),
    ...details,
    ...section(`What ${elderName} saw`, excerpt ? [`"${excerpt}"`] : []),
    ...section("Warning signs we found", signs.map((c) => `- ${c.label || c.cue}: "${c.quote}"`)),
    ...section("Other activity in the last 2 hours", recent.map((r) => `- ${r}`)),
    ...section("What to do now", [`- ${callLine}`, ...ask.map((q) => `- Ask: ${q}`), `- ${moneyLine}`]),
    ...(guide ? section(`About this scam: ${guide.title}`, [guide.what, ...guide.sources.map((s) => `- ${s.name}: ${s.url}`)]) : []),
    ...(help ? ["", help.text] : []),
    "",
    `Dashboard: ${DASHBOARD_URL}`,
  ].join("\n");

  return { html, text };
}

export async function sendFamilyEmail({ to, subject, html, text, alertId }) {
  let status = "demo mode (not sent): add a Resend key to .env.local";
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
    status = "not sent: add an email address in Settings";
  }

  const entry = { id: newId("mail"), ts: new Date().toISOString(), to: to || "(no email address set)", subject, text, status, alertId };
  update((db) => {
    db.outbox.unshift(entry);
    db.outbox = db.outbox.slice(0, 50);
  });
  if (!status.startsWith("sent")) console.log(`[KinGuard email: ${status}] ${subject}\n${text}\n`);
  return entry;
}
