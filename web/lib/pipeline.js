// The core: rules -> Gemini -> timeline -> alerts -> correlation -> family email.
import KinGuardRules from "./rules.cjs";
import { load, update, newId } from "./db.js";
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
};

function mergeVerdicts(local, ai) {
  if (!ai) return { ...local, aiUsed: false, stage: local.stage || null, guideKey: local.guideKey || null };

  // AI can raise risk. It can clear a mild (medium) warning that no hard rule triggered,
  // such as pushy ad wording on a normal page, but never lower a high-risk verdict.
  const aiRisk = ["low", "medium", "high"].includes(ai.risk) ? ai.risk : "low";
  const aiCanClear = local.risk === "medium" && !local.hardRules.length && aiRisk === "low";
  const risk = aiCanClear ? "low" : maxRisk(local.risk, aiRisk);

  const seen = new Set(local.cues.map((c) => LOCAL_TO_AI[c.cue] || c.cue));
  const extra = (ai.cues || [])
    .filter((c) => c && c.cue && !seen.has(c.cue))
    .map((c) => ({ cue: c.cue, label: AI_CUE_LABELS[c.cue] || c.cue.replace(/_/g, " "), quote: String(c.quote || "").slice(0, 120), fromAI: true }));

  const aiType = ai.scam_type && ai.scam_type !== "none" ? ai.scam_type : null;
  const typeName = aiType ? aiType.charAt(0).toUpperCase() + aiType.slice(1) : local.scamTypeName;

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

async function notifyFamily(db, { heading, subject, explanation, cues, details, alertId }) {
  const member = db.family[0];
  const to = process.env.FAMILY_EMAIL || member?.email;
  const { html, text } = buildAlertEmail({ elderName: db.person.name, heading, explanation, cues, details });
  return sendFamilyEmail({ to, subject, html, text, alertId });
}

/**
 * Analyze content from the extension, the Gmail Scrutinize button, or the dashboard.
 * input: { source: 'web'|'gmail'|'paste', text, url, title, sender, subject }
 */
export async function analyzeContent(input, { forceAI = false, alwaysNotify = false } = {}) {
  const db0 = load();
  const local = analyze(input.text);

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

  const shouldSave = verdict.risk !== "low" || input.source !== "web";
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
      excerpt: String(input.text || "").slice(0, 400),
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
    const details = [];
    if (input.source === "gmail") details.push(`Email from: ${input.sender || "unknown"}`, `Subject: ${input.subject || "(none)"}`);
    if (input.source === "web" && input.url) details.push(`Page: ${input.url}`);
    details.push(`Risk: ${verdict.risk}`);

    const mail = await notifyFamily(db, {
      heading: asked ? `${elder} asked for a second opinion on an email` : `${verdict.scamTypeName || "Possible scam"} detected`,
      subject,
      explanation: verdict.explanationForFamily || verdict.explanationForElder || "KinGuard checked this email.",
      cues: verdict.cues,
      details,
      alertId: alert?.id,
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
        details: [`Merchant: ${tx.merchant}`, `Amount: $${tx.amount.toFixed(2)}`],
        alertId: alert.id,
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
    details: [
      `Warning: ${event.scamTypeName || "possible scam"} (${event.source === "gmail" ? "email" : "web page"}: ${event.title})`,
      `Payment: $${tx.amount.toFixed(2)} at ${tx.merchant}`,
      `Time between them: ${minutes} minutes`,
    ],
    alertId: alert.id,
  });
  const calls = await alertFamilyByPhone({
    text: `KinGuard: ${db.person.name} may be in a scam right now. $${tx.amount.toFixed(2)} at ${tx.merchant} right after a ${String(event.scamTypeName || "scam").toLowerCase()} warning. Call ${db.person.name} now.`,
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
    details: [`Earlier warning: ${scamTypeName} (${scam.title})`, `Now: ${what}${url ? ` at ${url}` : ""}`, `Time between them: ${mins}`],
    alertId: alert.id,
  });
  const calls = await alertFamilyByPhone({
    text: `KinGuard: ${name} may be about to pay a scammer (${what}, ${mins} after a ${scamTypeName.toLowerCase()} warning). Call ${name} now.`,
    say: `This is KinGuard. ${name} may be about to pay a scammer. ${name} is ${what}, ${mins} after a scam warning. Please call ${name} now.`,
    alertId: alert.id,
  });
  update((d) => {
    const a = d.alerts.find((x) => x.id === alert.id);
    if (a) [mail, ...calls].forEach((m) => a.notified.push({ to: m.to, status: m.status, ts: m.ts, channel: m.channel || "email" }));
  });

  return { ...base, alertId: alert.id, notified: true };
}

/** What the person chose on the pause screen: "closed" the page or "continued" anyway. */
export function recordPayDecision(alertId, decision) {
  return update((db) => {
    const a = db.alerts.find((x) => x.id === alertId && x.kind === "pay_attempt");
    if (a) {
      a.decision = decision;
      a.decidedAt = new Date().toISOString();
    }
    return a || null;
  });
}
