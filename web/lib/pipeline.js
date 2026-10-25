// The core: rules -> Gemini -> timeline -> alerts -> correlation -> family email.
import KinGuardRules from "./rules.cjs";
import { load, update, newId, familyContact } from "./db.js";
import { analyzeWithGemini, explainCorrelation, geminiEnabled } from "./gemini.js";
import { buildAlertEmail, sendFamilyEmail } from "./email.js";
import { alertFamilyByPhone } from "./phone.js";

const { analyze, flagTransaction, maxRisk, RANK } = KinGuardRules;
const CORRELATION_WINDOW_MIN = 120;
const PAUSE_WINDOW_MIN = 120; // a payment page this soon after a high-risk scam warning gets paused

const AI_CUE_LABELS = {
  urgency: "Rushing you",
  authority: "Pretending to be an authority",
  fear: "Scaring you",
  secrecy: "Asking you to keep it secret",
  untraceable_payment: "Untraceable payment",
  payment_app: "Asking for a payment app transfer",
  platform_switch: "Moving you to another app",
  remote_access: "Asking to control your computer",
  code_request: "Asking for a code or password",
  too_good_to_be_true: "Too good to be true",
  emotional_bonding: "Fast emotional closeness",
  overpayment: "Fake refund or overpayment",
  fee_to_withdraw: "Fee to get your own money",
  crypto_atm: "Crypto ATM payment",
  call_this_number: "Pushing you to call a number",
  manipulating_the_ai: "Hidden text trying to fool the AI",
  blackmail: "Threatening to expose you",
  account_phishing: "Pressure to sign in or verify your account",
  fake_charge: "A charge, renewal or refund you didn't expect",
  legal_threat: "Legal, tax, toll or debt threat",
  job_offer: "A job, school or money offer that's too easy",
  upfront_fee: "Pay a fee first to get something",
  dangerous_file: "Pushing you to open a file, link or code",
  payment_redirect: "Changing where money goes",
  boss_request: "Urgent favor from a boss or coworker",
  impersonated_company: "Pretending to be a well-known company",
};

const LOCAL_TO_AI = {
  untraceable: "untraceable_payment",
  paymentApp: "payment_app",
  platformSwitch: "platform_switch",
  remoteAccess: "remote_access",
  codeRequest: "code_request",
  tooGood: "too_good_to_be_true",
  bonding: "emotional_bonding",
  feeToWithdraw: "fee_to_withdraw",
  callNumber: "call_this_number",
  cryptoAtm: "crypto_atm",
  accountPhish: "account_phishing",
  fakeCharge: "fake_charge",
  legalThreat: "legal_threat",
  jobOffer: "job_offer",
  upfrontFee: "upfront_fee",
  dangerousFile: "dangerous_file",
  paymentRedirect: "payment_redirect",
  bossRequest: "boss_request",
  brandSpoof: "impersonated_company",
};

function mergeVerdicts(local, ai) {
  if (!ai) return { ...local, aiUsed: false, stage: local.stage || null, guideKey: local.guideKey || null };

  // AI can raise risk. It can clear a mild (medium) warning that no hard rule triggered,
  // such as pushy ad wording on a normal page, but never lower a high-risk verdict.
  const aiRisk = ["low", "medium", "high"].includes(ai.risk) ? ai.risk : "low";
  // A lookalike address or a fake company sender is a fact about where it came from, so the AI can't clear it.
  const pinned = local.cues.some((c) => c.cue === "lookalike" || c.cue === "brandSpoof");
  const aiCanClear = local.risk === "medium" && !local.hardRules.length && !pinned && aiRisk === "low";
  const risk = aiCanClear ? "low" : maxRisk(local.risk, aiRisk);

  const seen = new Set(local.cues.map((c) => LOCAL_TO_AI[c.cue] || c.cue));
  const extra = (ai.cues || [])
    .filter((c) => c && c.cue && !seen.has(c.cue))
    .map((c) => ({ cue: c.cue, label: AI_CUE_LABELS[c.cue] || c.cue.replace(/_/g, " "), quote: String(c.quote || "").slice(0, 120), fromAI: true }));

  const aiType = ai.scam_type && ai.scam_type !== "none" ? ai.scam_type : null;
  const typeName = aiType ? aiType.charAt(0).toUpperCase() + aiType.slice(1) : local.scamTypeName;

  // When the warning stands but the AI rated it lower (it only sees the text, not a fake address
  // or a hard rule), use KinGuard's own wording, so the warning never says "this looks fine."
  if (risk !== "low" && RANK[aiRisk] < RANK[risk]) {
    return { ...local, risk, cues: [...local.cues, ...extra], aiUsed: true };
  }

  return {
    ...local,
    risk,
    cues: [...local.cues, ...extra],
    scamTypeName: risk === "low" ? null : typeName || "Possible scam",
    explanationForElder:
      risk === "low" ? ai.explanation_for_elder || "" : ai.explanation_for_elder || local.explanationForElder || KinGuardRules.ELDER_TEXT.generic,
    explanationForFamily: ai.explanation_for_family || local.explanationForFamily,
    stage: Number(ai.pig_butchering_stage) || local.stage || null,
    guideKey: risk === "low" ? null : KinGuardRules.guideFor(aiType) || local.guideKey || "generic",
    aiUsed: true,
  };
}

// The mobile number and which phone alerts are on, from Settings.
function phoneSettings(db) {
  const c = familyContact(db);
  return { to: c.phone, sms: c.alerts.text, call: c.alerts.call };
}

const SOURCE_NAMES = { web: "web page", gmail: "email", paste: "checked message", bank: "bank" };

function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function timeOf(ts) {
  return new Date(ts).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// The part of the page or email around the first warning sign, so the family sees what mattered.
function excerptAround(text, cues) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const quote = (cues || []).find((c) => c.quote && !c.fromAI)?.quote;
  const at = quote ? t.indexOf(quote) : -1;
  let start = Math.max(0, at - 150);
  if (start > 0) start = t.indexOf(" ", start) + 1 || start; // begin on a whole word
  let end = Math.min(t.length, start + 450);
  if (end < t.length) end = t.lastIndexOf(" ", end) > start ? t.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${t.slice(start, end)}${end < t.length ? "…" : ""}`;
}

// How sure KinGuard is, in plain words.
function sureness(e) {
  const level = { high: "High risk", medium: "Suspicious", low: "Looks OK" }[e.risk] || e.risk;
  const how = e.aiUsed ? "confirmed by AI review" : "built-in rules only (AI review was unavailable)";
  const rules = (e.hardRules || []).map((r) => KinGuardRules.HARD_RULE_TEXT[r]).filter(Boolean);
  const n = (e.cues || []).length;
  return `${level}, ${how}. ${n} warning sign${n === 1 ? "" : "s"}${rules.length ? `, including: ${rules.join("; ")}` : ""}.`;
}

// What, where, when and how sure, for the family email and dashboard.
export function factsFor(e) {
  if (!e) return [];
  const facts = [];
  if (e.scamTypeName) facts.push(["What", e.scamTypeName]);
  if (e.source === "gmail") {
    facts.push(["Email from", e.sender || "unknown sender"], ["Subject", e.title || "(none)"]);
  } else if (e.source === "web") {
    if (e.title && e.title !== e.url) facts.push(["Page title", e.title]);
    if (e.url) facts.push(["Website", siteOf(e.url) || e.url], ["Full address", e.url]);
  } else if (e.source === "bank") {
    facts.push(["Payment", e.title]);
  }
  facts.push(["When", timeOf(e.ts)]);
  if (e.type === "scam_check") facts.push(["How sure", sureness(e)]);
  return facts;
}

function recentFor(db, skipIds) {
  const now = Date.now();
  return db.events
    .filter((e) => !skipIds.includes(e.id) && now - Date.parse(e.ts) <= 2 * 3600e3)
    .slice(0, 5)
    .map((e) => `${timeOf(e.ts)}: ${e.scamTypeName || "Checked"} (${SOURCE_NAMES[e.source] || e.source}: ${e.source === "web" && e.url ? siteOf(e.url) : e.title})`);
}

const DECISION_TEXT = {
  closed: "Closed the page",
  continued: "Chose to continue anyway",
  trusted: "Clicked “I trust this page” and stayed on it",
};

/** earlier: the event is an earlier warning (pay attempt, payment), so label its facts that way. */
async function notifyFamily(db, { heading, subject, explanation, cues, details = [], alertId, event, earlier = false, extraFacts = [], skipIds = [], guideKey, askKey }) {
  const contact = familyContact(db);
  if (!contact.alerts.email) return { to: contact.email || "(email alerts off)", status: "off in Settings", ts: new Date().toISOString() };
  const to = contact.email;
  const guide = KinGuardRules.GUIDES[guideKey] || null;
  const ask = (KinGuardRules.GUIDES[askKey || guideKey] || KinGuardRules.GUIDES.generic).ask;
  const fresh = load();
  let facts = factsFor(event);
  if (earlier) facts = facts.map(([k, v]) => [{ What: "Earlier warning", When: "Warned at" }[k] || k, v]);
  // If the person already responded to an earlier warning about this event, say what they chose.
  const answered = event && fresh.alerts.find((a) => a.id !== alertId && a.eventIds?.[0] === event.id && a.decision);
  if (answered) facts.push([`${db.person.name}'s choice`, `${DECISION_TEXT[answered.decision]} (${timeOf(answered.decidedAt)})`]);
  const context = {
    facts: [...facts, ...extraFacts],
    excerpt: event?.excerpt || "",
    recent: recentFor(fresh, [event?.id, ...skipIds]),
    ask,
    guide,
    help: KinGuardRules.HELP,
  };
  const { html, text } = buildAlertEmail({ elderName: db.person.name, heading, explanation, cues, details, context });
  return sendFamilyEmail({ to, subject, html, text, alertId });
}

/**
 * Analyze content from the extension, the Gmail Scrutinize button, or the dashboard.
 * input: { source: 'web'|'gmail'|'paste', text, url, title, sender, subject }
 */
export async function analyzeContent(input, { forceAI = false, alwaysNotify = false } = {}) {
  const db0 = load();
  const local = analyze(input.text, { sender: input.sender, url: input.url, sensitiveForm: input.sensitiveForm });

  let ai = null;
  let aiError = null;
  if (geminiEnabled() && (forceAI || local.risk !== "low")) {
    try {
      ai = await analyzeWithGemini({ ...input, elderName: db0.person.name });
    } catch (e) {
      aiError = e.message;
      console.warn("[KinGuard] Gemini failed, using rules only:", e.message);
    }
  }
  const verdict = mergeVerdicts(local, ai);

  // Everyday pages and emails that turn out fine aren't logged. Checks someone asked for always are.
  const shouldSave = verdict.risk !== "low" || input.source === "paste" || alwaysNotify;
  let event = null;
  let alert = null;

  if (shouldSave) {
    event = {
      id: newId("ev"),
      ts: new Date().toISOString(),
      source: input.source,
      type: "scam_check",
      title: input.subject || input.title || (input.source === "paste" ? "Pasted message" : input.url) || "Untitled",
      url: input.url || null,
      sender: input.sender || null,
      risk: verdict.risk,
      scamTypeName: verdict.scamTypeName,
      cues: verdict.cues,
      stage: verdict.stage,
      guideKey: verdict.guideKey,
      explanationForElder: verdict.explanationForElder,
      explanationForFamily: verdict.explanationForFamily,
      aiUsed: verdict.aiUsed,
      hardRules: (verdict.hardRules || []).map((r) => r.rule),
      excerpt: excerptAround(input.text, verdict.cues),
    };
    update((db) => {
      db.events.unshift(event);
      db.events = db.events.slice(0, 200);
    });
  }

  const db = load();
  const elder = db.person.name;
  let notified = false;

  if (verdict.risk === "high") {
    alert = {
      id: newId("al"),
      ts: new Date().toISOString(),
      kind: "scam",
      severity: "high",
      title: verdict.scamTypeName || "Possible scam",
      explanation: verdict.explanationForFamily,
      eventIds: [event.id],
      txIds: [],
      cues: verdict.cues,
      guideKey: verdict.guideKey,
      status: "open",
      notified: [],
    };
    update((d) => d.alerts.unshift(alert));
  }

  if (alert || alwaysNotify) {
    const asked = input.source === "gmail" && alwaysNotify;
    const icon = verdict.risk === "high" ? "⚠️" : verdict.risk === "medium" ? "🟡" : "✅";
    const subject = asked
      ? `${elder} asked you to check an email: ${icon} ${verdict.risk === "low" ? "looks OK" : verdict.scamTypeName || "suspicious"}`
      : `${icon} KinGuard: ${verdict.scamTypeName || "possible scam"} on ${elder}'s computer`;
    const mail = await notifyFamily(db, {
      heading: asked ? `${elder} asked for a second opinion on an email` : `${verdict.scamTypeName || "Possible scam"} detected`,
      subject,
      explanation: verdict.explanationForFamily || verdict.explanationForElder || "KinGuard checked this email.",
      cues: verdict.cues,
      alertId: alert?.id,
      event,
      guideKey: verdict.guideKey,
    });
    notified = true;
    if (alert) {
      update((d) => {
        const a = d.alerts.find((x) => x.id === alert.id);
        if (a) a.notified.push({ to: mail.to, status: mail.status, ts: mail.ts });
      });
    }
  }

  const correlated = await checkCorrelation();

  return {
    risk: verdict.risk,
    score: verdict.score,
    scamTypeName: verdict.scamTypeName,
    cues: verdict.cues,
    hardRules: verdict.hardRules,
    stage: verdict.stage,
    guideKey: verdict.guideKey,
    lookalike: verdict.lookalike || null,
    explanationForElder: verdict.explanationForElder,
    explanationForFamily: verdict.explanationForFamily,
    aiUsed: verdict.aiUsed,
    aiError,
    eventId: event?.id || null,
    alertId: alert?.id || null,
    notified,
    familyName: db.family[0]?.name || "your family",
    correlatedAlertId: correlated?.id || null,
  };
}

/** Record a transaction (from the Simulate purchase buttons, or Plaid later). */
export async function recordTransaction(txInput) {
  const tx = {
    id: newId("tx"),
    ts: new Date().toISOString(),
    merchant: txInput.merchant,
    category: txInput.category,
    amount: Number(txInput.amount),
    newPayee: Boolean(txInput.newPayee),
  };
  const flag = flagTransaction(tx);
  if (flag) {
    tx.flagged = true;
    tx.flagReason = flag.reason;
    tx.flagSeverity = flag.severity;
  }
  update((db) => db.transactions.unshift(tx));

  if (flag) {
    const event = {
      id: newId("ev"),
      ts: tx.ts,
      source: "bank",
      type: "transaction_flag",
      title: `$${tx.amount.toFixed(2)} at ${tx.merchant}`,
      risk: flag.severity,
      scamTypeName: flag.reason,
      cues: [],
      txId: tx.id,
    };
    update((db) => db.events.unshift(event));

    // A crypto purchase is serious enough to alert on by itself.
    if (flag.severity === "high") {
      const db = load();
      const alert = {
        id: newId("al"),
        ts: tx.ts,
        kind: "money",
        severity: "high",
        title: "Crypto purchase detected",
        explanation: `${db.person.name} spent $${tx.amount.toFixed(2)} at ${tx.merchant}. Crypto payments are a favorite of scammers and are almost impossible to reverse.`,
        eventIds: [event.id],
        txIds: [tx.id],
        cues: [],
        guideKey: "payment",
        status: "open",
        notified: [],
      };
      update((d) => d.alerts.unshift(alert));
      const mail = await notifyFamily(db, {
        heading: alert.title,
        subject: `⚠️ KinGuard: $${tx.amount.toFixed(2)} crypto purchase by ${db.person.name}`,
        explanation: alert.explanation,
        cues: [],
        alertId: alert.id,
        event,
        extraFacts: [["Merchant", tx.merchant], ["Amount", `$${tx.amount.toFixed(2)}`]],
        guideKey: "payment",
      });
      update((d) => {
        const a = d.alerts.find((x) => x.id === alert.id);
        if (a) a.notified.push({ to: mail.to, status: mail.status, ts: mail.ts });
      });
    }
  }

  const correlated = await checkCorrelation();
  return { tx, correlatedAlertId: correlated?.id || null };
}

/**
 * The differentiator: link a scam warning and a risky payment that happen close together.
 * A rule decides when to alert; Gemini only writes the explanation.
 */
export async function checkCorrelation() {
  const db = load();
  const now = Date.now();
  const windowMs = CORRELATION_WINDOW_MIN * 60 * 1000;

  const scamEvents = db.events.filter(
    (e) => e.type === "scam_check" && RANK[e.risk] >= 1 && now - Date.parse(e.ts) <= windowMs
  );
  const flaggedTx = db.transactions.filter((t) => t.flagged && now - Date.parse(t.ts) <= windowMs);
  if (!scamEvents.length || !flaggedTx.length) return null;

  // Pick the newest payment and the strongest nearby scam event.
  const tx = flaggedTx[0];
  const event = [...scamEvents]
    .filter((e) => Math.abs(Date.parse(tx.ts) - Date.parse(e.ts)) <= windowMs)
    .sort((a, b) => RANK[b.risk] - RANK[a.risk] || Date.parse(b.ts) - Date.parse(a.ts))[0];
  if (!event) return null;

  const already = db.alerts.some((a) => a.kind === "correlated" && a.txIds.includes(tx.id) && a.eventIds.includes(event.id));
  if (already) return null;

  const minutes = Math.max(1, Math.round(Math.abs(Date.parse(tx.ts) - Date.parse(event.ts)) / 60000));
  const order = Date.parse(tx.ts) >= Date.parse(event.ts) ? "after" : "before";
  let title = "Possible scam in progress";
  let explanation = `${db.person.name} made a $${tx.amount.toFixed(2)} payment at ${tx.merchant} ${minutes} minute${minutes === 1 ? "" : "s"} ${order} KinGuard flagged a ${String(
    event.scamTypeName || "possible scam"
  ).toLowerCase()}. Together, these look like a scam in progress. Call ${db.person.name} now, before more money moves.`;

  if (geminiEnabled()) {
    try {
      const ai = await explainCorrelation({ elderName: db.person.name, event, tx, minutes });
      if (ai?.title) title = ai.title;
      if (ai?.explanation_for_family) explanation = ai.explanation_for_family;
    } catch (e) {
      console.warn("[KinGuard] Gemini correlation explanation failed:", e.message);
    }
  }

  const alert = {
    id: newId("al"),
    ts: new Date().toISOString(),
    kind: "correlated",
    severity: "high",
    title,
    explanation,
    eventIds: [event.id],
    txIds: [tx.id],
    cues: event.cues || [],
    guideKey: event.guideKey || "payment",
    minutesApart: minutes,
    status: "open",
    notified: [],
  };
  update((d) => {
    // The correlated alert supersedes the single-event alerts it links.
    d.alerts.forEach((a) => {
      if (a.status === "open" && a.kind !== "correlated" && (a.eventIds.includes(event.id) || a.txIds.includes(tx.id))) {
        a.status = "merged";
        a.mergedInto = alert.id;
      }
    });
    d.alerts.unshift(alert);
  });

  const mail = await notifyFamily(db, {
    heading: `🚨 ${title}`,
    subject: `🚨 KinGuard: ${db.person.name} may be in a scam right now`,
    explanation,
    cues: event.cues || [],
    alertId: alert.id,
    event,
    earlier: true,
    extraFacts: [
      ["Then the payment", `$${tx.amount.toFixed(2)} at ${tx.merchant} (${tx.flagReason}), ${timeOf(tx.ts)}`],
      ["Time between them", `${minutes} minute${minutes === 1 ? "" : "s"}`],
    ],
    skipIds: db.events.filter((e) => e.txId === tx.id).map((e) => e.id),
    guideKey: event.guideKey,
    askKey: "payment",
  });
  const calls = await alertFamilyByPhone({
    ...phoneSettings(db),
    text: `KinGuard: ${db.person.name} may be in a scam right now. $${tx.amount.toFixed(2)} at ${tx.merchant} right after a ${String(event.scamTypeName || "scam").toLowerCase()} warning${event.url ? ` on ${siteOf(event.url)}` : ""}. Call ${db.person.name} now. Details: ${process.env.DASHBOARD_URL || "http://localhost:3000"}`,
    say: `This is KinGuard. ${db.person.name} may be in a scam right now. A payment of ${Math.round(tx.amount)} dollars was made right after a scam warning. Please call ${db.person.name} now.`,
    alertId: alert.id,
  });
  update((d) => {
    const a = d.alerts.find((x) => x.id === alert.id);
    if (a) [mail, ...calls].forEach((m) => a.notified.push({ to: m.to, status: m.status, ts: m.ts, channel: m.channel || "email" }));
  });
  return alert;
}

/**
 * "Pause before you pay": the extension found a payment page (gift cards, crypto, wire, Zelle).
 * If a high-risk scam warning happened recently, pause the page and alert the family right away.
 */
export async function payAttempt({ url, title, kind, label }) {
  const db = load();
  const now = Date.now();
  const name = db.person.name;
  const familyName = db.family[0]?.name || "your family";
  const scam = db.events.find(
    (e) => e.type === "scam_check" && e.risk === "high" && now - Date.parse(e.ts) <= PAUSE_WINDOW_MIN * 60 * 1000
  );
  if (!scam) return { pause: false, familyName };

  const minutesAgo = Math.max(1, Math.round((now - Date.parse(scam.ts)) / 60000));
  const scamTypeName = scam.scamTypeName || "possible scam";
  const what = label || "making a payment";
  const base = { pause: true, minutesAgo, scamTypeName, label: what, familyName, guideKey: "payment" };
  const mins = `${minutesAgo} minute${minutesAgo === 1 ? "" : "s"}`;

  // Reloading the same payment page shouldn't alert the family again.
  const recent = db.alerts.find(
    (a) => a.kind === "pay_attempt" && a.eventIds.includes(scam.id) && a.url === url && now - Date.parse(a.ts) < 10 * 60 * 1000
  );
  if (recent) return { ...base, alertId: recent.id, notified: recent.notified.length > 0 };

  const ts = new Date().toISOString();
  const event = {
    id: newId("ev"),
    ts,
    source: "web",
    type: "payment_attempt",
    title: title || url || "Payment page",
    url: url || null,
    risk: "high",
    scamTypeName: `Paused: ${what}`,
    cues: [],
  };
  const alert = {
    id: newId("al"),
    ts,
    kind: "pay_attempt",
    severity: "high",
    title: `${name} may be about to pay a scammer`,
    explanation: `${name} opened a page for ${what} ${mins} after KinGuard warned about a ${scamTypeName.toLowerCase()}. KinGuard paused the page. Call ${name} now, before any money moves.`,
    eventIds: [scam.id, event.id],
    txIds: [],
    cues: scam.cues || [],
    guideKey: scam.guideKey || "payment",
    url: url || null,
    kindOfPayment: kind || null,
    decision: null,
    status: "open",
    notified: [],
  };
  update((d) => {
    d.events.unshift(event);
    d.alerts.unshift(alert);
  });

  const mail = await notifyFamily(db, {
    heading: `⏸️ ${alert.title}`,
    subject: `🚨 KinGuard: ${name} may be about to pay a scammer`,
    explanation: alert.explanation,
    cues: alert.cues,
    alertId: alert.id,
    event: scam,
    earlier: true,
    extraFacts: [
      ["Now", `${what}${url ? ` on ${siteOf(url) || url}` : ""}${title ? ` ("${title}")` : ""}`],
      ["Time between them", mins],
      ["KinGuard's action", `Paused the page and asked ${name} to check with family first`],
    ],
    skipIds: [event.id],
    guideKey: scam.guideKey,
    askKey: "payment",
  });
  const calls = await alertFamilyByPhone({
    ...phoneSettings(db),
    text: `KinGuard: ${name} may be about to pay a scammer (${what}${url ? ` on ${siteOf(url)}` : ""}, ${mins} after a ${scamTypeName.toLowerCase()} warning). Call ${name} now. Details: ${process.env.DASHBOARD_URL || "http://localhost:3000"}`,
    say: `This is KinGuard. ${name} may be about to pay a scammer. ${name} is ${what}, ${mins} after a scam warning. Please call ${name} now.`,
    alertId: alert.id,
  });
  update((d) => {
    const a = d.alerts.find((x) => x.id === alert.id);
    if (a) [mail, ...calls].forEach((m) => a.notified.push({ to: m.to, status: m.status, ts: m.ts, channel: m.channel || "email" }));
  });

  return { ...base, alertId: alert.id, notified: true };
}

/** What the person chose on a warning or pause screen: "closed" the page, "continued" anyway, or "trusted" it. */
export function recordDecision(alertId, decision) {
  return update((db) => {
    const a = db.alerts.find((x) => x.id === alertId);
    if (a) {
      a.decision = decision;
      a.decidedAt = new Date().toISOString();
    }
    return a || null;
  });
}
