// A tiny JSON-file database so the demo runs with zero setup.
// Tables mirror the plan (Person, CircleMember, TimelineEvent, Alert),
// so swapping in Supabase later means replacing these functions only.
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "db.json");

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
        alerts: { email: true },
        role: "owner",
      },
    ],
    events: [],
    alerts: [],
    outbox: [],
    trustedSites: [],
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

// Clears the demo history but keeps the people, contact details and trusted sites set in Settings.
export function reset() {
  const fresh = seed();
  try {
    const old = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (old.person) fresh.person = old.person;
    if (old.family?.length) fresh.family = old.family;
    if (old.trustedSites) fresh.trustedSites = old.trustedSites;
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
    alerts: { email: true, ...(m.alerts || {}) },
  };
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
