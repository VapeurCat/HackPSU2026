// KinGuard content script: runs on every page (except Gmail, which has its own script).
// 1. Quick local rules, so a warning appears instantly even with no internet.
// 2. Anything suspicious goes to the backend for the AI check, the timeline and family alerts.
(() => {
  let sentText = "";
  let payChecked = false;

  function pageText() {
    return (document.body?.innerText || "").slice(0, 20000);
  }

  function check() {
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

    // Show the local verdict right away, then upgrade it with the AI's answer.
    KinGuardUI.show(local, { pending: true });

    chrome.runtime.sendMessage({ type: "ANALYZE", url: location.href, title: document.title, text }, (verdict) => {
      if (chrome.runtime.lastError || !verdict || verdict.error) {
        KinGuardUI.show(local, { pending: false }); // backend offline: keep the local warning
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
