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
    blackmail: {
      w: 3,
      label: "Threatening to expose you",
      re: /\b(recorded you (while|watching|doing)|(hacked|accessed|took over) your (webcam|camera|device|computer)|(intimate|embarrassing|compromising|explicit) (video|videos|photos?|pictures)|send (it|the video|them) to (all )?(of )?your (contacts|friends|family)|i (know|have) your password)\b/i,
    },
  };

  // Crypto ATM: no real business, agency or bank asks for this. Always high risk.
  const CRYPTO_ATM = /\b((bitcoin|btc|crypto(currency)?) ?(atm|kiosk|machine)|coin ?flip|coinme|bitcoin depot)\b/i;
  const ATM_ACTION = /\b((deposit|insert|feed|put|bring|take)\b.{0,40}\b(cash|money|bills)|scan\b.{0,20}\b(qr|code)|wallet address)\b/i;

  const PRESSURE = ["urgency", "fear", "secrecy", "authority", "tooGood", "bonding", "callNumber", "blackmail"];
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
    sextortion:
      "This is a common scam email sent to millions of people at once. They don't have any video of you, and you did nothing wrong. Don't reply and don't pay.",
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
    sextortion: "Blackmail email scam (sextortion)",
    generic: "Possible scam",
    suspicious: "Suspicious content",
  };

  // Plain-language guides for each scam type, with trusted sources (links checked October 2026).
  const FTC = "https://consumer.ftc.gov";
  const SRC = {
    ftcAvoid: { name: "FTC: How to avoid a scam", url: `${FTC}/articles/how-avoid-scam` },
    ftcPay: { name: "FTC: How someone asks you to pay can reveal a scam", url: `${FTC}/consumer-alerts/2026/07/way-spot-scams-how-someone-asks-you-pay` },
    ftcTech: { name: "FTC: Tech support scams", url: `${FTC}/articles/how-spot-avoid-and-report-tech-support-scams` },
    msTech: { name: "Microsoft: Protect yourself from tech support scams", url: "https://support.microsoft.com/en-us/windows/protect-yourself-from-tech-support-scams-2ebf91bd-f94c-2a8a-e541-f5c800d18435" },
    ftcGift: { name: "FTC: Gift card scams", url: `${FTC}/articles/avoiding-and-reporting-gift-card-scams` },
    ftcGov: { name: "FTC: Government impersonation scams", url: `${FTC}/articles/how-avoid-government-impersonation-scam` },
    ssa: { name: "Social Security (Office of the Inspector General): Scam awareness", url: "https://oig.ssa.gov/scam-awareness/" },
    irs: { name: "IRS: Recognize tax scams and fraud", url: "https://www.irs.gov/help/tax-scams/recognize-tax-scams-and-fraud" },
    ftcRomance: { name: "FTC: Romance scams", url: `${FTC}/articles/what-know-about-romance-scams` },
    ftcCrypto: { name: "FTC: Cryptocurrency scams", url: `${FTC}/articles/what-know-about-cryptocurrency-scams` },
    ftcPrize: { name: "FTC: Fake prize, sweepstakes, and lottery scams", url: `${FTC}/articles/fake-prize-sweepstakes-and-lottery-scams` },
    ftcApps: { name: "FTC: Avoiding scams on payment apps", url: `${FTC}/articles/mobile-payment-apps-how-avoid-scam-when-you-use-one` },
    zelle: { name: "Zelle: Payment safety", url: "https://www.zelle.com/digital-payment-education" },
    ftcGrand: { name: "FTC: Grandparent scams", url: `${FTC}/consumer-alerts/2021/04/dont-open-your-door-grandparent-scams` },
    ftcBlackmail: { name: "FTC: Scam emails demand Bitcoin and threaten blackmail", url: `${FTC}/consumer-alerts/2020/04/scam-emails-demand-bitcoin-threaten-blackmail` },
    cfpb: { name: "Consumer Financial Protection Bureau: Fraud and scams", url: "https://www.consumerfinance.gov/consumer-tools/fraud/" },
  };

  const GUIDES = {
    tech_support: {
      title: "Tech support scams",
      what: "A fake warning pops up saying your computer has a virus or has been hacked, often with an alarm sound or a page you can't close. It tells you to call a number. The person who answers pretends to be from Microsoft, Apple or a security company, asks to connect to your computer, and then charges you for a repair you never needed.",
      todo: [
        "Don't call the number. Microsoft, Apple and other real companies never put phone numbers in pop-up warnings.",
        "Close the page. If it won't close, restart the computer.",
        "Never let someone you don't know connect to your computer.",
      ],
      sources: [SRC.ftcTech, SRC.msTech],
    },
    crypto_atm: {
      title: "Crypto ATM scams",
      what: "Someone pretending to be from the government, your bank or a company tells you to take cash to a Bitcoin machine, often at a gas station or convenience store, and scan a code they send you. The money goes straight to the scammer and can almost never be recovered.",
      todo: [
        "No real government office, bank or business will ever ask you to pay at a crypto ATM.",
        "Hang up, then call the agency or bank using a number you look up yourself.",
      ],
      sources: [SRC.ftcCrypto, SRC.ftcPay],
    },
    investment: {
      title: "Fake investments and \"pig butchering\"",
      what: "A friendly stranger, often met through a \"wrong number\" text or social media, builds trust over weeks. Then they share an investment or crypto opportunity that seems to make big profits. The website showing your profits is fake, and when you try to take money out, you're told to pay a \"tax\" or \"fee\" first.",
      todo: [
        "Never invest because someone you've only met online recommends it.",
        "Guaranteed returns are a warning sign. Real investments always carry risk.",
        "Having to pay a fee to get your own money back means it's a scam. Don't pay more.",
      ],
      sources: [SRC.ftcCrypto, SRC.ftcRomance],
    },
    family_emergency: {
      title: "Grandparent and family emergency scams",
      what: "Someone calls or writes pretending to be a grandchild or relative in trouble (an arrest, an accident, a hospital) and begs you to send money fast and keep it secret. Scammers can find family names online and can even fake a loved one's voice.",
      todo: [
        "Hang up and call your family member directly, using the number you already have.",
        "Ask another relative to check the story before you send anything.",
        "Requests for gift cards, cash by courier or secrecy mean it's a scam.",
      ],
      sources: [SRC.ftcGrand, SRC.ftcGift],
    },
    prize: {
      title: "Fake prize and lottery scams",
      what: "You're told you won a prize, a lottery or a sweepstakes you don't remember entering, but you must pay a fee, taxes or shipping first, often with gift cards or a wire transfer.",
      todo: [
        "Real prizes are free. You never have to pay to collect one.",
        "Don't give out bank details or pay any fee.",
      ],
      sources: [SRC.ftcPrize, SRC.ftcGift],
    },
    romance: {
      title: "Romance and friendship scams",
      what: "Someone you met online quickly becomes very affectionate, but always has a reason they can't meet in person or video chat. Eventually there's an emergency, a travel cost or an investment, and they ask for money, gift cards or crypto.",
      todo: [
        "Never send money to someone you haven't met in person.",
        "Talk to a friend or family member about the relationship. Scammers often ask you to keep it private.",
      ],
      sources: [SRC.ftcRomance, SRC.ftcCrypto],
    },
    impersonation: {
      title: "Government and bank impersonation scams",
      what: "Someone claims to be from Social Security, the IRS, Medicare, the police or your bank's fraud department. They say there's a problem, like a suspended number, unpaid taxes or a hacked account, and that you must act now, keep it secret, or move your money to \"keep it safe.\"",
      todo: [
        "Government agencies don't demand payment by gift card, crypto, wire or payment app.",
        "Your bank will never ask you to move your money to protect it.",
        "Hang up and call the agency or bank yourself, using the number on their official website or your card.",
      ],
      sources: [SRC.ftcGov, SRC.ssa, SRC.irs],
    },
    payment_app: {
      title: "Payment app scams",
      what: "Scammers ask you to pay with Zelle, Cash App, Venmo or similar apps because the money moves instantly and works like cash. Once it's sent, it's usually gone for good, and these apps often can't reverse it.",
      todo: [
        "Only send money with these apps to people you know and trust in person.",
        "Be suspicious of anyone who asks you to \"send it to yourself\" or to a new recipient to fix a problem.",
      ],
      sources: [SRC.ftcApps, SRC.zelle],
    },
    platform_switch: {
      title: "Moving the conversation to another app",
      what: "Scammers often ask to move from a website, dating app or email to WhatsApp, Telegram or text messages. Those apps are harder to monitor, and it makes it harder for anyone to step in.",
      todo: [
        "Be cautious when a stranger is eager to move to a private app.",
        "Watch for the next steps: talk of money, investments or secrecy.",
      ],
      sources: [SRC.ftcRomance, SRC.ftcAvoid],
    },
    sextortion: {
      title: "Blackmail email scams (sextortion)",
      what: "An email claims someone hacked your webcam or computer and recorded you, and threatens to send an embarrassing video to your contacts unless you pay, usually in Bitcoin. Some include an old password from a past data breach to seem real. The same email is sent to millions of people. There is no video.",
      todo: [
        "Don't reply and don't pay. Paying only leads to more demands.",
        "If the email shows a real password, change that password anywhere you still use it.",
        "You did nothing wrong. It's fine, and smart, to tell someone you trust.",
      ],
      sources: [SRC.ftcBlackmail, SRC.ftcCrypto],
    },
    gift_cards: {
      title: "Gift card scams",
      what: "Scammers love gift cards because they're quick to buy and nearly impossible to trace or refund. They'll pretend to be a company, the government or a relative and ask you to buy cards and read them the numbers on the back.",
      todo: [
        "Anyone who asks you to pay with a gift card is a scammer.",
        "Never read gift card numbers to someone over the phone.",
      ],
      sources: [SRC.ftcGift, SRC.ftcPay],
    },
    payment: {
      title: "How scammers ask you to pay",
      what: "Scammers push for payments that are fast and hard to undo: gift cards, crypto, wire transfers and payment apps like Zelle. Once the money is sent, getting it back is very hard. That's why KinGuard pauses here after a scam warning.",
      todo: [
        "If someone told you to make this payment, especially someone you've never met in person, stop.",
        "If someone is on the phone telling you what to do, hang up.",
        "Call a family member or your bank, using a number you look up yourself.",
      ],
      sources: [SRC.ftcPay, SRC.ftcGift, SRC.cfpb],
    },
    generic: {
      title: "How to spot a scam",
      what: "Most scams use the same tricks: pretending to be someone you trust, creating a problem or a prize, rushing you, asking you to keep it secret, and asking for a payment that's hard to undo.",
      todo: [
        "Slow down. Real organizations give you time.",
        "Check by contacting the company or person directly, using a number you look up yourself.",
        "Talk to someone you trust before you pay or share anything.",
      ],
      sources: [SRC.ftcAvoid, SRC.ftcPay],
    },
  };

  // Where to get help, shown with every guide.
  const HELP = {
    text: "Already paid or shared information? Call your bank right away, then report it. AARP's free Fraud Watch Helpline can talk you through it: 877-908-3360.",
    links: [
      { name: "Report to the FTC (ReportFraud.ftc.gov)", url: "https://reportfraud.ftc.gov/" },
      { name: "Report online fraud to the FBI (IC3)", url: "https://www.ic3.gov/" },
      { name: "AARP Fraud Watch Helpline", url: "https://www.aarp.org/money/scams-fraud/helpline/" },
    ],
  };

  // Questions for the family member to ask, to find out how far things got.
  const FAMILY_ASK = {
    tech_support: ["Did you call the number on the screen?", "Did anyone connect to your computer or ask you to install a program?", "Did you pay anything, or share a card or bank number?"],
    crypto_atm: ["Did you go to a Bitcoin machine or put cash into one?", "Who told you to pay this way, and are they still calling?"],
    investment: ["How did you meet the person who suggested this investment?", "Have you already sent money, and how much?", "Have they asked for a fee or tax to withdraw?"],
    family_emergency: ["Who called, and what did they say happened?", "Did you send money, gift cards or cash with a courier?"],
    prize: ["Did you pay any fee or buy gift cards to collect the prize?", "Did you give out bank or Social Security numbers?"],
    romance: ["How long have you known this person, and have you met in person or on video?", "Have they asked you for money, gift cards or crypto?"],
    impersonation: ["Who did they say they were, and did they call you or did you call them?", "Did you move money, buy gift cards, or share account numbers or codes?"],
    payment_app: ["Who asked you to send the money, and have you met them in person?", "Did you already send it?"],
    platform_switch: ["Who is this person, and how did you meet them?", "Have they mentioned money or investing?"],
    sextortion: ["Did you reply or pay anything?", "Is the password in the email one you still use anywhere?"],
    gift_cards: ["Who asked you to buy the gift cards?", "Did you read the card numbers to anyone?"],
    payment: ["Is someone on the phone telling you to make this payment?", "Who asked you to pay, and how do you know them?", "Did the payment already go through?"],
    generic: ["What were you trying to do when the warning came up?", "Did you pay, call anyone, or share any personal information?"],
  };
  for (const [k, ask] of Object.entries(FAMILY_ASK)) GUIDES[k].ask = ask;

  // Plain-language reasons for the hard rules, for the family.
  const HARD_RULE_TEXT = {
    crypto_atm: "Asked to pay at a crypto ATM",
    secrecy_plus_money: "Asked for secrecy and money together",
    payment_app_plus_pressure: "Pressure to pay with a payment app",
    platform_switch_plus_money_or_pressure: "Moved to another app, plus money or pressure",
    account_takeover_pattern: "Asked for computer access or a code under pressure",
    blackmail_plus_payment: "Blackmail threat with a payment demand",
  };

  // Match a scam type name (including the AI's free-text names) to a guide.
  function guideFor(name) {
    const n = String(name || "").toLowerCase();
    if (!n) return null;
    if (GUIDES[n]) return n;
    if (/sextortion|blackmail/.test(n)) return "sextortion";
    if (/(crypto|bitcoin) ?atm|kiosk/.test(n)) return "crypto_atm";
    if (/tech|support|virus|pop-?up|computer/.test(n)) return "tech_support";
    if (/pig|invest|trading|profit/.test(n)) return "investment";
    if (/grand|family emergency|relative/.test(n)) return "family_emergency";
    if (/prize|lottery|sweepstake/.test(n)) return "prize";
    if (/romance|friendship|dating/.test(n)) return "romance";
    if (/gift ?card/.test(n)) return "gift_cards";
    if (/zelle|payment app|cash ?app|venmo/.test(n)) return "payment_app";
    if (/impersonat|government|irs|social security|medicare|bank|police/.test(n)) return "impersonation";
    if (/another app|telegram|whatsapp|platform/.test(n)) return "platform_switch";
    if (/crypto|bitcoin/.test(n)) return "investment";
    return null;
  }

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
    if (n("blackmail")) return "sextortion";
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
    // A blackmail threat plus a payment demand or a deadline is high risk.
    if (has(cues, ["blackmail"]) && (has(cues, MONEY) || has(cues, ["urgency", "secrecy"]))) {
      hardRules.push({ rule: "blackmail_plus_payment" });
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
      guideKey: scamType ? (GUIDES[scamType] ? scamType : "generic") : null,
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

  return { analyze, flagTransaction, paymentPage, guideFor, maxRisk, RANK, TYPE_NAMES, ELDER_TEXT, CUES, GUIDES, HELP, HARD_RULE_TEXT };
})();

if (typeof module !== "undefined" && module.exports) module.exports = KinGuardRules;
