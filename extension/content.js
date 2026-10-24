// KinGuard content script: runs on every page (except Gmail, which has its own script).
// 1. Quick local rules, so a warning appears instantly even with no internet.
// 2. Anything suspicious goes to the backend for the AI check, the timeline and family alerts.
(() => {
  let sentText = "";

  function pageText() {
    return (document.body?.innerText || "").slice(0, 20000);
  }

  function check() {
    const text = pageText();
    if (text.length < 40 || text === sentText) return;

    const local = KinGuardRules.analyze(text);
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
