// Quick check of the scam rules: npm run test-rules
const rules = require("../../extension/rules.js");

const cases = [
  ["low", "Happy birthday Grandpa! Here's a photo from the game. See you Sunday for dinner."],
  ["low", "Holiday gift cards make the perfect present for the grandkids. Choose from 40 stores."],
  ["medium", "Want to keep chatting? Text me on WhatsApp, it's easier for photos."],
  ["medium", "Hi Frank, let's continue on Telegram, my phone app here is acting up."],
  [
    "high",
    "WARNING: Your computer is infected with 3 viruses. Call Technical Support immediately at 1-800-555-0199. Do not close this window. Do not contact your bank.",
  ],
  ["high", "Go to the Bitcoin ATM at the gas station and insert the cash, then scan this QR code to pay your tax balance."],
  ["high", "This is your bank's fraud department. To protect your savings, send it to yourself with Zelle right away. Don't tell anyone."],
  ["high", "Your account shows $48,200 in profit! To withdraw, you must first pay a 20% tax to release your funds. Guaranteed returns, my dear."],
  ["high", "Let's move this to Telegram, I want to show you how I double your money with crypto, my love."],
  ["low", "Grandpa, I recorded you a video of the game! You can watch it on the family page."],
  ["high", "I hacked your webcam and recorded you while you were watching videos. Send $1,500 in Bitcoin within 48 hours or I will send it to all your contacts."],
  ["high", "I know your password is sunshine22. I have an embarrassing video of you. Pay in bitcoin to this wallet or everyone sees it."],
  ["high", "We refunded too much to your account. Install AnyDesk so our support team can fix it immediately and send back the difference."],
];

let pass = 0;
for (const [expected, text] of cases) {
  const r = rules.analyze(text);
  const ok = r.risk === expected;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  expected ${expected.padEnd(6)} got ${r.risk.padEnd(6)} score ${String(r.score).padStart(2)}  ${r.scamTypeName || ""}`);
  console.log(`      cues: ${r.cues.map((c) => `${c.cue}("${c.quote}")`).join(", ") || "none"}`);
}

console.log("\nTransactions:");
for (const tx of [
  { merchant: "Corner Market", amount: 58.4 },
  { merchant: "QuickMart (gift cards)", category: "Gift cards", amount: 500 },
  { merchant: "Bitcoin ATM, Route 26 gas station", amount: 2000 },
  { merchant: "Zelle to new payee", amount: 1200, newPayee: true },
]) {
  console.log(`  ${tx.merchant.padEnd(36)} -> ${JSON.stringify(rules.flagTransaction(tx))}`);
}

console.log(`\n${pass}/${cases.length} text cases passed`);
process.exit(pass === cases.length ? 0 : 1);
