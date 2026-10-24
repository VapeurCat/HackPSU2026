// Called by the extension (source "web") and the dashboard's message checker (source "paste").
import { analyzeContent } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text) return Response.json({ error: "Send the text to check in the text field." }, { status: 400 });

  const source = body.source === "paste" ? "paste" : "web";
  const verdict = await analyzeContent(
    { source, text, url: body.url, title: body.title },
    { forceAI: source === "paste" }
  );
  return Response.json(verdict);
}
