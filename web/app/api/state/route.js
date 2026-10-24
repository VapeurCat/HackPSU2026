// Everything the dashboard shows. The dashboard polls this every 3 seconds.
import { load } from "@/lib/db";
import { geminiEnabled } from "@/lib/gemini";
import { phoneEnabled } from "@/lib/phone";
import KinGuardRules from "@/lib/rules.cjs";
import { factsFor } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = load();
  // Each alert gets the facts and excerpt of the warning it is about, so the family can judge it.
  const alerts = db.alerts.map((a) => {
    const e = db.events.find((x) => x.id === a.eventIds?.[0]);
    let facts = factsFor(e);
    // Pay and payment alerts are about an earlier warning, so label its facts that way.
    if (a.kind === "pay_attempt" || a.kind === "correlated") facts = facts.map(([k, v]) => [{ What: "Earlier warning", When: "Warned at" }[k] || k, v]);
    return { ...a, facts, excerpt: e?.excerpt || "" };
  });
  return Response.json({
    ...db,
    alerts,
    config: {
      gemini: geminiEnabled(),
      email: Boolean(process.env.RESEND_API_KEY && (process.env.FAMILY_EMAIL || db.family[0]?.email)),
      voice: Boolean(process.env.ELEVENLABS_API_KEY),
      phone: phoneEnabled(),
    },
    guides: KinGuardRules.GUIDES,
    help: KinGuardRules.HELP,
    now: new Date().toISOString(),
  });
}
