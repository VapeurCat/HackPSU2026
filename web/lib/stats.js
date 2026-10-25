// Counts of pages and emails KinGuard checked, by day. Only numbers are stored, never addresses or email text.
import { update } from "./db.js";

const DAYS_KEPT = 14;

export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function bump(kind) {
  update((db) => {
    db.stats ||= {};
    const day = dayKey();
    const today = (db.stats[day] ||= { pages: 0, emails: 0 });
    today[kind === "email" ? "emails" : "pages"] += 1;
    db.extensionSeen = new Date().toISOString();
    // Drop old days.
    const keep = Object.keys(db.stats).sort().slice(-DAYS_KEPT);
    db.stats = Object.fromEntries(keep.map((k) => [k, db.stats[k]]));
  });
}

/** What the dashboard and the toolbar pop-up show. */
export function summary(db) {
  const today = db.stats?.[dayKey()] || { pages: 0, emails: 0 };
  const weekAgo = Date.now() - 7 * 24 * 3600e3;
  const warningsWeek = (db.events || []).filter((e) => e.risk !== "low" && e.type !== "activity" && Date.parse(e.ts) >= weekAgo).length;
  return { today, warningsWeek, extensionSeen: db.extensionSeen || null };
}
