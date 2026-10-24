// Clears alerts, events and emails and restores a normal week of transactions. Use before each demo run.
import { reset } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  reset();
  return Response.json({ ok: true });
}
