"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 3000;

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function whenOf(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? timeOf(ts) : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function sourceName(s) {
  return { web: "Web page", gmail: "Email", paste: "Checked message", extension: "KinGuard" }[s] || s;
}
// "just now", "5 min ago", "2 hr ago", or the day for older things.
function relTime(ts) {
  const mins = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60 && new Date(ts).toDateString() === new Date().toDateString()) return `${Math.round(mins / 60)} hr ago`;
  return whenOf(ts);
}
function dayLabel(ts) {
  const d = new Date(ts).toDateString();
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d === today.toDateString()) return "Today";
  if (d === yesterday.toDateString()) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

// Small line icons (instead of emoji), drawn in the current text color.
const ICONS = {
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9m0-18c-2.5 2.4-3.8 5.4-3.8 9s1.3 6.6 3.8 9M3.5 9h17M3.5 15h17",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  warning: "M12 4 2.5 20h19L12 4Zm0 6v4m0 3v.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pause: "M8 5v14M16 5v14",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.1 8.1 7.5 9.5 4.4-1.4 7.5-4.9 7.5-9.5V6L12 3Z",
  circle: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z",
  text: "M4 18 9 6l5 12M5.8 14h6.4M15 18l3-8 3 8M15.9 16h4.2",
};
function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name] || ICONS.circle} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function sourceIcon(e) {
  if (e.type === "activity") return "pause";
  if (e.type === "payment_attempt" || e.kind === "pay_attempt") return "card";
  if (e.source === "gmail") return "mail";
  return "globe";
}

async function post(url, body, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// × button that deletes something after an "Are you sure?" check.
function DeleteButton({ label, onDelete }) {
  return (
    <button
      type="button"
      className="delete-x"
      aria-label={`Delete ${label}`}
      title="Delete"
      onClick={(e) => {
        e.stopPropagation(); // don't open a collapsed card
        if (confirm("Are you sure you want to delete this?")) onDelete();
      }}
    >
      ×
    </button>
  );
}

function Shield() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 4.5 7v8.2c0 7 4.8 12.4 11.5 14.3 6.7-1.9 11.5-7.3 11.5-14.3V7L16 2.5Z" fill="currentColor" opacity="0.15" />
      <path d="M16 2.5 4.5 7v8.2c0 7 4.8 12.4 11.5 14.3 6.7-1.9 11.5-7.3 11.5-14.3V7L16 2.5Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11 16.5l3.4 3.4L21.5 12.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBand({ data, refresh }) {
  const name = data.person.name;
  const family = data.family[0]?.name || "you";
  const open = data.alerts.filter((a) => a.status === "open");
  const paying = open.find((a) => a.kind === "pay_attempt");
  const recentMedium = data.events.some((e) => e.risk === "medium" && Date.now() - Date.parse(e.ts) < 24 * 3600e3);

  let level = "safe";
  let line = `${name} looks safe.`;
  let sub = "No scam warnings right now. KinGuard is watching websites and Gmail.";

  if (paying) {
    level = "danger";
    line = `${name} may be about to pay a scammer.`;
    sub = `KinGuard paused a payment page at ${timeOf(paying.ts)} and alerted ${family}. Call ${name} now.`;
  } else if (open.length) {
    level = "danger";
    line = `${name} ran into a likely scam.`;
    sub = `${open[0].title} at ${timeOf(open[0].ts)}. ${open.length > 1 ? `${open.length} alerts need a look.` : "Review it below."}`;
  } else if (recentMedium) {
    level = "warn";
    line = `${name} saw something suspicious today.`;
    sub = "Nothing urgent. Take a look at the timeline when you have a minute.";
  }

  return (
    <header className="band" data-level={level}>
      <div className="band-inner">
        <div className="brand">
          <span className="brand-name">
            <Shield /> KinGuard
          </span>
          <div className="header-tools">
            <TextSizeToggle />
            <SettingsMenu data={data} refresh={refresh} />
            <DevMenu data={data} refresh={refresh} />
          </div>
        </div>
        <h1 className="status-line" aria-live="polite">
          {line}
        </h1>
        <p className="status-sub">{sub}</p>
      </div>
    </header>
  );
}

function Signs({ cues }) {
  const withQuotes = (cues || []).filter((c) => c.quote);
  if (!withQuotes.length) return null;
  return (
    <ul className="signs" aria-label="Warning signs">
      {withQuotes.slice(0, 6).map((c, i) => (
        <li key={i}>
          <span className="label">{c.label}:</span> <mark>&ldquo;{c.quote}&rdquo;</mark>
        </li>
      ))}
    </ul>
  );
}

// Plain-language explanation of the scam type, with trusted sources, for the family.
function Guide({ guide, help }) {
  if (!guide) return null;
  return (
    <details className="guide">
      <summary>About this scam: {guide.title}</summary>
      <p>{guide.what}</p>
      {guide.ask?.length > 0 && (
        <>
          <strong>Questions to ask</strong>
          <ul>
            {guide.ask.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
      <strong>What they should do</strong>
      <ul>
        {guide.todo.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      <div className="guide-sources">
        Learn more:{" "}
        {guide.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && " · "}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.name}
            </a>
          </span>
        ))}
      </div>
      {help && (
        <p className="guide-help">
          {help.text}{" "}
          {help.links.map((l, i) => (
            <span key={l.url}>
              {i > 0 && " · "}
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </details>
  );
}

// How an alert should look: red for an open scam, amber for suspicious, green once marked safe.
function alertTone(a) {
  if (a.status === "safe") return "safe";
  if (a.status === "confirmed_scam") return "confirmed";
  if (a.status === "merged") return "muted";
  return a.severity === "medium" ? "warn" : "danger";
}

const DECISION_SHORT = { closed: "closed the page", continued: "continued anyway", trusted: "trusted the page" };
const DECISION_LONG = { closed: "closed the page", continued: "chose to continue anyway", trusted: "clicked “I trust this page” and stayed on it" };

function AlertCard({ alert, data, onStatus, onDelete, startOpen = false, fresh = false }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(startOpen);
  const bodyId = `alert-body-${alert.id}`;
  const tone = alertTone(alert);
  // Where it happened, in one line.
  const where = Object.fromEntries(alert.facts || []);
  const whereText = where["Email from"] ? `Email from ${where["Email from"]}` : where.Website ? `On ${where.Website}` : "";
  const icon = alert.kind === "pay_attempt" ? "card" : where["Email from"] ? "mail" : "globe";
  const statusText = { safe: "Marked safe", confirmed_scam: "Confirmed scam", merged: "Combined into a newer alert" }[alert.status];
  const keyFacts = (alert.facts || []).filter(([k]) => !["Full address", "Page title"].includes(k));

  const set = async (status) => {
    setBusy(true);
    await onStatus(alert.id, status);
    setBusy(false);
  };

  return (
    // A collapsed card opens when clicked anywhere; the title button keeps it keyboard-accessible.
    <article
      className={`alert${fresh ? " fresh" : ""}`}
      data-tone={tone}
      data-expanded={expanded}
      onClick={expanded ? undefined : () => setExpanded(true)}
    >
      <div className="alert-top">
        <span className="alert-icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <h3 className="alert-heading">
          <button type="button" className="alert-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((x) => !x)}>
            <span className="alert-title">{alert.title}</span>
            <span className="when" title={new Date(alert.ts).toLocaleString()}>{relTime(alert.ts)}</span>
            <span className="chevron" aria-hidden="true">▾</span>
          </button>
        </h3>
        <DeleteButton label={`alert: ${alert.title}`} onDelete={() => onDelete(alert.id)} />
      </div>
      <p className="alert-summary">
        {statusText && <span className="status-pill">{statusText}</span>}
        {fresh && <span className="status-pill new">New</span>}
        {whereText}
        {alert.decision && ` · ${data.person.name} ${DECISION_SHORT[alert.decision]}`}
      </p>
      {expanded && (
        <div id={bodyId} className="alert-body">
          <p className="alert-lead">{alert.explanation}</p>

          {alert.decision && (
            <p className="decision" data-decision={alert.decision}>
              {data.person.name} {DECISION_LONG[alert.decision]} at {timeOf(alert.decidedAt)}.
            </p>
          )}

          {keyFacts.length > 0 && (
            <dl className="facts">
              {keyFacts.map(([k, v]) => (
                <Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </Fragment>
              ))}
            </dl>
          )}

          {alert.status === "open" ? (
            <div className="actions">
              <button className="btn btn-primary" disabled={busy} onClick={() => set("confirmed_scam")}>
                Confirm it's a scam
              </button>
              <button className="btn" disabled={busy} onClick={() => set("safe")}>
                Mark as safe
              </button>
            </div>
          ) : (
            alert.status !== "merged" && (
              <div className="actions">
                <button className="btn" disabled={busy} onClick={() => set("open")}>
                  Reopen
                </button>
              </div>
            )
          )}

          <details className="more">
            <summary>More details</summary>
            {where["Full address"] && (
              <p className="more-line">
                <strong>Full address:</strong> {where["Full address"]}
              </p>
            )}
            {alert.excerpt && (
              <>
                <strong>What {data.person.name} saw</strong>
                <blockquote className="saw-quote">{alert.excerpt}</blockquote>
              </>
            )}
            <Signs cues={alert.cues} />
            <Guide guide={data.guides?.[alert.guideKey]} help={data.help} />
            {alert.notified?.length > 0 && (
              <div className="notified">
                {data.family[0]?.name || "Family"} emailed at {timeOf(alert.notified[0].ts)} ({alert.notified[0].status})
              </div>
            )}
          </details>
        </div>
      )}
    </article>
  );
}

const ALERTS_SHOWN = 4;

function Alerts({ data, onStatus, onDelete, freshIds }) {
  const [showAll, setShowAll] = useState(false);
  const open = data.alerts.filter((a) => a.status === "open");
  const closed = data.alerts.filter((a) => a.status !== "open");
  const all = [...open, ...closed];
  const shown = showAll ? all : all.slice(0, ALERTS_SHOWN);
  const hidden = all.length - shown.length;
  const t = data.stats?.today || { pages: 0, emails: 0 };
  return (
    <section aria-labelledby="alerts-h">
      <h2 id="alerts-h">Alerts</h2>
      <p className="section-note">High-risk moments worth a closer look.</p>
      {all.length === 0 && (
        <div className="empty calm">
          <Icon name="shield" size={28} />
          <div>
            <strong>No warnings right now.</strong>
            <span>
              KinGuard checked {t.pages} page{t.pages === 1 ? "" : "s"} and {t.emails} email{t.emails === 1 ? "" : "s"} today. You'll see an alert here, and
              get an email, the moment something looks like a scam.
            </span>
          </div>
        </div>
      )}
      {shown.map((a) => (
        <AlertCard key={a.id} alert={a} data={data} onStatus={onStatus} onDelete={onDelete} startOpen={a.id === open[0]?.id} fresh={freshIds.has(a.id)} />
      ))}
      {(hidden > 0 || showAll) && all.length > ALERTS_SHOWN && (
        <button type="button" className="btn more" onClick={() => setShowAll((x) => !x)}>
          {showAll ? "Show fewer" : `Show ${hidden} more alert${hidden === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}

// What KinGuard did today, so a quiet day still shows it's working.
function TodayTiles({ data }) {
  const s = data.stats || { today: { pages: 0, emails: 0 }, warningsWeek: 0 };
  const tiles = [
    { n: s.today.pages, label: "pages checked today", icon: "globe" },
    { n: s.today.emails, label: "emails checked today", icon: "mail" },
    { n: s.warningsWeek, label: "warnings this week", icon: "warning", tone: s.warningsWeek ? "warn" : "" },
  ];
  return (
    <div className="tiles" role="group" aria-label="KinGuard activity">
      {tiles.map((t) => (
        <div className="tile" key={t.label} data-tone={t.tone}>
          <Icon name={t.icon} size={20} />
          <b>{t.n}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

// Setup checklist: shows until everything is ready (or someone hides it).
function SetupChecklist({ data }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("kg-hide-setup") === "1");
    } catch {}
  }, []);
  const seen = data.stats?.extensionSeen;
  const extOn = seen && Date.now() - Date.parse(seen) < 3 * 864e5;
  const items = [
    { done: Boolean(data.person?.name), label: "Name of the person KinGuard protects", fix: "Set it in Settings.", settings: true },
    { done: Boolean(data.contact?.email), label: "Trusted contact's email", fix: "Add it in Settings so alerts can be emailed.", settings: true },
    { done: Boolean(extOn), label: "Browser extension connected", fix: "Load the extension folder in chrome://extensions, then open any website." , detail: extOn ? `Last seen ${relTime(seen)}` : "" },
    { done: Boolean(data.config?.gemini), label: "AI checking", fix: "Add GEMINI_API_KEY to web/.env.local and restart." },
    { done: Boolean(data.config?.email), label: "Email alerts", fix: "Add RESEND_API_KEY to web/.env.local and restart." },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (hidden || doneCount === items.length) return null;
  const hide = () => {
    try {
      localStorage.setItem("kg-hide-setup", "1");
    } catch {}
    setHidden(true);
  };
  return (
    <section className="setup" aria-labelledby="setup-h">
      <div className="setup-head">
        <h2 id="setup-h">Finish setting up KinGuard</h2>
        <span className="setup-count">{doneCount} of {items.length} done</span>
      </div>
      <div className="setup-bar" aria-hidden="true">
        <span style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ul className="setup-list">
        {items.map((i) => (
          <li key={i.label} data-done={i.done}>
            <span className="setup-mark">{i.done ? <Icon name="check" size={16} /> : null}</span>
            <span>
              <strong>{i.label}</strong>
              {i.done ? i.detail && <small>{i.detail}</small> : <small>{i.fix}</small>}
            </span>
            {!i.done && i.settings && (
              <button type="button" className="btn small" onClick={() => window.dispatchEvent(new Event("kg-open-settings"))}>
                Open Settings
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="setup-hide" onClick={hide}>
        Hide this checklist
      </button>
    </section>
  );
}

const FILTERS = [
  ["all", "Everything"],
  ["scam", "Scam checks"],
  ["money", "Payments"],
  ["email", "Email"],
];

function Timeline({ data, onDeleteEvent }) {
  const [filter, setFilter] = useState("all");

  const groups = useMemo(() => {
    const kindOf = (e) => (e.type === "activity" ? "activity" : e.type === "payment_attempt" ? "money" : e.source === "gmail" ? "email" : "scam");
    const items = data.events
      .map((e) => ({ ...e, kind: kindOf(e) }))
      .filter((i) => filter === "all" || i.kind === filter || (filter === "scam" && i.kind === "email"))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 60);
    const out = [];
    for (const i of items) {
      const label = dayLabel(i.ts);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(i);
    }
    return out;
  }, [data, filter]);

  return (
    <section aria-labelledby="tl-h">
      <h2 id="tl-h">Timeline</h2>
      <p className="section-note">Every warning in one place, so the clues can be connected.</p>
      <div className="filters" role="group" aria-label="Filter timeline">
        {FILTERS.map(([key, label]) => (
          <button key={key} className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <div className="empty">Nothing here yet. Warnings, checked emails and pauses will show up here.</div>
      ) : (
        groups.map((g) => (
          <div className="tl-day" key={g.label}>
            <h3 className="tl-day-label">{g.label}</h3>
            <ol className="timeline">
              {g.items.map((i) => (
                <li key={i.id} data-risk={i.risk} data-kind={i.kind}>
                  <span className="tl-icon" aria-hidden="true">
                    <Icon name={sourceIcon(i)} size={16} />
                  </span>
                  <DeleteButton label={`timeline entry: ${i.title}`} onDelete={() => onDeleteEvent(i.id)} />
                  <div className="tl-title">
                    {i.title}
                    {i.risk !== "low" && (
                      <span className="risk-pill" data-risk={i.risk}>
                        {i.risk === "high" ? "High risk" : "Suspicious"}
                      </span>
                    )}
                  </div>
                  <div className="tl-meta">
                    {timeOf(i.ts)} · {sourceName(i.source)}
                    {i.scamTypeName ? ` · ${i.scamTypeName}` : ""}
                    {i.stage ? ` (pig butchering stage ${i.stage} of 4)` : ""}
                  </div>
                  {i.explanationForFamily && <div className="tl-body">{i.explanationForFamily}</div>}
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

// Larger text for easier reading, remembered on this computer.
function TextSizeToggle() {
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try {
      const on = localStorage.getItem("kg-large-text") === "1";
      setLarge(on);
      document.documentElement.dataset.size = on ? "large" : "";
    } catch {}
  }, []);
  const toggle = () => {
    const on = !large;
    setLarge(on);
    document.documentElement.dataset.size = on ? "large" : "";
    try {
      localStorage.setItem("kg-large-text", on ? "1" : "0");
    } catch {}
  };
  return (
    <button type="button" className="dev-toggle" aria-pressed={large} onClick={toggle} title="Make the text bigger">
      <Icon name="text" size={16} />
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

// A short, neutral description of KinGuard for anyone using the dashboard.
function About() {
  return (
    <section className="about-card" aria-labelledby="about-h">
      <h2 id="about-h">What KinGuard does</h2>
      <p className="about">
        KinGuard watches for scams while you browse. It checks websites and Gmail messages as they open, flags lookalike web addresses
        and fake company senders, and pauses payment pages right after a scam warning. Each warning explains the scam in plain
        language, and the trusted contact gets an email when something looks serious.
      </p>
    </section>
  );
}

function Outbox({ data }) {
  return (
    <section aria-labelledby="out-h">
      <h2 id="out-h">Alerts sent to {data.family[0]?.name || "family"}</h2>
      <p className="section-note">
        {data.config.email ? "Emails KinGuard sent." : "Alerts are saved here while email sending is off."}
      </p>
      <div className="panel">
        {data.outbox.length === 0 && <div className="tl-meta">No alerts sent yet.</div>}
        {data.outbox.slice(0, 6).map((m) => (
          <div className="mail" key={m.id}>
            <div className="mail-subject">{m.subject}</div>
            <div className="mail-status">
              {timeOf(m.ts)} to {m.to}: {m.status}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Settings: who KinGuard protects, the trusted contact, and how they're alerted.
function SettingsMenu({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState(null);

  const start = () => {
    const c = data.family[0] || {};
    setForm({
      personName: data.person.name || "",
      name: c.name || "",
      relation: c.relation || "",
      email: c.email || "",
      alerts: { email: true, ...(c.alerts || {}) },
    });
    setErrors({});
    setSaved(false);
    setTests(null);
    setOpen(true);
  };

  // The setup checklist's "Open Settings" buttons.
  useEffect(() => {
    const openIt = () => start();
    window.addEventListener("kg-open-settings", openIt);
    return () => window.removeEventListener("kg-open-settings", openIt);
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };
  const setAlert = (k, v) => {
    setForm((f) => ({ ...f, alerts: { ...f.alerts, [k]: v } }));
    setSaved(false);
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personName: form.personName,
        contact: { name: form.name, relation: form.relation, email: form.email, alerts: form.alerts },
      }),
    });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErrors(out.errors || {});
      return false;
    }
    setErrors({});
    setSaved(true);
    await refresh();
    return true;
  };

  const untrust = async (host) => {
    setBusy(true);
    await post("/api/trusted", { host }, "DELETE");
    await refresh();
    setBusy(false);
  };

  const test = async () => {
    if (!(await save())) return;
    setBusy(true);
    setTests(null);
    const out = await post("/api/settings/test");
    setTests(out.results || []);
    setBusy(false);
    refresh();
  };

  const field = (k, label, props = {}) => (
    <label className="set-field">
      <span>{label}</span>
      <input value={form[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])} {...props} />
      {errors[k] && <em className="set-error">{errors[k]}</em>}
    </label>
  );

  return (
    <>
      <button className="dev-toggle" onClick={start} aria-haspopup="dialog">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3M4 4l2.1 2.1M13.9 13.9 16 16M4 16l2.1-2.1M13.9 6.1 16 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Settings
      </button>
      {open && form && (
        <div className="set-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form className="set-panel" role="dialog" aria-modal="true" aria-labelledby="set-h" onSubmit={save}>
            <div className="set-head">
              <h2 id="set-h">Settings</h2>
              <button type="button" className="set-close" aria-label="Close settings" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <fieldset>
              <legend>Who KinGuard protects</legend>
              {field("personName", "Name", { autoComplete: "off", autoFocus: true })}
            </fieldset>

            <fieldset>
              <legend>Trusted contact</legend>
              <p className="set-note">The person KinGuard alerts when something looks like a scam.</p>
              <div className="set-row">
                {field("name", "Name", { autoComplete: "off" })}
                {field("relation", "Relationship", { placeholder: "daughter, son, friend…", autoComplete: "off" })}
              </div>
              {field("email", "Email", { type: "email", placeholder: "name@example.com", autoComplete: "off" })}
            </fieldset>

            <fieldset>
              <legend>Email alerts</legend>
              <label className="set-check">
                <input type="checkbox" checked={form.alerts.email} onChange={(e) => setAlert("email", e.target.checked)} />
                <span>
                  <strong>Email them</strong> whenever KinGuard spots a likely scam
                  <small>{data.config.emailKey ? "Email sending is set up." : "Demo mode: emails are saved on the dashboard until a Resend key is added."}</small>
                </span>
              </label>
            </fieldset>

            <fieldset>
              <legend>Trusted sites</legend>
              <p className="set-note">
                Sites where {data.person.name} chose “Trust this site”. KinGuard doesn't show yellow notices there, but red scam warnings
                still appear.
              </p>
              {(data.trustedSites || []).length === 0 ? (
                <p className="set-note">None yet.</p>
              ) : (
                <ul className="trusted-list">
                  {data.trustedSites.map((t) => (
                    <li key={t.host}>
                      <span>
                        <strong>{t.host}</strong>
                        <small>Trusted {whenOf(t.ts)}</small>
                      </span>
                      <button type="button" className="btn" onClick={() => untrust(t.host)} disabled={busy}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            {tests && (
              <div className="set-tests" role="status">
                <strong>Test results</strong>
                <ul>
                  {tests.map((t, i) => (
                    <li key={i} data-ok={String(t.status).startsWith("sent")}>
                      <span>{t.channel}</span> {t.to && `to ${t.to}`}: {t.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="set-actions">
              <button type="button" className="btn" onClick={test} disabled={busy}>
                Send a test alert
              </button>
              <span className="set-saved" role="status">
                {saved && !busy ? "✓ Saved" : ""}
              </span>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// Developer and demo controls, kept out of sight behind the DEV menu in the header.
function DevMenu({ data, refresh }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (fn) => {
    setBusy(true);
    await fn();
    await refresh();
    setBusy(false);
  };
  const reset = () => {
    if (!confirm("Delete all past alerts, timeline entries and sent emails? Settings and trusted sites are kept.")) return;
    run(() => post("/api/reset"));
  };

  return (
    <div className="dev" ref={ref}>
      <button className="dev-toggle" aria-expanded={open} aria-controls="dev-panel" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        DEV
      </button>
      {open && (
        <div className="dev-panel" id="dev-panel" role="region" aria-label="Developer tools">
          <h3>Connections</h3>
          <ul className="dev-status">
            <li data-on={data.config.gemini}>{data.config.gemini ? "Gemini on" : "Rules only (add a Gemini key)"}</li>
            <li data-on={data.config.email}>{data.config.email ? "Email on" : "Email in demo mode (add a Resend key)"}</li>
            <li data-on={data.config.voice}>{data.config.voice ? "ElevenLabs voice on" : "Browser voice (add an ElevenLabs key)"}</li>
          </ul>


          <h3>Demo pages</h3>
          <ul className="demo-links">
            <li><a href="/demo/tech-support.html" target="_blank">Fake virus pop-up</a></li>
            <li><a href="/demo/crypto-atm.html" target="_blank">Fake tax office: crypto ATM</a></li>
            <li><a href="/demo/investment.html" target="_blank">Fake crypto investment (pig butchering)</a></li>
            <li><a href="/demo/injection.html" target="_blank">Page that tries to fool the AI</a></li>
            <li><a href="/demo/safe-store.html" target="_blank">Gift card store (quiet, unless right after a scam)</a></li>
            <li><a href="/demo/bank-transfer.html" target="_blank">Bank send-money page (pauses right after a scam)</a></li>
            <li><a href="/demo/lookalike-login.html?kg-host=arnazon.com" target="_blank">Lookalike address: arnazon.com sign-in</a></li>
          </ul>

          <button className="btn btn-danger" onClick={reset} disabled={busy}>
            Delete cache
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      setData(await res.json());
      setError(null);
    } catch {
      setError("Can't reach the KinGuard server. Is npm run dev still running?");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const setStatus = async (id, status) => {
    await post(`/api/alerts/${id}`, { status }, "PATCH");
    await refresh();
  };
  // Highlight alerts that arrive while the dashboard is open, and show it in the tab title.
  const known = useRef(null);
  const [freshIds, setFreshIds] = useState(new Set());
  useEffect(() => {
    if (!data) return;
    const ids = data.alerts.map((a) => a.id);
    if (known.current) {
      const added = ids.filter((id) => !known.current.has(id));
      if (added.length) {
        setFreshIds((prev) => new Set([...prev, ...added]));
        document.title = `(${added.length}) New alert · KinGuard`;
        setTimeout(() => {
          setFreshIds((prev) => new Set([...prev].filter((id) => !added.includes(id))));
          document.title = "KinGuard";
        }, 12000);
      }
    }
    known.current = new Set(ids);
  }, [data]);

  const deleteAlert = async (id) => {
    await post(`/api/alerts/${id}`, {}, "DELETE");
    await refresh();
  };
  const deleteEvent = async (id) => {
    await post(`/api/events/${id}`, {}, "DELETE");
    await refresh();
  };

  // Two views: Alerts (what needs a look) and History (timeline and sent emails).
  // The choice is remembered for this visit (not in the address, which Next.js manages).
  const [view, setView] = useState("alerts");
  useEffect(() => {
    try {
      if (sessionStorage.getItem("kg-view") === "history") setView("history");
    } catch {}
  }, []);
  const show = (v) => {
    setView(v);
    try {
      sessionStorage.setItem("kg-view", v);
    } catch {}
  };

  if (!data) {
    return <main><p>{error || "Loading…"}</p></main>;
  }

  return (
    <>
      <StatusBand data={data} refresh={refresh} />
      <nav className="tabs" aria-label="Dashboard views">
        <button type="button" aria-current={view === "alerts" ? "page" : undefined} onClick={() => show("alerts")}>
          Alerts{data.alerts.some((a) => a.status === "open") ? ` (${data.alerts.filter((a) => a.status === "open").length})` : ""}
        </button>
        <button type="button" aria-current={view === "history" ? "page" : undefined} onClick={() => show("history")}>
          History
        </button>
      </nav>
      {view === "alerts" ? (
        <main className="single">
          <SetupChecklist data={data} />
          <TodayTiles data={data} />
          <About />
          <Alerts data={data} onStatus={setStatus} onDelete={deleteAlert} freshIds={freshIds} />
        </main>
      ) : (
        <main>
          <div className="col">
            <Timeline data={data} onDeleteEvent={deleteEvent} />
          </div>
          <div className="col">
            <Outbox data={data} />
          </div>
        </main>
      )}
    </>
  );
}
