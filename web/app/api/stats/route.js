// How much KinGuard checked: the extension adds one per page or email, the pop-up reads the totals.
import { load } from "@/lib/db";
import { bump, summary } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(summary(load()));
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  bump(body.kind === "email" ? "email" : "page");
  return Response.json({ ok: true });
}
