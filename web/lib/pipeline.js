// The core: rules -> Gemini -> timeline -> alerts -> correlation -> family email.
import KinGuardRules from "./rules.cjs";
import { load, update, newId } from "./db.js";
import { analyzeWithGemini, explainCorrelation, geminiEnabled } from "./gemini.js";
import { buildAlertEmail, sendFamilyEmail } from "./email.js";

const { analyze, flagTransaction, maxRisk, RANK } = KinGuardRules;
const CORRELATION_WINDOW_MIN = 120;

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
  if (!ai) return { ...local, aiUsed: false, stage: local.stage || null };

  // AI can raise risk but never lower what the hard rules decided.
  const aiRisk = ["low", "medium", "high"].includes(ai.risk) ? ai.risk : "low";
  const risk = maxRisk(local.risk, aiRisk);

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
  update((d) => {
    const a = d.alerts.find((x) => x.id === alert.id);
    if (a) a.notified.push({ to: mail.to, status: mail.status, ts: mail.ts });
  });
  return alert;
}
