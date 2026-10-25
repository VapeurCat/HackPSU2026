// "Send a test alert": sends a test email and reports exactly what happened.
import { load, familyContact } from "@/lib/db";
import { sendFamilyEmail } from "@/lib/email";

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

  if (!results.length) results.push({ channel: "none", to: "", status: "Email alerts are turned off in Settings." });
  return Response.json({ results });
}
