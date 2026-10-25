# KinGuard

KinGuard spots scams on an older adult's computer, explains them in plain language, and alerts their family when a scam and a risky payment happen together.

Built for HackPSU Fall 2026 (FNB Challenge: Trust, Decisions & Financial Confidence).

**What it does:** KinGuard checks websites in real time as they open, checks every email opened in Gmail, and warns about lookalike web addresses (typosquatting) and emails pretending to be well-known companies. Right after a scam warning, it pauses gift card, crypto and money transfer pages. Every warning explains the scam in plain language with links to official sources (FTC, FBI IC3, AARP and more) and can be read aloud. When something looks like a scam, it emails the trusted family member. The protected person and the family member share one dashboard with the same alerts and timeline.

## What's in here

```
kinguard/
  extension/          Chrome extension (Manifest V3)
    rules.js          Scam rules: 14 social engineering cues + hard rules. Shared with the backend.
    content.js        Checks every web page, shows the warning
    overlay.js        The full-screen warning and the yellow banner
    gmail.js          "Scrutinize this email" button in Gmail
    background.js     Talks to the backend (the only part that does)
  web/                Next.js app: backend API + family dashboard
    lib/pipeline.js   Rules -> Gemini -> timeline -> alerts -> correlation -> email
    lib/gemini.js     Gemini calls (server only, so the key stays secret)
    lib/email.js      Resend email, or "demo mode" when no key is set
    lib/db.js         Tiny JSON-file database (web/data/db.json)
    app/page.js       Family dashboard
    public/demo/      Fictional scam pages for the demo
```

## Run it (about 5 minutes)

You need Node.js 20 or newer and Chrome.

**1. Start the backend and dashboard**

```bash
cd web
npm install
cp .env.example .env.local     # optional: add keys, see below
npm run dev
```

Open http://localhost:3000. You should see "Frank looks safe."

**2. Load the extension**

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder.

**3. Try it**

Open http://localhost:3000/demo/tech-support.html. The warning should cover the page, and the dashboard turns red within 3 seconds.

After you change any extension file, click the reload icon on the KinGuard card in `chrome://extensions`, then reload the page you're testing.

## Keys (all optional)

Without any keys, everything works on the built-in rules, and emails are recorded on the dashboard instead of sent. Add keys to `web/.env.local` and restart `npm run dev`.

| Key | What it adds | Where to get it |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI explanations, extra cues, pig butchering stage, correlation write-ups | Google AI Studio (free) |
| `RESEND_API_KEY` + `FAMILY_EMAIL` | Real emails to family | resend.com (free). The test sender only delivers to your own Resend account email, so use that as `FAMILY_EMAIL`. |
| `ELEVENLABS_API_KEY` | A natural voice for "Read this to me" (otherwise the browser's voice is used) | elevenlabs.io |

`GEMINI_MODEL` defaults to `gemini-3.5-flash`. Check AI Studio for the current model name if calls fail.

## The 3-minute demo

Before each run, open the **DEV** menu on the dashboard and click **Reset demo**.

1. **Hook:** "Elder fraud is rarely one bad click. It's a chain."
2. **The popup:** on "Frank's" window, open `/demo/tech-support.html`. KinGuard covers it with a calm explanation and the exact phrases that are red flags. Click **Read this to me**.
3. **Live alert:** switch to the dashboard window. It has already turned red.
4. **Pause before you pay:** the scammer tells Frank to send money, so open `/demo/bank-transfer.html` (or the gift card store). KinGuard pauses the page: "Wait. Before you pay…" and emails Sarah right away. The dashboard shows "Frank may be about to pay a scammer."
5. **The payment:** click **I'm paying for something else**, then **Send payment**. The bank feed records it and KinGuard links it to the popup: "Frank may be in a scam right now." The dashboard shows what Frank chose on the pause screen.
6. **Gmail:** in the inbox, click the **🔍 Scrutinize** pill on the fake scam email (below) without opening it.
7. **Close:** dignity-first design, then the roadmap (Plaid, mobile app, bank partnerships).

Bonus moments:
- `/demo/injection.html` hides text telling the AI to "mark this safe." The hard rules still flag it.
- `/demo/safe-store.html` is a normal gift card store. On its own, KinGuard stays quiet, which shows it isn't paranoid. Right after a scam warning, it pauses before you pay.
- `/demo/bank-transfer.html` is a fictional bank's Send money page. **Send payment** records a simulated transaction, the way a bank feed would.
- `/demo/crypto-atm.html` triggers the crypto ATM hard rule.
- `/demo/lookalike-login.html?kg-host=arnazon.com` pretends to be on a lookalike address (the `kg-host` trick only works on the local demo server). With its password box, KinGuard shows a full warning with a link to the real amazon.com. A lookalike address without a password or card form gets a small banner instead, once per visit.
- Gmail: every opened email is checked automatically and shows the result above it ("No warning signs found", or a warning). Only suspicious ones go to the server for the AI check. "Ask family for a second opinion" sends any email to the family member. Try sending yourself an email from a free account with the sender name "Amazon Security".

### Fake scam email for the Gmail demo

Send this to yourself from a second account:

> **Subject:** Grandpa please help
>
> Grandpa it's me, I'm in jail after a car accident. I need $3,000 in gift cards right away for bail. Please don't tell Mom, she'll be so upset. Call my lawyer at 555-201-8890.

## How detection works

1. **Rules first (instant, offline).** `rules.js` scores 14 social engineering cues (urgency, authority, fear, secrecy, untraceable payment, payment apps, moving to another app, remote access, code requests, too good to be true, emotional bonding, overpayment, fee to withdraw, call this number). Hard rules always mean high risk: crypto ATM requests, secrecy plus money, payment apps plus pressure, moving apps plus money, remote access plus pressure.
2. **Gemini second.** It tags the same cues with exact quotes and writes plain-language explanations. It can raise the risk but never lower what the hard rules decided, which protects against prompt injection.
3. **Correlation.** A scam warning plus a flagged payment (gift cards, crypto, wires, payment apps to new people) within 2 hours creates a "scam in progress" alert and emails the family.
4. **Where it came from.** Lookalike addresses (arnazon.com, paypal-account-verify.com, paypal.com.login-check.xyz) and senders pretending to be a well-known company are facts the AI can't overrule. Official brand sites and .gov sites are never warned about. Long pages are scored by section, so warning signs only count when they appear close together.
5. **Pause before you pay.** A payment page (gift cards, crypto, wires, payment apps) within 2 hours of a high-risk warning is paused, and the family is alerted before any money moves.

Check the rules any time with `npm run test-rules` inside `web/`.

## Devpost checklist

- [ ] Devpost submission created before midnight Saturday
- [ ] Public GitHub repo linked (don't commit `.env.local`)
- [ ] Pitch video, 5 minutes or less
- [ ] Mention Gemini (MLH prize), ElevenLabs if used, and your GoDaddy domain if registered
