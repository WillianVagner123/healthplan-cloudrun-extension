// content.js - roda no mundo ISOLADO

let injectedOnce = false;

function ensureInjected() {
  if (injectedOnce) return;
  injectedOnce = true;

  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("injected.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "HP_RUN") return;

  try {
    ensureInjected();

    window.postMessage(
      { type: "HP_RUN", code: msg.code, planId: msg.planId || "" },
      "*"
    );

    sendResponse({ ok: true });
  } catch (e) {
    sendResponse({ ok: false, error: String(e) });
  }

  return true;
});
