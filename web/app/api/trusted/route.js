// Trusted sites: places where the protected person chose "Trust this site" on a yellow notice.
// Stored with the rest of KinGuard's data, so the dashboard shows the list and either person can remove a site.
import { load, update } from "@/lib/db";
import KinGuardRules from "@/lib/rules.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanHost(raw) {
  const host = String(raw || "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes(".") ? host : "";
}

export async function GET() {
  const db = load();
  return Response.json({ hosts: (db.trustedSites || []).map((t) => t.host) });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const host = cleanHost(body.host);
  if (!host) return Response.json({ error: "That isn't a website address KinGuard can trust." }, { status: 400 });
  // A lookalike address (arnazon.com) is never trusted: that's exactly what a scammer would ask for.
  const look = KinGuardRules.lookalikeDomain(host);
  if (look) return Response.json({ error: `${host} imitates ${look.official}, so KinGuard won't stop warning about it.` }, { status: 400 });

  update((db) => {
    db.trustedSites = (db.trustedSites || []).filter((t) => t.host !== host);
    db.trustedSites.unshift({ host, ts: new Date().toISOString(), by: db.person.name });
  });
  return Response.json({ ok: true, host });
}

export async function DELETE(req) {
  const body = await req.json().catch(() => ({}));
  const host = cleanHost(body.host);
  update((db) => {
    db.trustedSites = (db.trustedSites || []).filter((t) => t.host !== host);
  });
  return Response.json({ ok: true });
}
