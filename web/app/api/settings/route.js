// Settings: who KinGuard protects, the trusted contact, and which alerts they get.
import { update } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const personName = clean(body.personName, 40);
  const c = body.contact || {};
  const name = clean(c.name, 40);
  const relation = clean(c.relation, 30);
  const email = clean(c.email, 120);

  const errors = {};
  if (!personName) errors.personName = "Enter the name of the person KinGuard protects.";
  if (!name) errors.name = "Enter the trusted contact's name.";
  if (email && !EMAIL.test(email)) errors.email = "That email address doesn't look right.";
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });

  const alerts = { email: c.alerts?.email !== false };

  const saved = update((db) => {
    db.person = { ...db.person, name: personName };
    db.family[0] = { ...(db.family[0] || { id: "contact", role: "owner" }), name, relation, email, alerts };
    return { person: db.person, contact: db.family[0] };
  });
  return Response.json({ ok: true, ...saved });
}
