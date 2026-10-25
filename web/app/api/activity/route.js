// KinGuard was paused or turned back on from the toolbar pop-up. Shown on the shared timeline, so it's never a secret.
import { update, newId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TITLES = {
  paused: (until) =>
    `KinGuard was paused until ${new Date(until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
  resumed: () => "KinGuard protection was turned back on",
};

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!TITLES[body.activity]) return Response.json({ error: "activity must be paused or resumed" }, { status: 400 });
  update((db) => {
    db.events.unshift({
      id: newId("ev"),
      ts: new Date().toISOString(),
      source: "extension",
      type: "activity",
      title: TITLES[body.activity](body.until),
      risk: "low",
      cues: [],
    });
    db.events = db.events.slice(0, 200);
  });
  return Response.json({ ok: true });
}
