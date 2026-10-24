// Everything the dashboard shows. The dashboard polls this every 3 seconds.
import { load } from "@/lib/db";
import { geminiEnabled } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = load();
  return Response.json({
    ...db,
    config: {
      gemini: geminiEnabled(),
      email: Boolean(process.env.RESEND_API_KEY && (process.env.FAMILY_EMAIL || db.family[0]?.email)),
      voice: Boolean(process.env.ELEVENLABS_API_KEY),
    },
    now: new Date().toISOString(),
  });
}
