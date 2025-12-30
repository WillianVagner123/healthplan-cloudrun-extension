// content.js — roda no mundo ISOLADO (MV3)
// - Injeta injected.js em TODOS os frames (pra bridge existir no frame certo)
// - Recebe HP_RUN do BG e repassa pro injected via window.postMessage (neste frame)
// - Só TOP frame envia HP_NAV pro BG (evita duplicar)
// - Bridge de estado persistente (runner MAIN <-> BG storage.local)

(() => {
  if (window.__HP_CONTENT_WIRED__) return;
  window.__HP_CONTENT_WIRED__ = true;

  const isTop = (window.top === window);
  let injectedOnce = false;

  function ensureInjected() {
    if (injectedOnce) return;
    injectedOnce = true;

    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.async = false;
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  // ✅ Sempre injeta (inclusive iframes)
  ensureInjected();

  // =========================
  // 1) BG -> frame: HP_RUN
  // =========================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "HP_RUN") return;

    try {
      ensureInjected();

      window.postMessage(
        { type: "HP_RUN", code: msg.code, planId: msg.planId || "" },
        "*"
      );

      sendResponse({ ok: true, frame: isTop ? "top" : "sub" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }

    return true;
  });

  // =========================
  // 2) NAV -> BG: só TOP frame
  // =========================
  if (isTop) {
    window.addEventListener(
      "__HP_NAV__",
      (ev) => {
        const detail = ev?.detail || {};
        const url = detail.url || location.href;

        chrome.runtime
          .sendMessage({
            type: "HP_NAV",
            url,
            reason: detail.reason || "nav",
            ts: detail.ts || Date.now(),
          })
          .catch(() => {});
      },
      true
    );
  }

  // =========================
  // 3) BRIDGE de estado: runner(MAIN) <-> BG(storage.local)
  // runner manda window.postMessage({type:"HP_STATE_*", reqId, planId, origin, state})
  // content forward pro BG e devolve HP_STATE_RESULT pro runner
  // =========================
  window.addEventListener(
    "message",
    async (ev) => {
      const msg = ev.data;
      if (!msg || !msg.type) return;

      if (msg.type !== "HP_STATE_SET" && msg.type !== "HP_STATE_GET" && msg.type !== "HP_STATE_CLEAR") return;

      try {
        const res = await chrome.runtime.sendMessage({
          type: msg.type,
          planId: msg.planId,
          origin: msg.origin,
          state: msg.state,
        });

        window.postMessage(
          {
            type: "HP_STATE_RESULT",
            reqId: msg.reqId,
            ok: !!res?.ok,
            record: res?.record || null,
            error: res?.error || null,
          },
          "*"
        );
      } catch (e) {
        window.postMessage(
          {
            type: "HP_STATE_RESULT",
            reqId: msg.reqId,
            ok: false,
            record: null,
            error: String(e),
          },
          "*"
        );
      }
    },
    true
  );
})();
