// KinGuard background worker: the only part of the extension that talks to the backend.
// The Gemini key lives on the backend, never here.
const API = "http://localhost:3000";

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KinGuard server returned ${res.status}`);
  return res.json();
}

// Trusted sites come from the backend, with a copy kept in the browser for when the server is offline.
async function trustedHosts() {
  try {
    const res = await fetch(`${API}/api/trusted`);
    if (!res.ok) throw new Error(String(res.status));
    const { hosts } = await res.json();
    await chrome.storage.local.set({ trustedHosts: hosts });
    return hosts;
  } catch {
    const { trustedHosts: saved } = await chrome.storage.local.get("trustedHosts");
    return saved || [];
  }
}

// Counts of pages and emails checked, kept in the browser too so the pop-up works offline.
// Only the counts are sent to the dashboard: never which pages or emails.
async function bumpLocal(kind) {
  const day = new Date().toDateString();
  const { localStats = {} } = await chrome.storage.local.get("localStats");
  const today = localStats[day] || { pages: 0, emails: 0 };
  today[kind === "email" ? "emails" : "pages"] += 1;
  await chrome.storage.local.set({ localStats: { [day]: today } }); // keep only today
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "COUNT") {
    bumpLocal(msg.kind);
    call("/api/stats", { kind: msg.kind }).catch(() => {});
    return;
  }

  if (msg.type === "ACTIVITY") {
    call("/api/activity", { activity: msg.activity, until: msg.until })
      .then(reply)
      .catch(() => reply({ ok: false }));
    return true;
  }

  if (msg.type === "IS_TRUSTED") {
    const host = String(msg.host || "").toLowerCase().replace(/^www\./, "");
    trustedHosts()
      .then((hosts) => reply({ trusted: hosts.includes(host) }))
      .catch(() => reply({ trusted: false }));
    return true;
  }

  if (msg.type === "TRUST_SITE") {
    call("/api/trusted", { host: msg.host })
      .then(async (r) => {
        await trustedHosts(); // refresh the browser's copy
        reply(r);
      })
      .catch((e) => reply({ error: e.message }));
    return true;
  }

  if (msg.type === "ANALYZE") {
    call("/api/analyze", { source: "web", url: msg.url, title: msg.title, text: msg.text, sensitiveForm: msg.sensitiveForm })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true; // keep the channel open for the async reply
  }

  if (msg.type === "EMAIL_CHECK") {
    call("/api/analyze", { source: "gmail", sender: msg.sender, subject: msg.subject, text: msg.text })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true;
  }

  if (msg.type === "SCRUTINIZE") {
    call("/api/scrutinize", { sender: msg.sender, subject: msg.subject, text: msg.text })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true;
  }

  if (msg.type === "PAY_CHECK") {
    call("/api/pay-check", { url: msg.url, title: msg.title, kind: msg.kind, label: msg.label })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true;
  }

  if (msg.type === "DECISION") {
    call("/api/decision", { alertId: msg.alertId, decision: msg.decision })
      .then(reply)
      .catch(() => reply({ ok: false }));
    return true;
  }

  if (msg.type === "SPEAK") {
    call("/api/speak", { text: msg.text })
      .then(reply)
      .catch(() => reply({ audio: null }));
    return true;
  }

  if (msg.type === "CLOSE_TAB" && sender.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }
});
