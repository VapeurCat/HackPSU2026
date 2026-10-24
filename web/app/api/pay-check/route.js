// "Pause before you pay". The extension calls this when a page looks like a payment page,
// and again with the person's choice on the pause screen.
import { payAttempt, recordPayDecision } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = ["closed", "continued"];

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  if (body.alertId) {
    if (!DECISIONS.includes(body.decision)) {
      return Response.json({ error: `decision must be one of ${DECISIONS.join(", ")}` }, { status: 400 });
    }
    const alert = recordPayDecision(body.alertId, body.decision);
    if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  const result = await payAttempt({ url: body.url, title: body.title, kind: body.kind, label: body.label });
  return Response.json(result);
}
