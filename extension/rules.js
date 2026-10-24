/*
 * KinGuard scam rules: shared by the browser extension and the backend.
 * This file is the single source of truth. The backend copies it to
 * web/lib/rules.cjs (npm run sync-rules runs automatically before dev/build).
 *
 * Hard rules here can never be lowered by the AI. The AI can only raise risk.
 */
const KinGuardRules = (() => {
  // Each cue is a social engineering tactic. w = weight added to the score.
  const CUES = {
    urgency: {
      w: 2,
      label: "Rushing you",
      re: /\b(urgent(ly)?|immediately|right away|act now|within \d+\s*(minutes?|hours?)|today only|expires? (today|tonight)|final (notice|warning)|last chance)\b/i,
    },
    authority: {
      w: 2,
      label: "Pretending to be an authority",
      re: /\b(tech(nical)? support|support (team|center|department)|fraud (department|team)|irs|social security|medicare|police|sheriff|federal agent|tax (office|bureau)|government (agency|office)|bank security)\b/i,
    },
    fear: {
      w: 2,
      label: "Scaring you",
      re: /\b(virus(es)?|infected|hacked|compromised|arrest(ed)?|warrant|suspended|frozen|locked|legal action|lawsuit|jail)\b/i,
    },
    secrecy: {
      w: 3,
      label: "Asking you to keep it secret",
      re: /((don'?t|do not) (tell|contact|call) (anyone|your (bank|family|kids|children))|keep (this|it) (secret|private|between us)|do not (hang up|close this (window|page))|confidential)/i,
    },
    untraceable: {
      w: 2,
      label: "Untraceable payment",
      re: /\b(gift ?cards?|bitcoin|crypto(currency)?|wire transfer|western union|moneygram|send (it|the money) to yourself)\b/i,
    },
    paymentApp: {
      w: 3,
      label: "Asking for a payment app transfer",
      re: /(\b(pay|send|transfer)\b.{0,30}\b(zelle|cash ?app|venmo|apple cash)\b|\b(zelle|cash ?app|venmo)\b.{0,15}\b(me|us|the money|the payment)\b)/i,
    },
    platformSwitch: {
      w: 3,
      label: "Moving you to another app",
      re: /\b(move|switch|continue|talk|chat|message|text|add)( me| us| this)?( over)? (on|to|via) (telegram|whatsapp|signal|wechat|viber|kik)\b/i,
    },
    remoteAccess: {
      w: 3,
      label: "Asking to control your computer",
      re: /\b(anydesk|teamviewer|ultraviewer|remote (access|desktop|support session)|let (me|us) (connect|access) (to )?your (computer|screen|device))\b/i,
    },
    codeRequest: {
      w: 3,
      label: "Asking for a code or password",
      re: /(\b(read|tell|give) (me|us) (the|your) (code|pin|password|passcode)\b|verification code (we|that we) (sent|texted))/i,
    },
    tooGood: {
      w: 1,
      label: "Too good to be true",
      re: /\b(you('ve| have)? won|prize|inheritance|guaranteed (returns?|profits?)|risk[- ]free|double your money)\b/i,
    },
    bonding: {
      w: 1,
      label: "Fast emotional closeness",
      re: /\b(my love|my dear|soul ?mate|never felt this way|meant to be|trust me)\b/i,
    },
    overpayment: {
      w: 3,
      label: "Fake refund or overpayment",
      re: /\b(refunded too much|overpaid|over-?payment|send (back )?the difference)\b/i,
    },
    feeToWithdraw: {
      w: 3,
      label: "Fee to get your own money",
      re: /\b(tax|fee|deposit) (to|before you can|in order to) (withdraw|release|unlock|claim)\b/i,
    },
    callNumber: {
      w: 2,
      label: "Pushing you to call a number",
      re: /\bcall\b[\s\S]{0,60}?(\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/i,
    },
  };

  // Crypto ATM: no real business, agency or bank asks for this. Always high risk.
  const CRYPTO_ATM = /\b((bitcoin|btc|crypto(currency)?) ?(atm|kiosk|machine)|coin ?flip|coinme|bitcoin depot)\b/i;
  const ATM_ACTION = /\b((deposit|insert|feed|put|bring|take)\b.{0,40}\b(cash|money|bills)|scan\b.{0,20}\b(qr|code)|wallet address)\b/i;

  const PRESSURE = ["urgency", "fear", "secrecy", "authority", "tooGood", "bonding", "callNumber"];
  const MONEY = ["untraceable", "paymentApp", "feeToWithdraw", "overpayment"];

  const ELDER_TEXT = {
    crypto_atm:
      "Stop. No real company, bank, or government office will ever ask you to pay with a crypto ATM. This is a scam. Do not put any money in.",
    tech_support:
      "This is a fake warning. Real computer companies never show pop-ups asking you to call them or pay. Close this page. Your computer is fine.",
    investment:
      "This looks like a fake investment. Real investments never promise guaranteed profits or make you pay a fee to take out your own money.",
    family_emergency:
      "Scammers pretend to be a grandchild in trouble. Hang up and call your grandchild or another family member directly before sending anything.",
    prize:
      "Real prizes never make you pay a fee or buy gift cards to collect. This is a scam. Don't pay anything.",
    romance:
      "Be careful. Scammers often build a friendship or romance first, then ask for money or crypto. Talk to family before sending anything.",
    impersonation:
      "This message pretends to be an official office. Real government offices and banks never demand gift cards, crypto, or secrecy.",
    payment_app:
      "Be careful. Money sent with apps like Zelle or Cash App is like cash. Once it's sent, it's usually gone for good.",
    platform_switch:
      "Be careful. Scammers often ask to move the conversation to another app, where it's harder to catch them.",
    generic:
      "This uses pressure tricks that scammers use. Don't pay, call, or share anything yet. Check with your family first.",
    suspicious:
      "Something here looks a little suspicious. Take your time, and check with family before you act.",
  };

  const TYPE_NAMES = {
    crypto_atm: "Crypto ATM scam",
    tech_support: "Tech support scam",
    investment: "Fake investment (possible pig butchering)",
    family_emergency: "Grandparent scam (fake family emergency)",
    prize: "Fake prize or lottery",
    romance: "Romance or friendship scam",
    impersonation: "Government or bank impersonation",
    payment_app: "Payment app scam",
    platform_switch: "Move to another app",
    generic: "Possible scam",
    suspicious: "Suspicious content",
  };

  function has(cues, names) {
    return cues.some((c) => names.includes(c.cue));
  }

  const FAMILY_EMERGENCY = /\b(grandpa|grandma|grandson|granddaughter|it'?s me)\b[\s\S]{0,200}\b(jail|bail|arrested|car accident|hospital|lawyer)\b/i;
  const COMPUTER_THREAT = /\b(virus(es)?|infected|hacked|malware|trojan|spyware|computer (is|has been) locked)\b/i;
  const PRIZE = /\b(you('ve| have)? won|prize|lottery|sweepstakes|inheritance)\b/i;
  const INVEST = /\b(guaranteed (returns?|profits?)|double your money|crypto trading|trading (platform|cycle)|portfolio|profit)\b/i;

  function guessType(cues, hardRules, text) {
    const n = (x) => cues.some((c) => c.cue === x);
    if (hardRules.some((r) => r.rule === "crypto_atm")) return "crypto_atm";
    if (FAMILY_EMERGENCY.test(text)) return "family_emergency";
    if (n("remoteAccess") || (COMPUTER_THREAT.test(text) && (n("callNumber") || n("authority")))) return "tech_support";
    if (n("feeToWithdraw") || INVEST.test(text)) return "investment";
    if (PRIZE.test(text)) return "prize";
    if (n("bonding")) return "romance";
    if (n("authority") && has(cues, MONEY)) return "impersonation";
    if (n("paymentApp")) return "payment_app";
    if (n("platformSwitch")) return "platform_switch";
    return "generic";
  }

  function analyze(text) {
    const t = String(text || "").slice(0, 20000);
    const cues = [];
    let score = 0;

    for (const [name, c] of Object.entries(CUES)) {
      const m = t.match(c.re);
      if (m) {
        cues.push({ cue: name, label: c.label, quote: m[0].trim().slice(0, 120) });
        score += c.w;
      }
    }

    const hardRules = [];
    const atm = t.match(CRYPTO_ATM);
    if (atm && ATM_ACTION.test(t)) {
      hardRules.push({ rule: "crypto_atm", quote: atm[0] });
      if (!cues.some((c) => c.cue === "cryptoAtm")) {
        cues.unshift({ cue: "cryptoAtm", label: "Crypto ATM payment", quote: atm[0] });
      }
    }
    // Moving to another app becomes high risk when money or pressure shows up too.
    if (has(cues, ["platformSwitch"]) && (has(cues, MONEY) || has(cues, ["urgency", "secrecy", "bonding", "tooGood"]))) {
      hardRules.push({ rule: "platform_switch_plus_money_or_pressure" });
    }
    // A payment app request plus pressure is high risk.
    if (has(cues, ["paymentApp"]) && has(cues, PRESSURE)) {
      hardRules.push({ rule: "payment_app_plus_pressure" });
    }
    // Secrecy plus any money request is high risk.
    if (has(cues, ["secrecy"]) && has(cues, MONEY)) {
      hardRules.push({ rule: "secrecy_plus_money" });
    }
    // Remote access or a code request plus any pressure is high risk.
    if (has(cues, ["remoteAccess", "codeRequest"]) && has(cues, PRESSURE)) {
      hardRules.push({ rule: "account_takeover_pattern" });
    }

    let risk = "low";
    if (hardRules.length || score >= 7 || (cues.length >= 3 && has(cues, MONEY))) risk = "high";
    else if (score >= 3) risk = "medium";

    const scamType = risk === "low" ? null : risk === "medium" && !hardRules.length ? guessMedium(cues) : guessType(cues, hardRules, t);

    return {
      risk,
      score,
      cues,
      hardRules,
      scamType,
      stage: ["investment", "romance", "platform_switch"].includes(scamType) ? pigButcheringStage(cues, t) : null,
      scamTypeName: scamType ? TYPE_NAMES[scamType] : null,
      explanationForElder: scamType ? ELDER_TEXT[scamType] : "",
      explanationForFamily: scamType
        ? `${TYPE_NAMES[scamType]}. Warning signs: ${cues.map((c) => c.label.toLowerCase()).join(", ")}.`
        : "",
    };
  }

  // Pig butchering stages: 1 friendly stranger, 2 trust or romance, 3 investment pitch, 4 pressure to pay.
  function pigButcheringStage(cues, text) {
    const n = (x) => cues.some((c) => c.cue === x);
    if (n("feeToWithdraw") || (INVEST.test(text) && (n("urgency") || n("secrecy")))) return 4;
    if (INVEST.test(text) || (n("untraceable") && n("tooGood"))) return 3;
    if (n("bonding") || n("platformSwitch")) return 2;
    if (/\b(wrong number|sorry,? (who is this|is this)|do i know you)\b/i.test(text)) return 1;
    return null;
  }

  function guessMedium(cues) {
    if (has(cues, ["platformSwitch"])) return "platform_switch";
    if (has(cues, ["paymentApp"])) return "payment_app";
    return "suspicious";
  }

  // Bank-side rule: which transactions look like scam payments?
  function flagTransaction(tx) {
    const m = `${tx.merchant || ""} ${tx.category || ""} ${tx.note || ""}`;
    if (/bitcoin|crypto|coin ?flip|coinme|bitcoin depot/i.test(m)) return { reason: "Crypto purchase or crypto ATM", severity: "high" };
    if (/gift ?card/i.test(m)) return { reason: "Gift card purchase", severity: "medium" };
    if (/wire|western union|moneygram/i.test(m)) return { reason: "Wire transfer", severity: "medium" };
    if (/zelle|cash ?app|venmo/i.test(m) && tx.newPayee) return { reason: "Payment app transfer to a new payee", severity: "medium" };
    if (Number(tx.amount) >= 1000) return { reason: "Unusually large amount", severity: "medium" };
    return null;
  }

  // Payment pages: where scam victims end up paying. Not a scam by themselves,
  // but after a recent scam warning they trigger "Pause before you pay".
  const PAY_KINDS = [
    ["crypto", "buying crypto", /(\b(buy|purchase|send)\b.{0,30}\b(bitcoin|btc|crypto(currency)?|usdt|ethereum)\b|\b(bitcoin|crypto) (atm|kiosk)\b)/i],
    ["gift_cards", "buying gift cards", /\bgift ?cards?\b/i],
    ["payment_app", "sending money with a payment app", /\b(zelle|cash ?app|venmo|apple cash)\b/i],
    ["wire", "sending a wire transfer", /\b(wire transfer|western union|moneygram|send a wire)\b/i],
  ];
  const PAY_ACTION = /\b(add to (cart|bag)|buy now|check ?out|purchase|place (your )?order|send money|send payment|pay now|confirm (payment|transfer)|transfer (money|funds)|recipient|payee)\b/i;

  function paymentPage(text, url) {
    const t = `${url || ""} ${String(text || "").slice(0, 20000)}`;
    if (!PAY_ACTION.test(t)) return null;
    for (const [kind, label, re] of PAY_KINDS) {
      if (re.test(t)) return { kind, label };
    }
    return null;
  }

  const RANK = { low: 0, medium: 1, high: 2 };
  function maxRisk(a, b) {
    return (RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b;
  }

  return { analyze, flagTransaction, paymentPage, maxRisk, RANK, TYPE_NAMES, ELDER_TEXT, CUES };
})();

if (typeof module !== "undefined" && module.exports) module.exports = KinGuardRules;
