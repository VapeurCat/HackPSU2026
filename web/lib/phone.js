// Text message and phone call alerts through Twilio, for the most urgent moments only
// (a scam warning followed by a payment). Without keys, they're recorded on the dashboard ("demo mode").
import { update, newId } from "./db.js";

export function phoneEnabled() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM && process.env.FAMILY_PHONE);
}

function escapeXml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

async function twilio(resource, params) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${resource}.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.ok ? "sent" : `failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
}

/** Text the family member, then call them and read the alert aloud. */
export async function alertFamilyByPhone({ text, say, alertId }) {
  const to = process.env.FAMILY_PHONE;
  const from = process.env.TWILIO_FROM;
  const enabled = phoneEnabled();
  const twiml = `<Response><Say>${escapeXml(say)}</Say><Pause length="1"/><Say>Again: ${escapeXml(say)}</Say></Response>`;

  const send = async (channel, fn) => {
    let status = "demo mode (not sent)";
    if (enabled) {
      try {
        status = await fn();
      } catch (e) {
        status = `failed: ${e.message}`;
      }
    }
    const entry = {
      id: newId(channel),
      ts: new Date().toISOString(),
      channel,
      to: to || "(no FAMILY_PHONE set)",
      subject: channel === "sms" ? `📱 Text: ${text}` : `📞 Phone call: "${say}"`,
      text: channel === "sms" ? text : say,
      status,
      alertId,
    };
    update((db) => {
      db.outbox.unshift(entry);
      db.outbox = db.outbox.slice(0, 50);
    });
    if (!status.startsWith("sent")) console.log(`[KinGuard ${channel}: ${status}] ${entry.text}`);
    return entry;
  };

  return [
    await send("sms", () => twilio("Messages", { To: to, From: from, Body: text })),
    await send("call", () => twilio("Calls", { To: to, From: from, Twiml: twiml })),
  ];
}
