// "Pause before you pay". The extension calls this when a page looks like a payment page.
// The person's choice on the pause screen goes to /api/decision.
import { payAttempt } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const result = await payAttempt({ url: body.url, title: body.title, kind: body.kind, label: body.label });
  return Response.json(result);
}
