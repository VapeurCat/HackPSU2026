// A tiny JSON-file database so the demo runs with zero setup.
// Tables mirror the plan (Person, CircleMember, TimelineEvent, Alert, Transaction),
// so swapping in Supabase later means replacing these functions only.
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "db.json");

function daysAgo(d, hour = 12) {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(hour, 15, 0, 0);
  return t.toISOString();
}

function seed() {
  const elder = process.env.ELDER_NAME || "Frank";
  const family = process.env.FAMILY_NAME || "Sarah";
  return {
    person: { id: "frank", name: elder },
    family: [
      {
        id: "sarah",
        name: family,
        relation: "daughter",
        email: process.env.FAMILY_EMAIL || "",
        phone: process.env.FAMILY_PHONE || "",
        alerts: { email: true, text: true, call: true },
        role: "owner",
      },
    ],
    events: [],
    alerts: [],
    outbox: [],
    transactions: [
      { id: "t1", ts: daysAgo(6, 10), merchant: "Corner Market", category: "Groceries", amount: 64.2 },
      { id: "t2", ts: daysAgo(5, 15), merchant: "Main Street Pharmacy", category: "Health", amount: 12.0 },
      { id: "t3", ts: daysAgo(4, 9), merchant: "Valley Electric", category: "Utilities", amount: 118.45 },
      { id: "t4", ts: daysAgo(3, 13), merchant: "Nittany Diner", category: "Dining", amount: 23.5 },
      { id: "t5", ts: daysAgo(2, 17), merchant: "Route 26 Gas", category: "Gas", amount: 41.1 },
      { id: "t6", ts: daysAgo(1, 11), merchant: "Corner Market", category: "Groceries", amount: 52.75 },
    ],
  };
}

export function load() {
  if (!fs.existsSync(FILE)) save(seed());
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    const fresh = seed();
    save(fresh);
    return fresh;
  }
}

export function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

// Read, change and write in one step. Returns whatever fn returns.
export function update(fn) {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

// Clears the demo history but keeps the people and contact details set in Settings.
export function reset() {
  const fresh = seed();
  try {
    const old = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (old.person) fresh.person = old.person;
    if (old.family?.length) fresh.family = old.family;
  } catch {}
  save(fresh);
  return fresh;
}

/** The trusted contact's details from Settings, falling back to .env.local. */
export function familyContact(db) {
  const m = db.family?.[0] || {};
  return {
    name: m.name || "your family",
    relation: m.relation || "",
    email: m.email || process.env.FAMILY_EMAIL || "",
    phone: m.phone || process.env.FAMILY_PHONE || "",
    alerts: { email: true, text: true, call: true, ...(m.alerts || {}) },
  };
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
