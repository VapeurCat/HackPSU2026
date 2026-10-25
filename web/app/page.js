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
  return { web: "Web page", gmail: "Email", paste: "Checked message", bank: "Bank" }[s] || s;
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

function AlertCard({ alert, data, onStatus, onDelete, startOpen = false }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(startOpen);
  const bodyId = `alert-body-${alert.id}`;
  // One line for the collapsed card: where it happened.
  const where = Object.fromEntries(alert.facts || []);
  const whereText = where["Email from"] ? `Email from ${where["Email from"]}` : where.Website || where.Payment || "";

  const set = async (status) => {
    setBusy(true);
    await onStatus(alert.id, status);
    setBusy(false);
  };

  const statusText = {
    safe: "Marked safe",
    confirmed_scam: "Confirmed scam",
    merged: "Combined into a newer alert",
  }[alert.status];

  return (
    // A collapsed card opens when clicked anywhere; the title button keeps it keyboard-accessible.
    <article
      className="alert"
      data-kind={alert.kind}
      data-status={alert.status}
      data-expanded={expanded}
      onClick={expanded ? undefined : () => setExpanded(true)}
    >
      <div className="alert-top">
        <h3 className="alert-heading">
          <button type="button" className="alert-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((x) => !x)}>
            <span className="alert-title">{alert.title}</span>
            <span className="when">{timeOf(alert.ts)}</span>
            <span className="chevron" aria-hidden="true">▾</span>
          </button>
        </h3>
        <DeleteButton label={`alert: ${alert.title}`} onDelete={() => onDelete(alert.id)} />
      </div>
      {!expanded && (
        <p className="alert-summary">
          {statusText && <span className="status-pill">{statusText}</span>}
          {whereText}
          {alert.decision && ` · ${data.person.name} ${{ closed: "closed the page", continued: "continued anyway", trusted: "trusted the page" }[alert.decision]}`}
        </p>
      )}
      {expanded && (
      <div id={bodyId}>
      <p>{alert.explanation}</p>

      {alert.decision && (
        <p className="decision" data-decision={alert.decision}>
          {data.person.name}{" "}
          {{ closed: "closed the page", continued: "chose to continue anyway", trusted: "clicked “I trust this page” and stayed on it" }[alert.decision]}{" "}
          at {timeOf(alert.decidedAt)}.
        </p>
      )}

      {alert.facts?.length > 0 && (
        <dl className="facts">
          {alert.facts.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}

      {alert.excerpt && (
        <details className="saw">
          <summary>What {data.person.name} saw</summary>
          <blockquote>{alert.excerpt}</blockquote>
        </details>
      )}


      <Signs cues={alert.cues} />

      <Guide guide={data.guides?.[alert.guideKey]} help={data.help} />

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
        <div className="actions">
          <span className="when">{statusText}</span>
          {alert.status !== "merged" && (
            <button className="btn" disabled={busy} onClick={() => set("open")}>
              Reopen
            </button>
          )}
        </div>
      )}

      {alert.notified?.length > 0 && (
        <div className="notified">
          {data.family[0]?.name || "Family"} alerted at {timeOf(alert.notified[0].ts)} by{" "}
          email ({alert.notified[0].status})
        </div>
      )}
      </div>
      )}
    </article>
  );
}

const ALERTS_SHOWN = 4;

function Alerts({ data, onStatus, onDelete }) {
  const [showAll, setShowAll] = useState(false);
  const open = data.alerts.filter((a) => a.status === "open");
  const closed = data.alerts.filter((a) => a.status !== "open");
  const all = [...open, ...closed];
  const shown = showAll ? all : all.slice(0, ALERTS_SHOWN);
  const hidden = all.length - shown.length;
  return (
    <section aria-labelledby="alerts-h">
      <h2 id="alerts-h">Alerts</h2>
      <p className="section-note">High-risk moments worth a closer look.</p>
      {open.length === 0 && <div className="empty">No open alerts. You'll see one here, and get an email, the moment something looks like a scam.</div>}
      {shown.map((a) => (
        <AlertCard key={a.id} alert={a} data={data} onStatus={onStatus} onDelete={onDelete} startOpen={a.id === open[0]?.id} />
      ))}
      {(hidden > 0 || showAll) && all.length > ALERTS_SHOWN && (
        <button type="button" className="btn more" onClick={() => setShowAll((x) => !x)}>
          {showAll ? "Show fewer" : `Show ${hidden} more alert${hidden === 1 ? "" : "s"}`}
        </button>
      )}
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

  const items = useMemo(() => {
    const evs = data.events.map((e) => ({ ...e, kind: e.type === "payment_attempt" ? "money" : e.source === "gmail" ? "email" : "scam" }));
    return evs
      .filter((i) => filter === "all" || i.kind === filter || (filter === "scam" && i.kind === "email"))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 40);
  }, [data, filter]);

  return (
    <section aria-labelledby="tl-h">
      <h2 id="tl-h">{data.person.name}'s timeline</h2>
      <p className="section-note">Every warning in one place, so the clues can be connected.</p>
      <div className="filters" role="group" aria-label="Filter timeline">
        {FILTERS.map(([key, label]) => (
          <button key={key} className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <ol className="timeline">
          {items.map((i) => (
            <li key={i.id} data-risk={i.risk}>
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
                {whenOf(i.ts)}, {sourceName(i.source).toLowerCase()}
                {i.scamTypeName ? `: ${i.scamTypeName}` : ""}
                {i.stage ? ` (pig butchering stage ${i.stage} of 4)` : ""}
              </div>
              {i.explanationForFamily && <div className="tl-body">{i.explanationForFamily}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
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
  const deleteAlert = async (id) => {
    await post(`/api/alerts/${id}`, {}, "DELETE");
    await refresh();
  };
  const deleteEvent = async (id) => {
    await post(`/api/events/${id}`, {}, "DELETE");
    await refresh();
  };

  // Two views: Alerts (what needs a look) and History (timeline and sent emails). The address keeps the choice.
  const [view, setView] = useState("alerts");
  useEffect(() => {
    const fromHash = () => setView(location.hash === "#history" ? "history" : "alerts");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const show = (v) => {
    setView(v);
    history.replaceState(null, "", v === "history" ? "#history" : location.pathname);
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
          <About />
          <Alerts data={data} onStatus={setStatus} onDelete={deleteAlert} />
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
