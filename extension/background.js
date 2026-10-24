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

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "ANALYZE") {
    call("/api/analyze", { source: "web", url: msg.url, title: msg.title, text: msg.text })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true; // keep the channel open for the async reply
  }

  if (msg.type === "SCRUTINIZE") {
    call("/api/scrutinize", { sender: msg.sender, subject: msg.subject, text: msg.text })
      .then(reply)
      .catch((e) => reply({ error: e.message }));
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
