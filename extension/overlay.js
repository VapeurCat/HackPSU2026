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
    .say a { color: #1b5fd1; font-weight: 700; white-space: nowrap; }
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
    .banner a { color: #16302a; font-weight: 700; }
    details.guide { margin: 0 0 20px; border: 1px solid #c9d6d0; border-radius: 12px; background: #f4f8f6; }
    details.guide summary { cursor: pointer; padding: 12px 16px; font-size: 18px; font-weight: 700; list-style: none; }
    details.guide summary::-webkit-details-marker { display: none; }
    details.guide summary::after { content: " ▸"; }
    details.guide[open] summary::after { content: " ▾"; }
    details.guide summary:focus-visible { outline: 3px solid #1b5fd1; outline-offset: 2px; border-radius: 12px; }
    .guide-body { padding: 0 16px 14px; font-size: 17px; line-height: 1.5; }
    .guide-body p { margin: 0 0 10px; }
    .guide-body ul { margin: 0 0 12px; font-size: 17px; }
    .guide-body h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #55706a; margin: 14px 0 6px; }
    .guide-body a { color: #1b5fd1; }
    .guide-body .help { background: #fff; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  `;

  // "What is this scam?" section with plain-language advice and trusted sources.
  function guideHTML(key) {
    const g = KinGuardRules.GUIDES[key] || KinGuardRules.GUIDES.generic;
    const help = KinGuardRules.HELP;
    const link = (s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a></li>`;
    return `<details class="guide">
      <summary>📖 What is this scam? How to stay safe</summary>
      <div class="guide-body">
        <h2>${esc(g.title)}</h2>
        <p>${esc(g.what)}</p>
        <h2>What to do</h2>
        <ul>${g.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <h2>Learn more from trusted sources</h2>
        <ul>${g.sources.map(link).join("")}</ul>
        <div class="help">${esc(help.text)}<ul>${help.links.map(link).join("")}</ul></div>
      </div>
    </details>`;
  }

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

  // On a lookalike address, offer the real site.
  function realSiteLink(v) {
    const official = v.lookalike?.official;
    return official ? ` <a href="https://${esc(official)}" rel="noopener noreferrer">Go to the real ${esc(official)}</a>` : "";
  }

  // Tell the family what the person chose (only once the backend has created an alert).
  function decide(v, decision) {
    if (v.alertId) chrome.runtime.sendMessage({ type: "DECISION", alertId: v.alertId, decision });
  }

  function renderHigh(v, pending) {
    const guideWasOpen = root.querySelector("details.guide")?.open; // keep it open when the AI's answer arrives
    const signs = (v.cues || []).filter((c) => c.quote).slice(0, 5);
    const family = v.familyName || "your family";
    root.innerHTML = `<style>${CSS}</style>
      <div class="scrim" role="alertdialog" aria-modal="true" aria-labelledby="kg-h" aria-describedby="kg-say">
        <div class="card">
          <div class="brand">${SHIELD} KinGuard</div>
          <h1 id="kg-h">Stop. This looks like a scam.</h1>
          <p class="say" id="kg-say">${esc(v.explanationForElder)}${realSiteLink(v)}</p>
          ${
            signs.length
              ? `<p class="signs-h">Warning signs we found</p><ul>${signs
                  .map((c) => `<li>${esc(c.label)}: <mark>&ldquo;${esc(c.quote)}&rdquo;</mark></li>`)
                  .join("")}</ul>`
              : ""
          }
          ${guideHTML(v.guideKey)}
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
    root.querySelector('[data-act="close"]').onclick = () => {
      decide(v, "closed");
      chrome.runtime.sendMessage({ type: "CLOSE_TAB" });
    };
    root.querySelector('[data-act="speak"]').onclick = () => speak(`Stop. This looks like a scam. ${v.explanationForElder}`);
    root.querySelector('[data-act="trust"]').onclick = () => {
      decide(v, "trusted");
      close();
    };
    if (guideWasOpen) root.querySelector("details.guide").open = true;
    else root.querySelector('[data-act="close"]').focus();
  }

  function renderMedium(v) {
    const g = KinGuardRules.GUIDES[v.guideKey] || KinGuardRules.GUIDES.generic;
    const learn = g.sources[0];
    root.innerHTML = `<style>${CSS}</style>
      <div class="banner" role="status">
        ${SHIELD}
        <p><strong>KinGuard:</strong> ${esc(v.explanationForElder || "Something here looks suspicious. Take your time.")}
          ${realSiteLink(v)} <a href="${esc(learn.url)}" target="_blank" rel="noopener noreferrer">Learn more</a></p>
        <button class="secondary" data-act="speak">🔊 Read</button>
        <button class="secondary" data-act="ok">OK</button>
      </div>`;
    root.querySelector('[data-act="ok"]').onclick = close;
    root.querySelector('[data-act="speak"]').onclick = () => speak(v.explanationForElder);
  }

  // "Pause before you pay": a payment page shortly after a scam warning.
  function renderPause(v) {
    const family = v.familyName || "your family";
    const mins = `${v.minutesAgo} minute${v.minutesAgo === 1 ? "" : "s"} ago`;
    const say = `KinGuard warned you about a ${String(v.scamTypeName).toLowerCase()} ${mins}. Scammers often tell people to pay right after, and this page is for ${v.label}. Are you paying because someone asked you to?`;
    root.innerHTML = `<style>${CSS}</style>
      <div class="scrim" role="alertdialog" aria-modal="true" aria-labelledby="kg-h" aria-describedby="kg-say">
        <div class="card">
          <div class="brand">${SHIELD} KinGuard</div>
          <h1 id="kg-h">Wait. Before you pay…</h1>
          <p class="say" id="kg-say">${esc(say)}</p>
          <ul>
            <li>Real companies, banks and government offices never ask for gift cards, crypto or wire transfers.</li>
            <li>If someone is on the phone telling you what to do, hang up.</li>
          </ul>
          ${guideHTML(v.guideKey || "payment")}
          <div class="row">
            <button class="primary" data-act="close">Close this page</button>
            <button class="secondary" data-act="speak">🔊 Read this to me</button>
            <button class="trust" data-act="continue">I'm paying for something else</button>
          </div>
          <div class="family">
            ${v.notified ? `✓ We've let ${esc(family)} know. They'll call you soon. You're not in trouble.` : `Please talk to ${esc(family)} before you pay.`}
          </div>
        </div>
      </div>`;
    root.querySelector('[data-act="close"]').onclick = () => {
      decide(v, "closed");
      chrome.runtime.sendMessage({ type: "CLOSE_TAB" });
    };
    root.querySelector('[data-act="speak"]').onclick = () => speak(`Wait. Before you pay. ${say}`);
    root.querySelector('[data-act="continue"]').onclick = () => {
      decide(v, "continued");
      close();
    };
    root.querySelector('[data-act="close"]').focus();
  }

  function pause(v) {
    if (current?.risk === "high") return; // a scam warning is already showing
    ensureRoot();
    current = { risk: "high" }; // keep the fullscreen guard on
    exitFullscreen();
    renderPause(v);
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

  return { show, pause, close };
})();
