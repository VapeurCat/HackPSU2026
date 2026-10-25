// KinGuard content script: runs on every page (except Gmail, which has its own script).
// 1. Quick local rules, so a warning appears instantly even with no internet.
// 2. Anything suspicious goes to the backend for the AI check, the timeline and family alerts.
(() => {
  let sentText = "";
  let payChecked = false;
  let trusted = false; // the person chose "Trust this site" for this site

  // Search results pages list snippets and ads from many other sites ("act now", "call today"),
  // which reads like pressure but isn't. Check the sites people actually open instead.
  const SEARCH_HOST = /^(www\.)?(google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|bing\.com|duckduckgo\.com|html\.duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|ecosia\.org|startpage\.com)$/i;
  function isSearchPage() {
    return SEARCH_HOST.test(location.hostname) && /^\/(search|html|web)?\/?$/i.test(location.pathname);
  }

  function pageText() {
    return (document.body?.innerText || "").slice(0, 20000);
  }

  // Does the page ask for a password or card number? Matters most on a lookalike address.
  function hasSensitiveForm() {
    return Boolean(
      document.querySelector('input[type="password"], input[autocomplete^="cc-"], input[name*="card" i], input[name*="cvv" i], input[id*="card" i]')
    );
  }

  // Demo only: on the local demo server, ?kg-host=arnazon.com pretends the page is on that address.
  const demoHost = location.hostname === "localhost" ? new URLSearchParams(location.search).get("kg-host") : null;
  const host = demoHost || location.hostname;
  const pageUrl = demoHost ? `https://${demoHost}${location.pathname}` : location.href;
  KinGuardUI.setHost(host);

  function check() {
    if (isSearchPage()) return;
    const text = pageText();
    const look = KinGuardRules.lookalikeDomain(host);
    // Fake sign-in pages often have very little text, so a lookalike address is checked regardless.
    if ((text.length < 40 && !look) || text === sentText) return;

    const sensitiveForm = hasSensitiveForm();
    const local = KinGuardRules.analyze(text, { url: pageUrl, sensitiveForm });

    // A lookalike address alone gets a small banner once per site per visit, so it never nags.
    const seenKey = `kinguard-lookalike-${host}`;
    if (look && local.risk === "medium") {
      try {
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, "1");
      } catch {}
    }

    // A payment page (gift cards, crypto, wire, Zelle) isn't a scam by itself, so money words alone
    // don't warn here. Instead, ask the backend whether a scam warning happened recently: if so, pause.
    const pay = KinGuardRules.paymentPage(text, location.href);
    if (pay && local.risk !== "high") {
      sentText = text;
      if (payChecked) return; // once per page, so choosing "continue" isn't asked again
      payChecked = true;
      if (look) KinGuardUI.show(local); // a lookalike payment page still gets its notice (the pause screen replaces it if needed)
      chrome.runtime.sendMessage({ type: "PAY_CHECK", url: location.href, title: document.title, ...pay }, (v) => {
        if (chrome.runtime.lastError || !v || v.error || !v.pause) return;
        KinGuardUI.pause(v);
      });
      return;
    }

    // On a trusted site, yellow notices are skipped. Red warnings still show, in case the site is ever hacked.
    if (trusted && local.risk !== "high") return;

    if (local.risk === "low") return;
    sentText = text;

    // A high-risk page is warned about right away, then upgraded with the AI's answer.
    // A mildly suspicious page waits for the AI, which can clear it, so ordinary pages don't flash a warning.
    // A lookalike address is a fact, not a guess, so its banner shows right away too.
    if (local.risk === "high" || look || local.prank) KinGuardUI.show(local, { pending: true });

    chrome.runtime.sendMessage({ type: "ANALYZE", url: pageUrl, title: document.title, text, sensitiveForm }, (verdict) => {
      if (chrome.runtime.lastError || !verdict || verdict.error) {
        KinGuardUI.show(local, { pending: false }); // backend offline: fall back to the local warning
        return;
      }
      KinGuardUI.show(verdict, { pending: false });
    });
  }

  // First see whether KinGuard is paused (from the toolbar pop-up) and whether this site is trusted, then check the page.
  chrome.storage.local.get("pausedUntil", ({ pausedUntil }) => {
    if (pausedUntil && pausedUntil > Date.now()) return;
    chrome.runtime.sendMessage({ type: "IS_TRUSTED", host }, (r) => {
      trusted = !chrome.runtime.lastError && Boolean(r?.trusted);
      if (!isSearchPage()) chrome.runtime.sendMessage({ type: "COUNT", kind: "page" }); // just a count, no address
      check();
      // Scam pages often build their scary content with JavaScript after loading.
      setTimeout(check, 1500);
      setTimeout(check, 5000);
    });
  });
})();
