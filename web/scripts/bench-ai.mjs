// Compare Gemini models on real KinGuard checks: npm run bench-ai (or: npm run bench-ai -- gemini-3.8-flash gemini-pro-latest)
// Scores how often each model gets the verdict right, and how long it takes (shorter is better for live warnings).
import fs from "fs";
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const demo = (f) => strip(fs.readFileSync(new URL(`../public/demo/${f}.html`, import.meta.url), "utf8"));
const cases = [
  { name: "scam page", want: "high", input: { source: "web", url: "http://example.test/alert", text: demo("tech-support") } },
  { name: "fool-the-AI page", want: "high", needCue: "manipulating_the_ai", input: { source: "web", url: "http://example.test/win", text: demo("injection") } },
  { name: "sneaky phishing email", want: "high", input: { source: "gmail", sender: "Account Services <noreply@acct-services-mail.com>", subject: "Quick check on your recent sign-in", text: "Hi Terry, we noticed a sign-in from a new device. If this wasn't you, please confirm your details using the secure form below so we can keep your account open. Thanks, Account Services" } },
  { name: "pushy pizza page", want: "low", input: { source: "web", url: "https://joespizza.example/", text: "Joe's Pizza - Order online now. Limited time offer, act now! Two large pizzas for $19.99 today only. Call (814) 555-0101 for delivery." } },
  { name: "real Amazon email", want: "low", input: { source: "gmail", sender: "Amazon.com <shipment-tracking@amazon.com>", subject: "Your package has shipped", text: "Your package has shipped and will arrive Thursday. Track your package in Your Orders." } },
];
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-pro-latest", "gemini-3.1-pro-preview"];
const models = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;
if (!process.env.GEMINI_API_KEY) {
  console.log("Add GEMINI_API_KEY to web/.env.local first.");
  process.exit(1);
}
const RANK = { low: 0, medium: 1, high: 2 };
for (const model of models) {
  process.env.GEMINI_MODEL = model;
  process.env.GEMINI_FALLBACK_MODEL = model; // no fallback: measure this model alone
  const g = await import(`../lib/gemini.js?m=${model}`);
  let ok = 0, ms = [], errs = 0;
  const notes = [];
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await g.analyzeWithGemini({ ...c.input, elderName: "Terry" });
      ms.push(Date.now() - t0);
      const pass = c.want === "low" ? r.risk === "low" : RANK[r.risk] >= RANK[c.want] && (!c.needCue || (r.cues || []).some((x) => x.cue === c.needCue));
      if (pass) ok++;
      else notes.push(`${c.name}: got ${r.risk}${c.needCue ? ` cues=${(r.cues || []).map((x) => x.cue).join("/")}` : ""}`);
    } catch (e) {
      errs++;
      notes.push(`${c.name}: ERROR ${String(e.message).slice(0, 70)}`);
    }
  }
  const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
  const max = ms.length ? Math.max(...ms) : 0;
  console.log(`${model.padEnd(24)} correct ${ok}/${cases.length}  avg ${(avg / 1000).toFixed(1)}s  slowest ${(max / 1000).toFixed(1)}s${errs ? `  errors ${errs}` : ""}${notes.length ? "\n    " + notes.join("\n    ") : ""}`);
}
