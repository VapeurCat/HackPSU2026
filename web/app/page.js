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
function money(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const correlated = open.find((a) => a.kind === "correlated");
  const paying = open.find((a) => a.kind === "pay_attempt");
  const recentMedium = data.events.some((e) => e.risk === "medium" && Date.now() - Date.parse(e.ts) < 24 * 3600e3);

  let level = "safe";
  let line = `${name} looks safe.`;
  let sub = "No scam warnings right now. KinGuard is watching the browser, email and bank activity.";

  if (paying && !correlated) {
    level = "danger";
    line = `${name} may be about to pay a scammer.`;
    sub = `KinGuard paused a payment page at ${timeOf(paying.ts)} and alerted ${family}. Call ${name} now.`;
  } else if (correlated) {
    level = "danger";
    line = `${name} may be in a scam right now.`;
    sub = `${correlated.title}. ${family} was emailed at ${timeOf(correlated.ts)}. Call ${name} before more money moves.`;
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

function AlertCard({ alert, data, onStatus, startOpen = false }) {
  const events = alert.eventIds.map((id) => data.events.find((e) => e.id === id)).filter(Boolean);
  const txs = (alert.txIds || []).map((id) => data.transactions.find((t) => t.id === id)).filter(Boolean);
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
    <article className="alert" data-kind={alert.kind} data-status={alert.status} data-expanded={expanded}>
      <h3 className="alert-heading">
        <button type="button" className="alert-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((x) => !x)}>
          <span className="alert-title">{alert.kind === "correlated" ? `🚨 ${alert.title}` : alert.title}</span>
          <span className="when">{timeOf(alert.ts)}</span>
          <span className="chevron" aria-hidden="true">▾</span>
        </button>
      </h3>
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

      {alert.kind === "correlated" && (
        <ol className="chain" aria-label="What happened">
          {events.map((e) => (
            <li key={e.id}>
              ⚠️ {timeOf(e.ts)}: {e.scamTypeName} ({sourceName(e.source).toLowerCase()}: {e.title})
            </li>
          ))}
          <li className="gap">
            {alert.minutesApart} minute{alert.minutesApart === 1 ? "" : "s"} apart
          </li>
          {txs.map((t) => (
            <li key={t.id}>
              💸 {timeOf(t.ts)}: {money(t.amount)} at {t.merchant}
            </li>
          ))}
        </ol>
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
          {[...new Set(alert.notified.map((n) => ({ sms: "text", call: "phone call" })[n.channel] || "email"))].join(", ")} ({alert.notified[0].status})
        </div>
      )}
      </div>
      )}
    </article>
  );
}

function Alerts({ data, onStatus }) {
  const open = data.alerts.filter((a) => a.status === "open");
  const closed = data.alerts.filter((a) => a.status !== "open").slice(0, 3);
  return (
    <section aria-labelledby="alerts-h">
      <h2 id="alerts-h">Alerts</h2>
      <p className="section-note">High-risk moments that need a family member's attention.</p>
      {open.length === 0 && <div className="empty">No open alerts. You'll see one here, and get an email, the moment something looks like a scam.</div>}
      {open.map((a, i) => (
        <AlertCard key={a.id} alert={a} data={data} onStatus={onStatus} startOpen={i === 0} />
      ))}
      {closed.map((a) => (
        <AlertCard key={a.id} alert={a} data={data} onStatus={onStatus} />
      ))}
    </section>
  );
}

const FILTERS = [
  ["all", "Everything"],
  ["scam", "Scam checks"],
  ["money", "Money"],
  ["email", "Email"],
];

function Timeline({ data }) {
  const [filter, setFilter] = useState("all");

  const items = useMemo(() => {
    const evs = data.events.map((e) => ({ ...e, kind: e.type === "transaction_flag" || e.type === "payment_attempt" ? "money" : e.source === "gmail" ? "email" : "scam" }));
    const flaggedTxIds = new Set(data.events.filter((e) => e.txId).map((e) => e.txId));
    const txs = data.transactions
      .filter((t) => !flaggedTxIds.has(t.id))
      .map((t) => ({ id: t.id, ts: t.ts, kind: "money", risk: "low", title: `${money(t.amount)} at ${t.merchant}`, source: "bank", scamTypeName: t.category }));
    return [...evs, ...txs]
      .filter((i) => filter === "all" || i.kind === filter || (filter === "scam" && i.kind === "email"))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 40);
  }, [data, filter]);

  return (
    <section aria-labelledby="tl-h">
      <h2 id="tl-h">{data.person.name}'s timeline</h2>
      <p className="section-note">Every warning and payment in one place, so the clues can be connected.</p>
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

function MoneyWatch({ data }) {
  return (
    <section aria-labelledby="money-h">
      <h2 id="money-h">Money watch</h2>
      <p className="section-note">Gift cards, crypto, wires and payment apps to new people get flagged.</p>
      <div className="panel">
        <table className="tx">
          <tbody>
            {data.transactions.slice(0, 8).map((t) => (
              <tr key={t.id} data-flag={t.flagged ? t.flagSeverity : undefined}>
                <td>
                  {t.merchant}
                  {t.flagged && <span className="flag">{t.flagReason}</span>}
                  <span className="tl-meta">{whenOf(t.ts)}</span>
                </td>
                <td className="amt">{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Outbox({ data }) {
  return (
    <section aria-labelledby="out-h">
      <h2 id="out-h">Alerts sent to {data.family[0]?.name || "family"}</h2>
      <p className="section-note">
        {data.config.email || data.config.phone ? "Emails, texts and calls KinGuard sent." : "Alerts are saved here while email and phone sending are off."}
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
      phone: c.phone || "",
      alerts: { email: true, text: true, call: true, ...(c.alerts || {}) },
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
        contact: { name: form.name, relation: form.relation, email: form.email, phone: form.phone, alerts: form.alerts },
      }),
    });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErrors(out.errors || {});
      return false;
    }
    setErrors({});
    setForm((f) => ({ ...f, phone: out.contact.phone }));
    setSaved(true);
    await refresh();
    return true;
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
              {field("phone", "Mobile phone", { type: "tel", placeholder: "(814) 555-0123", autoComplete: "off" })}
            </fieldset>

            <fieldset>
              <legend>How to alert them</legend>
              <label className="set-check">
                <input type="checkbox" checked={form.alerts.email} onChange={(e) => setAlert("email", e.target.checked)} />
                <span>
                  <strong>Email</strong> for every likely scam
                  <small>{data.config.emailKey ? "Email sending is set up." : "Demo mode: emails are saved on the dashboard until a Resend key is added."}</small>
                </span>
              </label>
              <label className="set-check">
                <input type="checkbox" checked={form.alerts.text} onChange={(e) => setAlert("text", e.target.checked)} />
                <span>
                  <strong>Text message</strong> for the most urgent alerts
                  <small>{data.config.phoneKeys ? "Texts and calls are set up." : "Demo mode: texts are saved on the dashboard until Twilio keys are added."}</small>
                </span>
              </label>
              <label className="set-check">
                <input type="checkbox" checked={form.alerts.call} onChange={(e) => setAlert("call", e.target.checked)} />
                <span>
                  <strong>Phone call</strong> for the most urgent alerts
                  <small>The most urgent alerts: about to pay, or paid, right after a scam warning.</small>
                </span>
              </label>
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
  const simulate = (preset) => run(() => post("/api/transactions", { preset }));
  const reset = () => {
    if (!confirm("Clear all alerts, timeline events and emails?")) return;
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
            <li data-on={data.config.phone}>{data.config.phone ? "Texts and calls on" : "Texts and calls in demo mode (add Twilio keys)"}</li>
            <li data-on={data.config.voice}>{data.config.voice ? "ElevenLabs voice on" : "Browser voice (add an ElevenLabs key)"}</li>
          </ul>

          <h3>Simulate a purchase</h3>
          <div className="sim">
            <button className="btn" disabled={busy} onClick={() => simulate("giftcards")}>$500 gift cards</button>
            <button className="btn" disabled={busy} onClick={() => simulate("cryptoatm")}>$2,000 crypto ATM</button>
            <button className="btn" disabled={busy} onClick={() => simulate("zelle")}>$1,200 Zelle</button>
            <button className="btn" disabled={busy} onClick={() => simulate("groceries")}>Normal groceries</button>
          </div>

          <h3>Demo pages</h3>
          <ul className="demo-links">
            <li><a href="/demo/tech-support.html" target="_blank">Fake virus pop-up</a></li>
            <li><a href="/demo/crypto-atm.html" target="_blank">Fake tax office: crypto ATM</a></li>
            <li><a href="/demo/investment.html" target="_blank">Fake crypto investment (pig butchering)</a></li>
            <li><a href="/demo/injection.html" target="_blank">Page that tries to fool the AI</a></li>
            <li><a href="/demo/safe-store.html" target="_blank">Gift card store (quiet, unless right after a scam)</a></li>
            <li><a href="/demo/bank-transfer.html" target="_blank">Bank: send money (pauses right after a scam)</a></li>
            <li><a href="/demo/lookalike-login.html?kg-host=arnazon.com" target="_blank">Lookalike address: arnazon.com sign-in</a></li>
          </ul>

          <button className="btn btn-danger" onClick={reset} disabled={busy}>
            Reset demo
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

  if (!data) {
    return <main><p>{error || "Loading…"}</p></main>;
  }

  return (
    <>
      <StatusBand data={data} refresh={refresh} />
      <main>
        <div className="col">
          <Alerts data={data} onStatus={setStatus} />
          <Timeline data={data} />
        </div>
        <div className="col">
          <MoneyWatch data={data} />
          <Outbox data={data} />
        </div>
      </main>
    </>
  );
}
