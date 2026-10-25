// KinGuard toolbar pop-up: protection status, today's counts, this site's status, and quick actions.
const API = "http://localhost:3000";
const $ = (id) => document.getElementById(id);

function timeOf(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url || "");
    return /^https?:$/.test(url.protocol) ? url.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

async function showPaused() {
  const { pausedUntil } = await chrome.storage.local.get("pausedUntil");
  const paused = pausedUntil && pausedUntil > Date.now();
  $("head").dataset.state = paused ? "paused" : "on";
  $("state").textContent = paused ? `Paused until ${timeOf(pausedUntil)}` : "Protection is on";
  $("pause").textContent = paused ? "Turn protection back on" : "Pause for 1 hour";
  return paused;
}

async function showStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const s = await res.json();
    $("pages").textContent = s.today.pages;
    $("emails").textContent = s.today.emails;
  } catch {
    // Show this browser's own counts when the dashboard server isn't running.
    const { localStats } = await chrome.storage.local.get("localStats");
    const today = localStats?.[new Date().toDateString()] || { pages: 0, emails: 0 };
    $("pages").textContent = today.pages;
    $("emails").textContent = today.emails;
    $("note").textContent = "The dashboard server isn't running. Warnings still work with KinGuard's built-in rules.";
  }
}

async function showSite(paused) {
  const host = await currentHost();
  if (!host || host === "localhost") return;
  $("site").hidden = false;
  $("host").textContent = host;
  const look = KinGuardRules.lookalikeDomain(host);
  const { trusted } = await chrome.runtime.sendMessage({ type: "IS_TRUSTED", host }).catch(() => ({ trusted: false }));
  if (look) {
    $("site").dataset.tone = "danger";
    $("verdict").textContent = `Careful: this address imitates ${look.official}.`;
  } else if (trusted) {
    $("verdict").textContent = "You trusted this site. Yellow notices are off here; red warnings still show.";
    $("untrust").hidden = false;
  } else if (paused) {
    $("site").dataset.tone = "warn";
    $("verdict").textContent = "Not being checked while KinGuard is paused.";
  } else {
    $("verdict").textContent = "KinGuard is checking this site.";
  }
  $("untrust").onclick = async () => {
    await fetch(`${API}/api/trusted`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) }).catch(() => {});
    await chrome.runtime.sendMessage({ type: "IS_TRUSTED", host }).catch(() => {}); // refresh the saved copy
    $("untrust").hidden = true;
    $("verdict").textContent = "KinGuard is checking this site again.";
  };
}

$("open").onclick = () => chrome.tabs.create({ url: API });

$("pause").onclick = async () => {
  const { pausedUntil } = await chrome.storage.local.get("pausedUntil");
  const paused = pausedUntil && pausedUntil > Date.now();
  const until = paused ? 0 : Date.now() + 60 * 60 * 1000;
  await chrome.storage.local.set({ pausedUntil: until });
  // Pausing is shown on the shared dashboard, so it's never a secret.
  chrome.runtime.sendMessage({ type: "ACTIVITY", activity: paused ? "resumed" : "paused", until }).catch(() => {});
  const nowPaused = await showPaused();
  $("note").textContent = nowPaused ? "Paused. This is noted on the KinGuard dashboard." : "Protection is back on.";
};

(async () => {
  const paused = await showPaused();
  await Promise.all([showStats(), showSite(paused)]);
})();
