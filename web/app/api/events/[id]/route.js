// Delete a timeline entry. Alerts that were about it go too, since they'd have nothing left to show.
import { update } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req, { params }) {
  const { id } = await params;
  const found = update((db) => {
    const before = db.events.length;
    db.events = db.events.filter((e) => e.id !== id);
    db.alerts = db.alerts.filter((a) => a.eventIds?.[0] !== id);
    return db.events.length < before;
  });
  if (!found) return Response.json({ error: "Timeline entry not found" }, { status: 404 });
  return Response.json({ ok: true });
}
