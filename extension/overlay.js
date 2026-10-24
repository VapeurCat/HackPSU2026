// KinGuard warning UI. Lives in a shadow root so scam pages can't restyle or hide it.
const KinGuardUI = (() => {
  let host = null;
  let root = null;
  let current = null;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .scrim { position: fixed; inset: 0; z-index: 2147483647; background: rgba(22,48,42,.92);
      display: flex; align-items: center; justify-content: center; padding: 24px;
      font-family: "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif; color: #16302a; }
    .card { background: #fff; border-radius: 18px; max-width: 640px; width: 100%; max-height: 92vh; overflow: auto;
      padding: 32px 34px 26px; box-shadow: 0 20px 60px rgba(0,0,0,.35); border-top: 10px solid #b42318; }
    .card.medium { border-top-color: #c98a12; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; color: #55706a; margin-bottom: 14px; }
    h1 { font-size: 34px; line-height: 1.15; margin: 0 0 14px; }
    .say { font-size: 22px; line-height: 1.45; margin: 0 0 18px; }
    .signs-h { font-weight: 700; font-size: 17px; margin: 0 0 8px; }
    ul { margin: 0 0 20px; padding-left: 22px; font-size: 17px; line-height: 1.5; }
    li { margin-bottom: 4px; }
    mark { background: #ffe08a; color: #16302a; padding: 0 3px; border-radius: 3px; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    button { font: inherit; font-size: 20px; font-weight: 700; border-radius: 10px; padding: 14px 22px; cursor: pointer; border: 2px solid #16302a; }
    .primary { background: #16302a; color: #fff; }
    .secondary { background: #fff; color: #16302a; }
    .trust { background: none; border: 0; padding: 6px 2px; font-size: 15px; font-weight: 400; text-decoration: underline; color: #55706a; margin-left: auto; }
    button:focus-visible { outline: 3px solid #1b5fd1; outline-offset: 3px; }
    .family { margin-top: 18px; padding-top: 14px; border-top: 1px solid #c9d6d0; font-size: 17px; color: #23784f; font-weight: 700; }
    .family.pending { color: #55706a; font-weight: 400; }
    .banner { position: fixed; left: 16px; right: 16px; top: 16px; z-index: 2147483647; background: #fbf0dc; color: #16302a;
      border: 2px solid #c98a12; border-radius: 12px; padding: 14px 18px; display: flex; gap: 14px; align-items: center;
      font-family: "Atkinson Hyperlegible", system-ui, sans-serif; font-size: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.2); }
    .banner p { margin: 0; flex: 1; }
    .banner button { font-size: 16px; padding: 8px 14px; }
  `;

  const SHIELD = `<svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5 4.5 7v8.2c0 7 4.8 12.4 11.5 14.3 6.7-1.9 11.5-7.3 11.5-14.3V7L16 2.5Z" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>`;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function ensureRoot() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement("kinguard-warning");
    root = host.attachShadow({ mode: "closed" });
    document.documentElement.appendChild(host);
  }

  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    if (current?.risk === "high") exitFullscreen(); // scam pages love fullscreen; keep our warning visible
  });

  function speak(text) {
    chrome.runtime.sendMessage({ type: "SPEAK", text }, (r) => {
      if (r?.audio) {
        new Audio(r.audio).play().catch(() => fallbackSpeak(text));
      } else {
        fallbackSpeak(text);
      }
    });
  }
  function fallbackSpeak(text) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function close() {
    if (host) host.remove();
    host = null;
    current = null;
  }

  function renderHigh(v, pending) {
    const signs = (v.cues || []).filter((c) => c.quote).slice(0, 5);
    const family = v.familyName || "your family";
    root.innerHTML = `<style>${CSS}</style>
      <div class="scrim" role="alertdialog" aria-modal="true" aria-labelledby="kg-h" aria-describedby="kg-say">
        <div class="card">
          <div class="brand">${SHIELD} KinGuard</div>
          <h1 id="kg-h">Stop. This looks like a scam.</h1>
          <p class="say" id="kg-say">${esc(v.explanationForElder)}</p>
          ${
            signs.length
              ? `<p class="signs-h">Warning signs we found</p><ul>${signs
                  .map((c) => `<li>${esc(c.label)}: <mark>&ldquo;${esc(c.quote)}&rdquo;</mark></li>`)
                  .join("")}</ul>`
              : ""
          }
          <div class="row">
            <button class="primary" data-act="close">Close this page</button>
            <button class="secondary" data-act="speak">🔊 Read this to me</button>
            <button class="trust" data-act="trust">I trust this page</button>
          </div>
          <div class="family ${pending ? "pending" : ""}">
            ${pending ? "Checking with KinGuard…" : v.notified ? `✓ We've let ${esc(family)} know. You're not in trouble.` : "Talk to a family member before you pay, call, or share anything."}
          </div>
        </div>
      </div>`;
    root.querySelector('[data-act="close"]').onclick = () => chrome.runtime.sendMessage({ type: "CLOSE_TAB" });
    root.querySelector('[data-act="speak"]').onclick = () => speak(`Stop. This looks like a scam. ${v.explanationForElder}`);
    root.querySelector('[data-act="trust"]').onclick = close;
    root.querySelector('[data-act="close"]').focus();
  }

  function renderMedium(v) {
    root.innerHTML = `<style>${CSS}</style>
      <div class="banner" role="status">
        ${SHIELD}
        <p><strong>KinGuard:</strong> ${esc(v.explanationForElder || "Something here looks suspicious. Take your time.")}</p>
        <button class="secondary" data-act="speak">🔊 Read</button>
        <button class="secondary" data-act="ok">OK</button>
      </div>`;
    root.querySelector('[data-act="ok"]').onclick = close;
    root.querySelector('[data-act="speak"]').onclick = () => speak(v.explanationForElder);
  }

  function show(v, { pending = false } = {}) {
    if (!v || v.risk === "low") return;
    // Never downgrade an open high-risk warning to a banner.
    if (current?.risk === "high" && v.risk !== "high") return;
    ensureRoot();
    current = v;
    if (v.risk === "high") {
      exitFullscreen();
      renderHigh(v, pending);
    } else {
      renderMedium(v);
    }
  }

  return { show, close };
})();
