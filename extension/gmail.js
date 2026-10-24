// KinGuard for Gmail: checks every opened email quietly, warning inside the email only if it looks like a scam,
// and adds a "Scrutinize this email" button that runs the AI check and always emails the trusted family member.
// Gmail's class names (.a3s, .gD, h2.hP) are unofficial and may change; they work as of now.
(() => {
  const STYLE = {
    bar: "margin:10px 0 14px;padding:12px 14px;border:1px solid #c9d6d0;border-radius:10px;background:#edf2ef;font:16px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;color:#16302a",
    btn: "font:700 16px system-ui,sans-serif;padding:10px 18px;border-radius:8px;border:0;background:#16302a;color:#fff;cursor:pointer",
    result: "margin-top:10px",
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function findSender(body) {
    const msg = body.closest(".adn") || document;
    const el = msg.querySelector(".gD");
    return el ? `${el.getAttribute("name") || el.innerText} <${el.getAttribute("email") || ""}>` : "";
  }

  // Plain-language advice and trusted sources for the scam type (from rules.js).
  function guideLinks(v) {
    const g = v.risk !== "low" && KinGuardRules.GUIDES[v.guideKey || "generic"];
    if (!g) return "";
    const a = (s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" style="color:#1b5fd1">${esc(s.name)}</a></li>`;
    return `<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">📖 What is this scam? How to stay safe</summary>
      <div style="margin-top:6px"><strong>${esc(g.title)}</strong><div>${esc(g.what)}</div>
      <ul style="margin:6px 0;padding-left:20px">${g.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <div style="font-weight:700">Learn more</div><ul style="margin:4px 0;padding-left:20px">${g.sources.map(a).join("")}</ul>
      <div style="font-size:14px">${esc(KinGuardRules.HELP.text)}</div><ul style="margin:4px 0;padding-left:20px;font-size:14px">${KinGuardRules.HELP.links.map(a).join("")}</ul></div></details>`;
  }

  function render(result, v, { auto = false } = {}) {
    if (!v || v.error) {
      result.innerHTML = "Couldn't check right now. Ask a family member before you act on this email.";
      return;
    }
    const icon = v.risk === "high" ? "⚠️" : v.risk === "medium" ? "🟡" : "✅";
    const head = v.risk === "high" ? "This looks like a scam." : v.risk === "medium" ? "Be careful with this email." : "This email looks OK.";
    const signs = (v.cues || [])
      .filter((c) => c.quote)
      .slice(0, 4)
      .map((c) => `<li>${esc(c.label)}: <mark style="background:#ffe08a;padding:0 3px">&ldquo;${esc(c.quote)}&rdquo;</mark></li>`)
      .join("");
    result.innerHTML = `
      <div style="font-size:18px;font-weight:700">${icon} ${head}</div>
      <div>${esc(v.explanationForElder || "")}</div>
      ${signs ? `<ul style="margin:8px 0 0;padding-left:20px">${signs}</ul>` : ""}
      ${guideLinks(v)}
      ${
        v.notified
          ? `<div style="margin-top:8px;color:#23784f;font-weight:700">✓ ${auto ? `We've let ${esc(v.familyName || "your family")} know. You're not in trouble.` : `We sent this to ${esc(v.familyName || "your family")} for a second opinion.`}</div>`
          : ""
      }`;
  }

  // Every opened email is checked on this computer first, for free. Only suspicious ones go to
  // KinGuard's server for the AI check, and a warning appears inside the email only if something is wrong.
  function autoCheck(body, bar, result) {
    const sender = findSender(body);
    const subject = document.querySelector("h2.hP")?.innerText || "";
    const text = `Subject: ${subject}\n\n${body.innerText.slice(0, 12000)}`;
    const local = KinGuardRules.analyze(text, { sender });
    if (local.risk === "low") return;

    const plain = bar.style.cssText;
    const warn = (v) => {
      bar.style.borderColor = v.risk === "high" ? "#b42318" : "#c98a12";
      bar.style.background = v.risk === "high" ? "#fce9e7" : "#fbf0dc";
      render(result, v, { auto: true });
    };
    if (local.risk === "high") warn(local); // show right away, then add the AI's explanation

    chrome.runtime.sendMessage({ type: "EMAIL_CHECK", sender, subject, text }, (v) => {
      if (chrome.runtime.lastError || !v || v.error) return warn(local); // server offline: rules only
      if (v.risk === "low") {
        bar.style.cssText = plain; // the AI cleared it
        result.innerHTML = "";
        return;
      }
      warn(v);
    });
  }

  function addButtons() {
    document.querySelectorAll(".a3s").forEach((body) => {
      if (body.dataset.kingDone || body.closest("[data-kinguard-bar]")) return;
      if (!body.innerText || body.innerText.trim().length < 5) return;
      body.dataset.kingDone = "1";

      const bar = document.createElement("div");
      bar.dataset.kinguardBar = "1";
      bar.style.cssText = STYLE.bar;
      bar.innerHTML = `<button type="button" style="${STYLE.btn}">🔍 Scrutinize this email</button>
        <span style="margin-left:10px;color:#55706a">Checks for scams and sends it to your family</span>
        <div style="${STYLE.result}" aria-live="polite"></div>`;
      const btn = bar.querySelector("button");
      const result = bar.querySelector("div");
      body.parentElement.insertBefore(bar, body);
      autoCheck(body, bar, result);

      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Checking…";
        result.textContent = "";
        const subject = document.querySelector("h2.hP")?.innerText || "";
        chrome.runtime.sendMessage(
          { type: "SCRUTINIZE", sender: findSender(body), subject, text: body.innerText.slice(0, 12000) },
          (v) => {
            btn.disabled = false;
            btn.textContent = "🔍 Scrutinize again";
            render(result, chrome.runtime.lastError ? null : v);
          }
        );
      };
    });
  }

  // Inbox list: a small Scrutinize button on each row, so an email can be checked before opening it.
  // Only the sender, subject and preview snippet are visible here, so the check uses those.
  // Gmail's row class names (tr.zA, .xT, .bog, .y2, .yW [email]) are unofficial and may change.
  let popover = null;

  function closePopover() {
    if (popover) popover.remove();
    popover = null;
  }

  function showPopover(anchor) {
    closePopover();
    popover = document.createElement("div");
    popover.dataset.kinguardBar = "1";
    const r = anchor.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left, window.innerWidth - 392));
    popover.style.cssText = `${STYLE.bar};position:fixed;z-index:2147483647;top:${r.bottom + 6}px;left:${left}px;width:380px;max-height:60vh;overflow:auto;margin:0;box-shadow:0 10px 30px rgba(0,0,0,.25)`;
    popover.innerHTML = `<button type="button" aria-label="Close" style="float:right;border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:#55706a">×</button>
      <div aria-live="polite">Checking…</div>
      <div style="margin-top:8px;font-size:13px;color:#55706a">Checked from the preview. Open the email for a full check.</div>`;
    popover.querySelector("button").onclick = closePopover;
    document.body.appendChild(popover);
    return popover.querySelector("[aria-live]");
  }

  function rowInfo(row) {
    const from = row.querySelector(".yW [email]");
    const sender = from ? `${from.getAttribute("name") || from.innerText} <${from.getAttribute("email")}>` : "";
    const subject = row.querySelector(".bog")?.innerText || "";
    const snippet = (row.querySelector(".y2")?.innerText || "").replace(/^\s*-\s*/, "");
    return { sender, subject, snippet };
  }

  function addRowButtons() {
    document.querySelectorAll("tr.zA").forEach((row) => {
      if (row.querySelector("[data-kinguard-row]")) return;
      const cell = row.querySelector(".xT");
      if (!cell) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.kinguardRow = "1";
      btn.title = "Check this email for scams without opening it";
      btn.textContent = "🔍 Scrutinize";
      btn.style.cssText =
        "flex:none;margin-right:8px;font:700 12px system-ui,sans-serif;padding:2px 8px;border-radius:999px;border:1px solid #16302a;background:#edf2ef;color:#16302a;cursor:pointer;line-height:18px";
      // Stop Gmail from opening the email when the button is pressed.
      ["mousedown", "mouseup"].forEach((t) => btn.addEventListener(t, (e) => e.stopPropagation()));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { sender, subject, snippet } = rowInfo(row);
        const result = showPopover(btn);
        chrome.runtime.sendMessage(
          { type: "SCRUTINIZE", sender, subject, text: `Subject: ${subject}\n\n${snippet}`.trim() },
          (v) => result.isConnected && render(result, chrome.runtime.lastError ? null : v)
        );
      });
      cell.prepend(btn);
    });
  }

  document.addEventListener("keydown", (e) => e.key === "Escape" && closePopover());
  document.addEventListener("mousedown", (e) => popover && !popover.contains(e.target) && !e.target.closest?.("[data-kinguard-row]") && closePopover());

  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      addButtons();
      addRowButtons();
    }, 400);
  }).observe(document.body, { childList: true, subtree: true });
  addButtons();
  addRowButtons();
})();
