// What the person chose on a warning or pause screen, so the family knows.
import { recordDecision } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = ["closed", "continued", "trusted"];

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!DECISIONS.includes(body.decision)) {
    return Response.json({ error: `decision must be one of ${DECISIONS.join(", ")}` }, { status: 400 });
  }
  const alert = recordDecision(body.alertId, body.decision);
  if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });
  return Response.json({ ok: true });
}
