// Called by the Scrutinize button in Gmail. Always runs the AI and always emails family,
// because the elder chose to ask for a second opinion.
import { analyzeContent } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text) return Response.json({ error: "The email body was empty." }, { status: 400 });

  const verdict = await analyzeContent(
    { source: "gmail", text, sender: body.sender, subject: body.subject },
    { forceAI: true, alwaysNotify: true }
  );
  return Response.json(verdict);
}
