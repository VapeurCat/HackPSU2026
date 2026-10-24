"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function StatusBand({ data }) {
  const name = data.person.name;
  const family = data.family[0]?.name || "you";
  const open = data.alerts.filter((a) => a.status === "open");
  const correlated = open.find((a) => a.kind === "correlated");
  const recentMedium = data.events.some((e) => e.risk === "medium" && Date.now() - Date.parse(e.ts) < 24 * 3600e3);

  let level = "safe";
  let line = `${name} looks safe.`;
  let sub = "No scam warnings right now. KinGuard is watching the browser, email and bank activity.";

  if (correlated) {
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
          <span className="config" aria-label="Connections">
            <span>{data.config.gemini ? "Gemini on" : "Rules only (add a Gemini key)"}</span>
            <span>{data.config.email ? "Email on" : "Email in demo mode"}</span>
          </span>
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

function AlertCard({ alert, data, onStatus }) {
  const events = alert.eventIds.map((id) => data.events.find((e) => e.id === id)).filter(Boolean);
  const txs = (alert.txIds || []).map((id) => data.transactions.find((t) => t.id === id)).filter(Boolean);
  const [busy, setBusy] = useState(false);

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
    <article className="alert" data-kind={alert.kind} data-status={alert.status}>
      <div className="alert-head">
        <h3 className="alert-title">{alert.kind === "correlated" ? `🚨 ${alert.title}` : alert.title}</h3>
        <span className="when">{timeOf(alert.ts)}</span>
      </div>
      <p>{alert.explanation}</p>

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
          Family emailed at {timeOf(alert.notified[0].ts)} ({alert.notified[0].status})
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
      {open.map((a) => (
        <AlertCard key={a.id} alert={a} data={data} onStatus={onStatus} />
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
    const evs = data.events.map((e) => ({ ...e, kind: e.type === "transaction_flag" ? "money" : e.source === "gmail" ? "email" : "scam" }));
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

function MoneyWatch({ data, refresh }) {
  const [busy, setBusy] = useState(false);
  const simulate = async (preset) => {
    setBusy(true);
    await post("/api/transactions", { preset });
    await refresh();
    setBusy(false);
  };
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
        <div className="sim" aria-label="Simulate a purchase">
          <button className="btn" disabled={busy} onClick={() => simulate("giftcards")}>
            Simulate $500 gift cards
          </button>
          <button className="btn" disabled={busy} onClick={() => simulate("cryptoatm")}>
            Simulate $2,000 crypto ATM
          </button>
          <button className="btn" disabled={busy} onClick={() => simulate("zelle")}>
            Simulate $1,200 Zelle
          </button>
          <button className="btn" disabled={busy} onClick={() => simulate("groceries")}>
            Simulate normal groceries
          </button>
        </div>
      </div>
    </section>
  );
}

function CheckMessage({ refresh }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const r = await post("/api/analyze", { source: "paste", text });
    setResult(r);
    setBusy(false);
    refresh();
  };

  return (
    <section aria-labelledby="check-h">
      <h2 id="check-h">Check a message</h2>
      <p className="section-note">Paste a text, chat or letter. Works for slow scams like pig butchering too.</p>
      <label htmlFor="msg" className="section-note" style={{ display: "block", margin: "0 0 6px" }}>
        Message to check
      </label>
      <textarea id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the message here" />
      <div className="actions">
        <button className="btn btn-primary" onClick={check} disabled={busy || !text.trim()}>
          {busy ? "Checking…" : "Check this message"}
        </button>
      </div>
      {result && !result.error && (
        <div className="verdict" data-risk={result.risk} aria-live="polite">
          <strong>
            {result.risk === "high" ? "Likely scam" : result.risk === "medium" ? "Suspicious" : "Looks OK"}
            {result.scamTypeName ? `: ${result.scamTypeName}` : ""}
          </strong>
          {result.explanationForElder}
          {result.stage && (
            <>
              <div className="stage" aria-label={`Pig butchering stage ${result.stage} of 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} data-on={n <= result.stage} />
                ))}
              </div>
              <div className="tl-meta">
                Pig butchering stage {result.stage} of 4:{" "}
                {["friendly stranger", "building trust", "investment pitch", "pressure to pay"][result.stage - 1]}
              </div>
            </>
          )}
          <Signs cues={result.cues} />
        </div>
      )}
      {result?.error && <div className="verdict" data-risk="medium">{result.error}</div>}
    </section>
  );
}

function Outbox({ data }) {
  return (
    <section aria-labelledby="out-h">
      <h2 id="out-h">Emails to {data.family[0]?.name || "family"}</h2>
      <p className="section-note">
        {data.config.email ? "Sent through Resend." : "Demo mode: emails are recorded here. Add a Resend key to send them for real."}
      </p>
      <div className="panel">
        {data.outbox.length === 0 && <div className="tl-meta">No emails yet.</div>}
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

function DemoTools({ refresh }) {
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!confirm("Clear all alerts, timeline events and emails?")) return;
    setBusy(true);
    await post("/api/reset");
    await refresh();
    setBusy(false);
  };
  return (
    <section aria-labelledby="demo-h">
      <h2 id="demo-h">Demo pages</h2>
      <p className="section-note">Fictional scam pages for testing the extension. Open them in another window.</p>
      <ul className="demo-links">
        <li><a href="/demo/tech-support.html" target="_blank">Fake virus pop-up</a></li>
        <li><a href="/demo/crypto-atm.html" target="_blank">Fake tax office: crypto ATM</a></li>
        <li><a href="/demo/investment.html" target="_blank">Fake crypto investment (pig butchering)</a></li>
        <li><a href="/demo/injection.html" target="_blank">Page that tries to fool the AI</a></li>
        <li><a href="/demo/safe-store.html" target="_blank">Normal gift card store (should stay quiet)</a></li>
      </ul>
      <button className="btn btn-danger" onClick={reset} disabled={busy}>
        Reset demo
      </button>
    </section>
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
      <StatusBand data={data} />
      <main>
        <div className="col">
          <Alerts data={data} onStatus={setStatus} />
          <Timeline data={data} />
        </div>
        <div className="col">
          <MoneyWatch data={data} refresh={refresh} />
          <CheckMessage refresh={refresh} />
          <Outbox data={data} />
          <DemoTools refresh={refresh} />
        </div>
      </main>
    </>
  );
}
