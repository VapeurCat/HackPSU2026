// KinGuard content script: runs on every page (except Gmail, which has its own script).
// 1. Quick local rules, so a warning appears instantly even with no internet.
// 2. Anything suspicious goes to the backend for the AI check, the timeline and family alerts.
(() => {
  let sentText = "";
  let payChecked = false;

  // Search results pages list snippets and ads from many other sites ("act now", "call today"),
  // which reads like pressure but isn't. Check the sites people actually open instead.
  const SEARCH_HOST = /^(www\.)?(google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|bing\.com|duckduckgo\.com|html\.duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|ecosia\.org|startpage\.com)$/i;
  function isSearchPage() {
    return SEARCH_HOST.test(location.hostname) && /^\/(search|html|web)?\/?$/i.test(location.pathname);
  }

  function pageText() {
    return (document.body?.innerText || "").slice(0, 20000);
  }

  function check() {
    if (isSearchPage()) return;
    const text = pageText();
    if (text.length < 40 || text === sentText) return;

    const local = KinGuardRules.analyze(text);

    // A payment page (gift cards, crypto, wire, Zelle) isn't a scam by itself, so money words alone
    // don't warn here. Instead, ask the backend whether a scam warning happened recently: if so, pause.
    const pay = KinGuardRules.paymentPage(text, location.href);
    if (pay && local.risk !== "high") {
      sentText = text;
      if (payChecked) return; // once per page, so choosing "continue" isn't asked again
      payChecked = true;
      chrome.runtime.sendMessage({ type: "PAY_CHECK", url: location.href, title: document.title, ...pay }, (v) => {
        if (chrome.runtime.lastError || !v || v.error || !v.pause) return;
        KinGuardUI.pause(v);
      });
      return;
    }

    if (local.risk === "low") return;
    sentText = text;

    // A high-risk page is warned about right away, then upgraded with the AI's answer.
    // A mildly suspicious page waits for the AI, which can clear it, so ordinary pages don't flash a warning.
    if (local.risk === "high") KinGuardUI.show(local, { pending: true });

    chrome.runtime.sendMessage({ type: "ANALYZE", url: location.href, title: document.title, text }, (verdict) => {
      if (chrome.runtime.lastError || !verdict || verdict.error) {
        KinGuardUI.show(local, { pending: false }); // backend offline: fall back to the local warning
        return;
      }
      KinGuardUI.show(verdict, { pending: false });
    });
  }

  check();
  // Scam pages often build their scary content with JavaScript after loading.
  setTimeout(check, 1500);
  setTimeout(check, 5000);
})();
