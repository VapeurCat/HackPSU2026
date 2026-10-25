// Settings: who KinGuard protects, the trusted contact, and which alerts they get.
import { update } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "(814) 555-0123" -> "+18145550123". US numbers without a country code get +1.
function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

export async function PUT(req) {
  const body = await req.json().catch(() => ({}));
  const personName = clean(body.personName, 40);
  const c = body.contact || {};
  const name = clean(c.name, 40);
  const relation = clean(c.relation, 30);
  const email = clean(c.email, 120);
  const phone = normalizePhone(c.phone);

  const errors = {};
  if (!personName) errors.personName = "Enter the name of the person KinGuard protects.";
  if (!name) errors.name = "Enter the trusted contact's name.";
  if (email && !EMAIL.test(email)) errors.email = "That email address doesn't look right.";
  if (phone && !/^\+\d{10,15}$/.test(phone)) errors.phone = "Enter a full phone number, like (814) 555-0123 or +44 20 7946 0958.";
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 400 });

  const alerts = {
    email: c.alerts?.email !== false,
    text: c.alerts?.text !== false,
    call: c.alerts?.call !== false,
  };

  const saved = update((db) => {
    db.person = { ...db.person, name: personName };
    db.family[0] = { ...(db.family[0] || { id: "contact", role: "owner" }), name, relation, email, phone, alerts };
    return { person: db.person, contact: db.family[0] };
  });
  return Response.json({ ok: true, ...saved });
}
