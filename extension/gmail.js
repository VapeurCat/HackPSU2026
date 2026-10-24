// KinGuard for Gmail: adds a "Scrutinize this email" button above every opened email.
// Clicking it runs the AI check and always emails the trusted family member.
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

  function render(result, v) {
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
      ${v.notified ? `<div style="margin-top:8px;color:#23784f;font-weight:700">✓ We sent this to ${esc(v.familyName || "your family")} for a second opinion.</div>` : ""}`;
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

  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      addButtons();
    }, 400);
  }).observe(document.body, { childList: true, subtree: true });
  addButtons();
})();
