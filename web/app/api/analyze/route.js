// Called by the extension for web pages (source "web") and opened emails that looked suspicious
// on the computer (source "gmail"), and for pasted messages (source "paste").
import { analyzeContent } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["web", "gmail", "paste"];

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text) return Response.json({ error: "Send the text to check in the text field." }, { status: 400 });

  const source = SOURCES.includes(body.source) ? body.source : "web";
  const verdict = await analyzeContent(
    {
      source,
      text,
      url: body.url,
      title: body.title,
      sender: body.sender,
      subject: body.subject,
      sensitiveForm: Boolean(body.sensitiveForm),
    },
    { forceAI: source === "paste" }
  );
  return Response.json(verdict);
}
