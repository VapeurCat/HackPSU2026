// "Read this to me": returns ElevenLabs audio when configured.
// Without a key it returns audio: null and the extension uses the browser's built-in voice.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { text } = await req.json().catch(() => ({}));
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !text) return Response.json({ audio: null });

  const voice = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: String(text).slice(0, 600),
        model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
        voice_settings: { stability: 0.6, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      console.warn("[KinGuard] ElevenLabs failed:", res.status, (await res.text()).slice(0, 200));
      return Response.json({ audio: null });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return Response.json({ audio: `data:audio/mpeg;base64,${buf.toString("base64")}` });
  } catch (e) {
    console.warn("[KinGuard] ElevenLabs error:", e.message);
    return Response.json({ audio: null });
  }
}
