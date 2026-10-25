// "Send a test alert": tries every alert type that's turned on, and reports exactly what happened.
import { load, familyContact } from "@/lib/db";
import { sendFamilyEmail } from "@/lib/email";
import { alertFamilyByPhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = load();
  const c = familyContact(db);
  const name = db.person.name;
  const results = [];

  if (c.alerts.email) {
    const text = `This is a test from KinGuard. When KinGuard spots a likely scam on ${name}'s computer, alerts like this will come to you. No action is needed.`;
    const mail = await sendFamilyEmail({
      to: c.email,
      subject: `KinGuard test alert for ${c.name}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:16px">${text}</p>`,
      text,
    });
    results.push({ channel: "email", to: mail.to, status: mail.status });
  }

  if (c.alerts.text || c.alerts.call) {
    const sent = await alertFamilyByPhone({
      text: `KinGuard test: this is how you'll be texted if ${name} may be in a scam. No action needed.`,
      say: `This is a test call from KinGuard. This is how you'll be called if ${name} may be in a scam. No action is needed.`,
      to: c.phone,
      sms: c.alerts.text,
      call: c.alerts.call,
    });
    sent.forEach((m) => results.push({ channel: m.channel === "sms" ? "text" : "phone call", to: m.to, status: m.status }));
  }

  if (!results.length) results.push({ channel: "none", to: "", status: "All alert types are turned off in Settings." });
  return Response.json({ results });
}
