// Simulated bank activity for the demo. In production, a Plaid webhook would call recordTransaction().
import { recordTransaction } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESETS = {
  giftcards: { merchant: "QuickMart (gift cards)", category: "Gift cards", amount: 500 },
  cryptoatm: { merchant: "Bitcoin ATM, Route 26 gas station", category: "Crypto ATM", amount: 2000 },
  zelle: { merchant: "Zelle to new payee \"Account Services\"", category: "Transfer", amount: 1200, newPayee: true },
  groceries: { merchant: "Corner Market", category: "Groceries", amount: 58.4 },
};

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const input = PRESETS[body.preset] || body;
  if (!input.merchant || !Number(input.amount)) {
    return Response.json({ error: `Use a preset (${Object.keys(PRESETS).join(", ")}) or send merchant and amount.` }, { status: 400 });
  }
  const result = await recordTransaction(input);
  return Response.json(result);
}
