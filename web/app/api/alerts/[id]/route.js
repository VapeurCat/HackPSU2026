// Family marks an alert as safe or as a confirmed scam.
import { update } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["open", "safe", "confirmed_scam"];

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) {
    return Response.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  }
  const alert = update((db) => {
    const a = db.alerts.find((x) => x.id === id);
    if (a) {
      a.status = body.status;
      a.reviewedAt = new Date().toISOString();
    }
    return a;
  });
  if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });
  return Response.json(alert);
}
