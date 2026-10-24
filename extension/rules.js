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
      re: /\b(urgent(ly)?|immediately|right away|act now|within \d+\s*(minutes?|hours?)|today only|expires? (today|tonight)|final (notice|warning)|last chance|unless you (sign|log|verify|confirm|act|respond|pay|update|call))\b/i,
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
      re: /(\b(read|tell|give) (me|us) (the|your) (code|pin|password|passcode)\b|verification code (we|that we) (sent|texted)|\b(reply|respond|text back) with the (security |verification |one-time |6-digit )?code|\bshare (the|your) (security |verification |one-time )?code)/i,
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
    // Weights stay low so one phrase on a normal page or email isn't enough to warn.
    accountPhish: {
      w: 2,
      label: "Pressure to sign in or verify your account",
      re: /\b(verify your (account|identity|information|details)|confirm your (account|identity|billing|payment|bank)|(sign|log) ?in (now |here )?to (keep|restore|avoid|unlock|verify|reactivate|prevent)|update your (billing|payment) (info|information|details|method)|account (will be|has been|is) (permanently )?(suspended|deleted|disabled|deactivated|closed|terminated|locked|on hold)|(unusual|suspicious) (sign-?in|login|activity)|password (expires|will expire|has expired)|keep (your )?(current|same) password|mailbox (is )?(full|over (its )?quota)|storage (is )?(full|almost full)|(files|photos|documents) will be (deleted|lost|removed)|email (will be|is being) (disabled|deactivated))\b/i,
    },
    fakeCharge: {
      w: 2,
      label: "A charge, renewal or refund you didn't expect",
      re: /\b((subscription|membership|plan|protection|antivirus|order|purchase) (has been |was |is )?(renewed|auto-?renewed|charged|confirmed|processed)|you('ve| have) been (charged|billed)|if you did ?n[o’']?t (make|authorize|place|recognize|order) (this|the|it)|to (cancel|dispute|stop)( this| the| your)?( order| charge| renewal| subscription| payment| transaction)?,? (please )?call|refund of \$?[\d,]+|your refund (is ready|has been approved|is pending)|payment (failed|declined|was unsuccessful|could not be processed)|(past due|overdue) (invoice|balance|payment|bill)|payment is (overdue|past due)|you('ve| have) received an invoice)\b/i,
    },
    legalThreat: {
      w: 2,
      label: "Legal, tax, toll or debt threat",
      re: /\b(warrant (has been |will be )?issued|arrest warrant|court (summons|date|appearance)|summons|lawsuit (has been|will be) filed|(toll|traffic|parking) (violation|fine|ticket|charges?)|unpaid tolls?|debt collect(ion|or)|outstanding (debt|balance)|final (notice|demand|reminder)|(social security|ssn) (number )?(has been |is )?suspended)\b/i,
    },
    jobOffer: {
      w: 2,
      label: "A job, school or money offer that's too easy",
      re: /\b((remote|work[- ]from[- ]home|online) (position|job|role|opportunity)|selected for (a|the|this) (position|role|job)|without (an )?interview|no (interview|experience) (needed|required)|deposit (this|the) check|approved vendor|purchase (your )?(equipment|work computer|laptop) from|earn \$?[\d,]+ (a|per|each) (day|hour|week)|rat(e|ing) products|(task|order) (completion|platform)|unlock your (earnings|commission)|starter (fee|package)|(loan|debt) (forgiveness|cancellation)|you('ve| have) (won|been awarded) a scholarship)\b/i,
    },
    upfrontFee: {
      w: 2,
      label: "Pay a fee first to get something",
      re: /\b((processing|release|clearance|onboarding|activation|starter|insurance|legal|customs|redelivery|unlock(ing)?|claim) fees?|pay (a|the) (small )?fee (to|before)|deposit \$?[\d,]+ to (unlock|withdraw|activate|release|access)|fee (to|before you can) (claim|receive|release|unlock|get|collect))\b/i,
    },
    dangerousFile: {
      w: 2,
      label: "Pushing you to open a file, link or code",
      re: /\b(open the attached|see (the )?attached (invoice|document|file|receipt|statement|contract)|shared an? (confidential |secure |important )?(file|document|folder) with you|(e-?signature|signature) (is )?(required|requested|needed)|review and sign|scan (this|the) (qr )?code to|(prove|verify|confirm) (that )?you('re| are) (a )?human|download (the|this) (update|attachment|document))\b/i,
    },
    paymentRedirect: {
      w: 3,
      label: "Changing where money goes",
      re: /\b((bank(ing)?|account|payment|wire) (details|information|instructions) (have|has) (been )?changed|(new|updated) (bank(ing)?|remittance|wire) (details|information|instructions)|use (this|the|our) new account|(update|change) (your|my|the) direct deposit|(w-?2s?|tax forms) (for|of) (all )?(employees|staff)|send me (the )?(employees'?|staff) (tax|personal) (forms|details|information))\b/i,
    },
    bossRequest: {
      w: 2,
      label: "Urgent favor from a boss or coworker",
      re: /\b(i('m| am) (in a meeting|tied up|traveling)|are you (available|at your desk)|quick favou?r|buy (some )?gift cards for|send me the (codes|card numbers|pictures of the cards))\b/i,
    },
    charityPressure: {
      w: 1,
      label: "Pressure to donate",
      re: /\b(donate (now|today|immediately)|(disaster|hurricane|earthquake|wildfire|flood) (relief|victims)|(double|match|triple) (your|every) (donation|contribution|gift)|matching (gift|donation))\b/i,
    },
    recoveryOffer: {
      w: 2,
      label: "Promise to recover lost money",
      re: /\b(recover (your )?(lost|stolen|scammed) (money|funds|crypto|bitcoin)|(fund|funds|asset|crypto) recovery (service|specialist|agent|team))\b/i,
    },
    depositFirst: {
      w: 3,
      label: "Deposit before you can see it",
      re: /\b((deposit|pay) (before|to) (viewing|seeing|see|reserve|hold)|deposit to (hold|reserve)|reserve (your|the) (puppy|kitten|pet|apartment|unit)|(designer|luxury) [\w ]{0,20}(9\d|8\d)% off)\b/i,
    },
  };

  // Fake CAPTCHA: "prove you're human" pages that tell you to press Windows+R and paste a command. Always high risk.
  const RUN_COMMAND = /((press|hold)\s+(the\s+)?(windows|win|⊞)(\s*key)?\s*\+\s*r\b|\b(ctrl|control)\s*\+\s*v\b[\s\S]{0,120}\b(enter|run)\b|\b(powershell|cmd\.exe|mshta|run dialog)\b)/i;
  const HUMAN_CHECK = /\b(captcha|i('m| am) not a robot|(prove|verify|confirm) (that )?you('re| are) (a )?human|human verification)\b/i;
  const FAKE_CHECK = /\bdeposit (this|the) check\b[\s\S]{0,250}\b(vendor|send|buy|purchase|return|wire|zelle|gift)\b/i;
  const FEE_FOR_MONEY = /\b(prize|won|winner|inheritance|inherited|estate|grant|loan|scholarship|refund|settlement|payout|earnings|commission|reward|forgiveness)\b/i;

  // Crypto ATM: no real business, agency or bank asks for this. Always high risk.
  const CRYPTO_ATM = /\b((bitcoin|btc|crypto(currency)?) ?(atm|kiosk|machine)|coin ?flip|coinme|bitcoin depot)\b/i;
  const ATM_ACTION = /\b((deposit|insert|feed|put|bring|take)\b.{0,40}\b(cash|money|bills)|scan\b.{0,20}\b(qr|code)|wallet address)\b/i;

  const PRESSURE = ["urgency", "fear", "secrecy", "authority", "tooGood", "bonding", "callNumber", "blackmail"];
  const MONEY = ["untraceable", "paymentApp", "feeToWithdraw", "overpayment", "upfrontFee", "paymentRedirect"];

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
    phishing:
      "This looks like a fake account or security message made to steal your password, codes or card. Don't click its links or reply. Open the company's app or type its website address yourself.",
    fake_charge:
      "Scammers send fake bills, renewals and refunds so you'll call them or share card details. Don't call the number in the message. Check your account on the company's real website.",
    legal_threat:
      "Real courts, agencies, toll roads and debt collectors don't threaten arrest or demand instant payment by email or text. Don't pay or click. Look up their number yourself.",
    job_scam:
      "Real employers and schools don't hire without an interview, send checks to buy equipment, or charge fees so you can get paid, win a scholarship or have a loan forgiven.",
    advance_fee:
      "You should never have to pay a fee to receive money, whether it's a prize, inheritance, loan, grant, refund or recovered funds. This is a common scam.",
    malicious_file:
      "This is trying to get you to open a file, sign something, scan a code or run a command. Don't. Real websites never ask you to press keys or paste anything to prove you're human.",
    business_payment:
      "Scammers pretend to be a boss, coworker or supplier to redirect payments or get gift cards. Check by calling the person at a number you already know before you do anything.",
    charity:
      "Give to charities you already know, through their own website. Be wary of pressure to donate right now, especially by gift card, crypto or wire.",
    shopping:
      "Be careful paying deposits for things you haven't seen, and for prices that seem too good to be true. Fake stores, rentals and sellers are common.",
    typosquat:
      "This website's address looks like a well-known company's, but it isn't theirs. Scammers make lookalike sites to steal passwords and card numbers.",
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
    phishing: "Fake account or security alert",
    fake_charge: "Fake bill, renewal or refund",
    legal_threat: "Fake legal, tax, toll or debt threat",
    job_scam: "Fake job, school or student offer",
    advance_fee: "Pay-a-fee-first scam",
    malicious_file: "Dangerous file, link or fake verification",
    business_payment: "Boss or vendor payment scam",
    charity: "Fake charity appeal",
    shopping: "Fake store, rental or seller",
    typosquat: "Lookalike website address",
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
    ftcPhish: { name: "FTC: How to recognize and avoid phishing scams", url: `${FTC}/articles/how-recognize-avoid-phishing-scams` },
    cisaPhish: { name: "CISA (U.S. cybersecurity agency): Recognize and report phishing", url: "https://www.cisa.gov/secure-our-world/recognize-and-report-phishing" },
    ftcAmazon: { name: "FTC: Amazon impersonators", url: `${FTC}/consumer-alerts/2021/10/amazon-impersonators-what-you-need-know` },
    ftcInvoice: { name: "FTC: Phishers send fake invoices", url: `${FTC}/consumer-alerts/2018/02/phishers-send-fake-invoices` },
    ftcRefund: { name: "FTC: Refund and recovery scams", url: `${FTC}/articles/refund-and-recovery-scams` },
    ftcTolls: { name: "FTC: Texts about unpaid tolls are probably scams", url: `${FTC}/consumer-alerts/2025/01/got-text-about-unpaid-tolls-its-probably-scam` },
    ftcDebt: { name: "FTC: Fake and abusive debt collectors", url: `${FTC}/articles/fake-abusive-debt-collectors` },
    ftcJobs: { name: "FTC: Job scams", url: `${FTC}/articles/job-scams` },
    ftcChecks: { name: "FTC: Fake check scams", url: `${FTC}/consumer-alerts/2020/02/ftc-bottom-line-fake-checks-scams` },
    ftcScholar: { name: "FTC: Scholarship and financial aid scams", url: `${FTC}/articles/how-avoid-scholarship-and-financial-aid-scams` },
    ftcLoans: { name: "FTC: Student loan forgiveness scams", url: `${FTC}/consumer-alerts/2024/04/scammers-follow-news-about-student-loan-forgiveness` },
    ftcAdvance: { name: "FTC: Advance-fee loans", url: `${FTC}/articles/what-know-about-advance-fee-loans` },
    ftcGrant: { name: "FTC: Government grant scams", url: `${FTC}/articles/government-grant-scams` },
    ftcCaptcha: { name: "FTC: How to spot a CAPTCHA scam", url: `${FTC}/consumer-alerts/2026/06/how-spot-captcha-scam` },
    ftcQr: { name: "FTC: QR code scams", url: `${FTC}/consumer-alerts/2025/01/scam-alert-qr-code-unexpected-package` },
    ic3Bec: { name: "FBI IC3: Business email compromise", url: "https://www.ic3.gov/CrimeInfo/BEC" },
    ftcBizBills: { name: "FTC: Pay your bills, not scammers (small business)", url: `${FTC}/consumer-alerts/2026/05/run-small-business-pay-your-bills-not-scammers` },
    ftcCharity: { name: "FTC: Give to a charity, not a scam", url: `${FTC}/consumer-alerts/2024/11/give-charity-not-scam` },
    ftcShop: { name: "FTC: Online shopping", url: `${FTC}/articles/online-shopping` },
    ftcRental: { name: "FTC: Rental listing scams", url: `${FTC}/articles/rental-listing-scams` },
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
    phishing: {
      title: "Fake account and security alerts (phishing)",
      what: "Messages that look like they're from Amazon, your bank, Microsoft or your email provider claim your account will be suspended, a password is expiring, your mailbox is full, or there was a suspicious sign-in. The link leads to a fake sign-in page that steals your password, codes or card number.",
      todo: [
        "Don't click links in the message. Open the company's app, or type its website address yourself.",
        "Never share a one-time code from a text or email with anyone. Real companies never ask for it.",
        "If you already signed in through the link, change that password now.",
      ],
      sources: [SRC.ftcPhish, SRC.cisaPhish, SRC.ftcAmazon],
    },
    fake_charge: {
      title: "Fake bills, renewals and refunds",
      what: "A message says you were charged for antivirus, a laptop or a subscription, that a payment failed, or that a refund is waiting. The goal is to get you to call their number or \"update\" your card. On the phone they may ask to connect to your computer to \"process a refund.\"",
      todo: [
        "Don't call the number in the message. Check the charge by signing in to the real account, or by calling the number on your card.",
        "Never let someone connect to your computer to give you a refund.",
      ],
      sources: [SRC.ftcInvoice, SRC.ftcRefund, SRC.ftcTech],
    },
    legal_threat: {
      title: "Fake legal, tax, toll and debt threats",
      what: "Messages claim you owe taxes, tolls, a traffic fine or a debt, that a court summons is waiting, or that your Social Security number is suspended. They threaten arrest or penalties unless you pay right away, often through a link or with gift cards.",
      todo: [
        "Courts, the IRS, Social Security and toll agencies don't threaten arrest or demand instant payment by text or email.",
        "Don't click the link. Look up the agency yourself and check your account there.",
      ],
      sources: [SRC.ftcGov, SRC.ftcTolls, SRC.ftcDebt],
    },
    job_scam: {
      title: "Fake jobs, scholarships and student loan offers",
      what: "Offers of easy remote work without an interview, a check to buy \"approved\" equipment, pay for rating products, a scholarship you didn't apply for, or loan forgiveness for a fee. They end with you paying money or sharing your Social Security number and bank details. Checks they send bounce days later.",
      todo: [
        "Never deposit a check from a stranger and send part of the money back or buy something with it.",
        "Real jobs and scholarships don't charge fees.",
        "Don't share your Social Security number or bank details until you've confirmed the company is real.",
      ],
      sources: [SRC.ftcJobs, SRC.ftcChecks, SRC.ftcScholar, SRC.ftcLoans],
    },
    advance_fee: {
      title: "Pay-a-fee-first scams",
      what: "You're told money is waiting for you, like an inheritance, a lottery win, a loan, a government grant, an insurance payout or recovered funds, but you must first pay a fee, tax or deposit. The money never arrives.",
      todo: [
        "Never pay a fee to receive money.",
        "Government grants don't come from emails or calls asking for a fee.",
        "Beware \"recovery\" services that promise to get back money you lost to a scam for an upfront fee.",
      ],
      sources: [SRC.ftcAdvance, SRC.ftcGrant, SRC.ftcRefund, SRC.ftcPrize],
    },
    malicious_file: {
      title: "Dangerous files, links and fake verifications",
      what: "Messages push you to open an attachment, view a shared document, e-sign a contract or scan a QR code. They lead to fake sign-in pages or harmful software. A newer trick is a fake \"prove you're human\" page that tells you to press keys and paste a command, which installs malware.",
      todo: [
        "Don't open unexpected attachments or shared files, even from people you know. Check with them first.",
        "Real websites never ask you to press Windows + R or paste anything to prove you're human. Close the page.",
        "Don't scan QR codes in unexpected messages.",
      ],
      sources: [SRC.ftcCaptcha, SRC.ftcPhish, SRC.ftcQr],
    },
    business_payment: {
      title: "Boss and vendor payment scams",
      what: "Someone pretends to be a boss, coworker or supplier. They ask for an urgent wire, gift cards for the team, employee tax forms, or say their bank details have changed. The money goes to the scammer.",
      todo: [
        "Confirm any request involving money or personal data by calling the person at a number you already have.",
        "Treat a change in bank details as suspicious until you've confirmed it by phone.",
      ],
      sources: [SRC.ic3Bec, SRC.ftcBizBills],
    },
    charity: {
      title: "Fake charity appeals",
      what: "After disasters or during the holidays, scammers ask for urgent donations, sometimes promising a sponsor will double your gift. The money never reaches the cause.",
      todo: [
        "Give to charities you already know, through their own website.",
        "Never donate with gift cards, crypto or wire transfers.",
      ],
      sources: [SRC.ftcCharity],
    },
    shopping: {
      title: "Fake stores, rentals and sellers",
      what: "Websites and listings offer huge discounts, tickets, pets or apartments, and ask for payment or a deposit before you've seen anything. The item never arrives, or the listing doesn't exist.",
      todo: [
        "Don't pay deposits for things you haven't seen in person.",
        "Pay with a credit card, which gives you more protection, never by wire, gift card or payment app.",
      ],
      sources: [SRC.ftcShop, SRC.ftcRental],
    },
    typosquat: {
      title: "Lookalike website addresses",
      what: "Scammers register addresses that look almost like real ones, such as \"arnazon.com\" instead of \"amazon.com\" or \"paypal-account-verify.com.\" The page looks real but steals whatever you type into it.",
      todo: [
        "Type important addresses yourself, or use a bookmark, instead of clicking links.",
        "Check the address carefully before entering a password or card number.",
        "If you already entered a password here, change it on the real website now.",
      ],
      sources: [SRC.ftcPhish, SRC.cisaPhish],
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
    phishing: ["Did you click a link in the message or sign in anywhere?", "Did you share a code, password or card number?"],
    fake_charge: ["Did you call the number in the message?", "Did anyone ask for card details or to connect to your computer?"],
    legal_threat: ["Did you pay anything or click a payment link?", "Did you share your Social Security number or bank details?"],
    job_scam: ["Did they send you a check or ask you to buy anything?", "Did you share your Social Security number or bank details?"],
    advance_fee: ["Did you pay any fee, and how?", "Did you share bank or personal details?"],
    malicious_file: ["Did you open an attachment, scan a code, or press keys a website told you to?", "Did you sign in anywhere afterwards?"],
    business_payment: ["Did you send any payment, gift card codes or employee records?", "Did you confirm the request with the person by phone?"],
    charity: ["Did you donate, and how did you pay?"],
    shopping: ["Did you pay, or pay a deposit, and how?"],
    typosquat: ["Did you enter a password or card number on that site?", "How did you get to that site: a link in an email, an ad or a search?"],
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
    fake_captcha: "Fake \"prove you're human\" page asking to run a command",
    call_to_dispute: "Unexpected charge with a number to call",
    fee_for_money: "Asked to pay a fee to receive money",
    fake_check: "Asked to deposit a check and send money on",
    payment_redirect_pressure: "Change of payment details with pressure",
    boss_gift_cards: "Gift card request from a \"boss\"",
    impersonated_sender: "Sender pretending to be a well-known company",
    lookalike_site: "Lookalike website asking for a password, code or card",
    guaranteed_returns: "Guaranteed returns on crypto or trading",
    romance_money: "Affection plus an urgent money request",
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
    if (/typo|lookalike|look-alike|spoofed (site|domain|website)/.test(n)) return "typosquat";
    if (/captcha|attachment|malware|qr|shared (file|document)|e-?sign|docusign|document/.test(n)) return "malicious_file";
    if (/ceo|boss|executive|vendor|supplier|payroll|direct deposit|business email|bec/.test(n)) return "business_payment";
    if (/job|employment|recruit|scholarship|student|fake check|task/.test(n)) return "job_scam";
    if (/invoice|renewal|subscription|refund|billing|charge|order|purchase|antivirus/.test(n)) return "fake_charge";
    if (/toll|court|summons|warrant|debt|collector|traffic|fine/.test(n)) return "legal_threat";
    if (/phish|account|password|login|sign-?in|security alert|verification|mailbox|storage/.test(n)) return "phishing";
    if (/inheritance|advance|fee|grant|loan|recovery|settlement|payout/.test(n)) return "advance_fee";
    if (/charity|donation/.test(n)) return "charity";
    if (/shop|store|rental|ticket|pet|puppy|seller/.test(n)) return "shopping";
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
    const rule = (x) => hardRules.some((r) => r.rule === x);
    if (rule("crypto_atm")) return "crypto_atm";
    if (rule("fake_captcha")) return "malicious_file";
    if (n("blackmail")) return "sextortion";
    if (n("lookalike")) return "typosquat";
    if (n("paymentRedirect") || n("bossRequest")) return "business_payment";
    if (FAMILY_EMERGENCY.test(text)) return "family_emergency";
    if (rule("fake_check") || n("jobOffer")) return "job_scam";
    if (n("fakeCharge")) return "fake_charge";
    if (n("remoteAccess") || (COMPUTER_THREAT.test(text) && (n("callNumber") || n("authority")))) return "tech_support";
    if (n("legalThreat")) return "legal_threat";
    if (n("accountPhish") || n("codeRequest") || n("brandSpoof")) return "phishing";
    if (n("feeToWithdraw") || INVEST.test(text)) return "investment";
    if (n("recoveryOffer") || (n("upfrontFee") && !PRIZE.test(text))) return "advance_fee";
    if (PRIZE.test(text)) return "prize";
    if (n("bonding")) return "romance";
    if (n("authority") && has(cues, MONEY)) return "impersonation";
    if (n("charityPressure")) return "charity";
    if (n("depositFirst")) return "shopping";
    if (n("dangerousFile")) return "malicious_file";
    if (n("paymentApp")) return "payment_app";
    if (n("platformSwitch")) return "platform_switch";
    return "generic";
  }

  /**
   * opts (all optional): sender ("Name <email>"), url (the page address),
   * sensitiveForm (the page asks for a password or card number).
   */
  function analyze(text, opts = {}) {
    const full = String(text || "").slice(0, 20000);
    if (opts.url && trustedSite(opts.url)) return quietVerdict();

    // Facts about where it came from, not just what it says.
    let look = null;
    if (opts.url) {
      try {
        look = lookalikeDomain(new URL(opts.url).hostname);
      } catch {}
    }
    const spoof = opts.sender ? senderSpoof(opts.sender) : null;

    // Long pages are scored in overlapping sections, so warning signs only add up when they appear
    // close together, as they do on scam pages, not scattered across a long, normal page.
    const sections = [];
    if (full.length <= SECTION * 2) sections.push(full);
    else for (let i = 0; i < full.length; i += SECTION / 2) sections.push(full.slice(i, i + SECTION));
    let best = null;
    for (const section of sections) {
      const r = scoreSection(section, opts, look, spoof);
      if (!best || RANK[r.risk] > RANK[best.risk] || (r.risk === best.risk && r.score > best.score)) best = r;
    }
    const { t, cues, score, hardRules, risk } = best;

    let scamType = null;
    if (risk !== "low") {
      scamType = guessType(cues, hardRules, t);
      if (risk === "medium" && scamType === "generic") scamType = guessMedium(cues);
    }
    let explanationForElder = scamType ? ELDER_TEXT[scamType] : "";
    if (scamType === "typosquat" && look) {
      explanationForElder = `This website's address is "${look.host}", which looks like ${look.official} but isn't. Scammers make lookalike sites to steal passwords and card numbers. To be safe, type ${look.official} yourself.`;
    }

    return {
      lookalike: look,
      risk,
      score,
      cues,
      hardRules,
      scamType,
      stage: ["investment", "romance", "platform_switch"].includes(scamType) ? pigButcheringStage(cues, t) : null,
      scamTypeName: scamType ? TYPE_NAMES[scamType] : null,
      guideKey: scamType ? (GUIDES[scamType] ? scamType : "generic") : null,
      explanationForElder,
      explanationForFamily: scamType
        ? `${TYPE_NAMES[scamType]}. Warning signs: ${cues.map((c) => c.label.toLowerCase()).join(", ")}.`
        : "",
    };
  }

  // Official brand sites and government sites are the real thing, so their wording is never warned about.
  function trustedSite(url) {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      return /\.(gov|mil)$/.test(host) || Boolean(officialFor(host));
    } catch {
      return false;
    }
  }

  function quietVerdict() {
    return { lookalike: null, risk: "low", score: 0, cues: [], hardRules: [], scamType: null, stage: null, scamTypeName: null, guideKey: null, explanationForElder: "", explanationForFamily: "", trusted: true };
  }

  const SECTION = 1500;

  // The cues, hard rules and risk for one section of text.
  function scoreSection(t, opts, look, spoof) {
    const cues = [];
    let score = 0;

    for (const [name, c] of Object.entries(CUES)) {
      const m = t.match(c.re);
      if (m) {
        cues.push({ cue: name, label: c.label, quote: m[0].trim().slice(0, 120) });
        score += c.w;
      }
    }

    if (look) {
      cues.unshift({ cue: "lookalike", label: "Lookalike website address", quote: `${look.host} (not ${look.official})` });
      score += 3;
    }
    if (spoof) {
      cues.unshift({ cue: spoof.cue, label: spoof.label, quote: spoof.quote });
      score += 3;
    }

    const hardRules = [];
    // Fake "prove you're human" page asking to run a command.
    const cmd = t.match(RUN_COMMAND);
    if (cmd && HUMAN_CHECK.test(t)) {
      hardRules.push({ rule: "fake_captcha", quote: cmd[0] });
      cues.unshift({ cue: "fakeCaptcha", label: "Fake \"prove you're human\" check", quote: cmd[0].trim().slice(0, 120) });
    }
    if (has(cues, ["fakeCharge"]) && has(cues, ["callNumber"])) hardRules.push({ rule: "call_to_dispute" });
    if (has(cues, ["upfrontFee", "feeToWithdraw"]) && (has(cues, ["tooGood", "jobOffer", "recoveryOffer"]) || FEE_FOR_MONEY.test(t))) {
      hardRules.push({ rule: "fee_for_money" });
    }
    if (FAKE_CHECK.test(t)) hardRules.push({ rule: "fake_check" });
    if (/\b(guaranteed (returns?|profits?)|double your money)\b/i.test(t) && /\b(crypto|bitcoin|trading|forex)\b/i.test(t)) hardRules.push({ rule: "guaranteed_returns" });
    if (has(cues, ["paymentRedirect"]) && has(cues, ["urgency", "secrecy", "bossRequest"])) hardRules.push({ rule: "payment_redirect_pressure" });
    if (has(cues, ["bossRequest"]) && has(cues, ["untraceable"])) hardRules.push({ rule: "boss_gift_cards" });
    // Affection plus a money request plus urgency: the romance scam ask.
    if (has(cues, ["bonding"]) && has(cues, MONEY) && has(cues, ["urgency", "secrecy"])) hardRules.push({ rule: "romance_money" });
    if (spoof && has(cues, ["accountPhish", "codeRequest", "fakeCharge", "callNumber", "dangerousFile", "urgency", "legalThreat", ...MONEY])) {
      hardRules.push({ rule: "impersonated_sender" });
    }
    if (look && (opts.sensitiveForm || has(cues, ["accountPhish", "codeRequest"]))) hardRules.push({ rule: "lookalike_site" });
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

    // Three or more real warning signs including a money request is high risk. Light signs (weight 1)
    // don't count toward the three, so a busy menu like "Police · Wire Transfer · Donate Now" stays calm.
    const strong = cues.filter((c) => (CUES[c.cue]?.w ?? 3) >= 2).length;
    let risk = "low";
    if (hardRules.length || score >= 7 || (strong >= 3 && has(cues, MONEY) && score >= 6)) risk = "high";
    else if (score >= 3) risk = "medium";

    return { t, cues, score, hardRules, risk };
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

  // ---------- Lookalike addresses (typosquatting) and fake senders ----------
  // Brands scammers imitate most. key: what a lookalike address is compared to.
  // names: how the brand appears in an email's sender name (only distinctive names, to avoid false alarms).
  // typo: whether one-letter-off addresses count (off for short or common words).
  const AMAZON_TLDS = ["com", "ca", "de", "fr", "it", "es", "nl", "se", "pl", "in", "sg", "ae", "sa", "eg", "co.uk", "co.jp", "com.au", "com.mx", "com.br", "com.tr", "com.be"];
  const BRANDS = [
    { name: "Amazon", key: "amazon", anyTld: true, domains: [...AMAZON_TLDS.map((t) => `amazon.${t}`), "amazonaws.com", "a2z.com"], names: /\bamazon\b/i },
    { name: "PayPal", key: "paypal", anyTld: true, domains: ["paypal.com", "paypal.me", "paypalobjects.com"], names: /\bpay ?pal\b/i },
    { name: "Apple", key: "apple", anyTld: true, domains: ["apple.com", "icloud.com", "me.com"], names: /\b(apple (support|id|care)|icloud)\b/i, typo: false },
    { name: "Microsoft", key: "microsoft", anyTld: true, domains: ["microsoft.com", "microsoftonline.com", "office.com", "live.com", "outlook.com", "hotmail.com", "xbox.com", "windows.com", "bing.com"], names: /\b(microsoft|windows defender|office ?365|outlook team)\b/i },
    { name: "Google", key: "google", anyTld: true, domains: ["google.com", "gmail.com", "youtube.com", "google.co.uk", "google.ca", "googleusercontent.com", "gstatic.com"], names: /\bgoogle (security|account|support|workspace)\b/i },
    { name: "Netflix", key: "netflix", anyTld: true, domains: ["netflix.com"], names: /\bnetflix\b/i },
    { name: "Facebook", key: "facebook", anyTld: true, domains: ["facebook.com", "fb.com", "meta.com", "facebookmail.com"], names: /\b(facebook|meta support)\b/i },
    { name: "Instagram", key: "instagram", anyTld: true, domains: ["instagram.com"], names: /\binstagram\b/i },
    { name: "LinkedIn", key: "linkedin", anyTld: true, domains: ["linkedin.com"], names: /\blinkedin\b/i },
    { name: "Chase", key: "chase", domains: ["chase.com", "jpmorganchase.com"], names: /\bchase (bank|online|alerts?|security)\b/i, typo: false },
    { name: "Bank of America", key: "bankofamerica", domains: ["bankofamerica.com", "bofa.com"], names: /\bbank of america\b/i },
    { name: "Wells Fargo", key: "wellsfargo", domains: ["wellsfargo.com", "wf.com"], names: /\bwells ?fargo\b/i },
    { name: "Citibank", key: "citibank", domains: ["citibank.com", "citi.com"], names: /\bciti ?bank\b/i },
    { name: "Capital One", key: "capitalone", domains: ["capitalone.com"], names: /\bcapital ?one\b/i },
    { name: "U.S. Bank", key: "usbank", domains: ["usbank.com"], names: /\bu\.?s\.? bank\b/i },
    { name: "Walmart", key: "walmart", domains: ["walmart.com"], names: /\bwalmart\b/i },
    { name: "Target", key: "target", domains: ["target.com"], names: /\btarget (support|order)\b/i, typo: false },
    { name: "Best Buy", key: "bestbuy", domains: ["bestbuy.com", "geeksquad.com"], names: /\bbest ?buy\b/i },
    { name: "Geek Squad", key: "geeksquad", domains: ["geeksquad.com", "bestbuy.com"], names: /\bgeek ?squad\b/i },
    { name: "eBay", key: "ebay", anyTld: true, domains: ["ebay.com"], names: /\bebay\b/i, typo: false },
    { name: "Costco", key: "costco", anyTld: true, domains: ["costco.com"], names: /\bcostco\b/i },
    { name: "USPS", key: "usps", domains: ["usps.com", "usps.gov"], names: /\b(usps|postal service)\b/i, typo: false },
    { name: "FedEx", key: "fedex", anyTld: true, domains: ["fedex.com"], names: /\bfed ?ex\b/i, typo: false },
    { name: "UPS", key: "ups", anyTld: true, domains: ["ups.com"], names: /\bUPS\b/, typo: false },
    { name: "DHL", key: "dhl", anyTld: true, domains: ["dhl.com"], names: /\bDHL\b/, typo: false },
    { name: "the IRS", key: "irs", domains: ["irs.gov"], names: /\b(IRS|internal revenue)\b/, typo: false },
    { name: "Social Security", key: "ssa", domains: ["ssa.gov"], names: /\bsocial security\b/i, typo: false },
    { name: "Medicare", key: "medicare", domains: ["medicare.gov", "cms.gov"], names: /\bmedicare\b/i },
    { name: "Zelle", key: "zelle", domains: ["zelle.com", "zellepay.com"], names: /\bzelle\b/i, typo: false },
    { name: "Venmo", key: "venmo", domains: ["venmo.com"], names: /\bvenmo\b/i, typo: false },
    { name: "Cash App", key: "cashapp", domains: ["cash.app", "cash.me", "squareup.com", "square.com"], names: /\bcash ?app\b/i },
    { name: "Coinbase", key: "coinbase", domains: ["coinbase.com"], names: /\bcoinbase\b/i },
    { name: "DocuSign", key: "docusign", anyTld: true, domains: ["docusign.com", "docusign.net"], names: /\bdocu ?sign\b/i },
    { name: "Dropbox", key: "dropbox", anyTld: true, domains: ["dropbox.com", "dropboxmail.com"], names: /\bdropbox\b/i },
    { name: "Norton", key: "norton", domains: ["norton.com", "nortonlifelock.com", "gen.digital"], names: /\bnorton\b/i, typo: false },
    { name: "McAfee", key: "mcafee", anyTld: true, domains: ["mcafee.com"], names: /\bmcafee\b/i },
    { name: "Xfinity", key: "xfinity", domains: ["xfinity.com", "comcast.com", "comcast.net"], names: /\b(xfinity|comcast)\b/i },
  ];
  const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|aol|hotmail|outlook|live|msn|icloud|me|mail|gmx|proton|protonmail|zoho)\.[a-z.]+$/i;
  const PHISHY_WORD = /(login|log-in|signin|sign-in|secure|security|verify|verification|account|support|help|billing|update|service|alert|refund|customer|wallet|auth|confirm|unlock|recovery|center|desk|delivery|redelivery|parcel|package|tracking|renew|review|invoice|payment|claim|reward|tax)/i;
  const TWO_PART_TLD = /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/;

  // "login.secure-paypal.com" -> "secure-paypal.com"
  function registrable(host) {
    const parts = host.split(".");
    const lastTwo = parts.slice(-2).join(".");
    return parts.slice(TWO_PART_TLD.test(lastTwo) ? -3 : -2).join(".");
  }

  function brandOwns(b, host) {
    return (b.anyTld && registrable(host).split(".")[0] === b.key) || b.domains.some((d) => host === d || host.endsWith(`.${d}`));
  }
  function officialFor(host) {
    return BRANDS.find((b) => brandOwns(b, host));
  }

  // Letters scammers swap in: 0 for o, 1 for l, rn for m, vv for w.
  function deconfuse(s) {
    return s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/0/g, "o").replace(/[1!|]/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/\$/g, "s").replace(/-/g, "");
  }

  function editDistance(a, b) {
    // Damerau-Levenshtein (adjacent swaps count as one edit)
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  /** Is this website address imitating a well-known brand? Returns { brand, official, host, how } or null. */
  function lookalikeDomain(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host === "localhost" || officialFor(host)) return null;
    const reg = registrable(host);
    const label = reg.split(".")[0];
    const sub = host.slice(0, host.length - reg.length);
    for (const b of BRANDS) {
      const k = b.key;
      const hit = (how) => ({ brand: b.name, official: b.domains[0], host, how });
      if (label === k) return hit("same name, different ending"); // paypal.co, amazon-com.net is handled below
      if (deconfuse(label) === k) return hit("swapped letters"); // paypa1.com, arnazon.com
      if (b.typo !== false && k.length >= 6 && editDistance(label, k) <= (k.length >= 9 ? 2 : 1)) return hit("misspelled"); // amazom.com
      if (new RegExp(`(^|[-.])${k}([-.]|$)`).test(label) || new RegExp(`^${k}`).test(label)) {
        const rest = label.replace(k, "");
        // Brands that are ordinary words (Target, Chase) need a hyphen, so "targetcenter.org" stays quiet.
        const separated = b.typo !== false || label.includes("-");
        if (separated && (PHISHY_WORD.test(rest) || /^-?(com|net|org|us|usa)$/.test(rest))) return hit("brand name plus extra words"); // amazon-account-verify.com
      }
      if (k.length >= 4 && new RegExp(`(^|\\.)${k}(\\.|-)`).test(sub)) return hit("brand name hidden at the start"); // paypal.com.secure-login.xyz
    }
    return null;
  }

  /** Does an email sender pretend to be a well-known brand? sender: 'Name <email@domain>'. */
  function senderSpoof(sender) {
    const s = String(sender || "");
    const email = (s.match(/<([^>]+)>/)?.[1] || s.match(/[\w.+-]+@[\w.-]+/)?.[0] || "").toLowerCase();
    const name = s.replace(/<[^>]*>/, "").replace(/["']/g, "").trim();
    const domain = email.split("@")[1] || "";
    if (!domain) return null;
    const look = lookalikeDomain(domain);
    if (look) return { cue: "brandSpoof", label: "Pretending to be a well-known company", quote: `${name ? `${name} ` : ""}<${email}>`, brand: look.brand };
    const b = BRANDS.find((x) => x.names.test(name));
    // Real companies never send from free email accounts, even ones they own (outlook.com).
    if (b && (FREEMAIL.test(domain) || !brandOwns(b, domain))) {
      return { cue: "brandSpoof", label: "Pretending to be a well-known company", quote: `${name} <${email}>`, brand: b.name, freemail: FREEMAIL.test(domain) };
    }
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

  return { analyze, flagTransaction, paymentPage, guideFor, lookalikeDomain, senderSpoof, maxRisk, RANK, TYPE_NAMES, ELDER_TEXT, CUES, GUIDES, HELP, HARD_RULE_TEXT };
})();

if (typeof module !== "undefined" && module.exports) module.exports = KinGuardRules;
