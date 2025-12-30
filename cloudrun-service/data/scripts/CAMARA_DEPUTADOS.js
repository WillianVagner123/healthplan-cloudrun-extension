// background.js (MV3) — ATUALIZADO (Conserto 1 + reinjeção automática + storage.session)
// ✅ Injeta BASE + PAYLOAD + RUNNER no MAIN world (sem runnerBase.js)
// ✅ Lembra do último RUN por aba em chrome.storage.session (não perde quando SW dorme)
// ✅ Reinjeção automática após refresh/postback (tabs.onUpdated complete)
// ✅ Recebe RUN_PLAN do popup 1 vez e não precisa abrir a extensão de novo

// ===============================
// 0) INJECTOR (BASE + PAYLOAD + RUNNER)
// ===============================
export async function injectPlanRunner({ tabId, payloadObj, runnerJsString }) {
  // 1) BASE
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      if (window.__HP_BASE__) return;

      const delay = (ms) => new Promise((r) => setTimeout(r, ms));

      function isVisible(el) {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      }

      function fire(el, type) {
        if (!el) return;
        el.dispatchEvent(new Event(type, { bubbles: true }));
      }

      function fireKey(el, type, key) {
        if (!el) return;
        el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
      }

      function waitForElement(selector, { timeoutMs = 60000, root = document } = {}) {
        return new Promise((resolve) => {
          const found = root.querySelector(selector);
          if (found) return resolve(found);

          const obs = new MutationObserver(() => {
            const el = root.querySelector(selector);
            if (el) { obs.disconnect(); resolve(el); }
          });

          obs.observe(root.documentElement || root, { childList: true, subtree: true });
          setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
        });
      }

      function makeFloatingButton({ id, text, onClick }) {
        let b = document.getElementById(id);
        if (b) b.remove();

        b = document.createElement("button");
        b.id = id;
        b.type = "button";
        b.textContent = text;
        b.style.cssText = `
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483647;
          padding: 12px 14px;
          border-radius: 14px;
          border: none;
          background: #0d6efd;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(0,0,0,.25);
          user-select: none;
        `;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        });
        document.body.appendChild(b);
        return b;
      }

      function makeFloatingHint({ id, text }) {
        let h = document.getElementById(id);
        if (h) h.remove();

        h = document.createElement("div");
        h.id = id;
        h.textContent = text;
        h.style.cssText = `
          position: fixed;
          right: 16px;
          bottom: 62px;
          z-index: 2147483647;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(0,0,0,.65);
          color: rgba(255,255,255,.92);
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
          box-shadow: 0 10px 24px rgba(0,0,0,.20);
        `;
        document.body.appendChild(h);
        return h;
      }

      window.__HP_BASE__ = {
        delay,
        isVisible,
        fire,
        fireKey,
        waitForElement,
        makeFloatingButton,
        makeFloatingHint,
        logScope: (scope, ...a) => console.log(scope + ":", ...a),
        warnScope: (scope, ...a) => console.warn(scope + ":", ...a),
        errScope: (scope, ...a) => console.error(scope + ":", ...a),
      };
    },
  });

  // 2) PAYLOAD
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (payload) => { window.__HP_PAYLOAD__ = payload; },
    args: [payloadObj],
  });

  // 3) RUNNER (string)
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (code) => {
      (0, eval)(code); // IIFE runner
    },
    args: [runnerJsString],
  });
}

// ===============================
// 1) STORAGE.SESSION (MV3-safe)
// ===============================
const KEY_PREFIX = "hp:lastRun:";

async function setLastRun(tabId, ctx) {
  await chrome.storage.session.set({ [KEY_PREFIX + tabId]: ctx });
}

async function getLastRun(tabId) {
  const obj = await chrome.storage.session.get(KEY_PREFIX + tabId);
  return obj[KEY_PREFIX + tabId] || null;
}

async function clearLastRun(tabId) {
  await chrome.storage.session.remove(KEY_PREFIX + tabId);
}

function urlMatches(url, mustUrlIncludes = []) {
  if (!url) return false;
  return mustUrlIncludes.every((s) => url.includes(s));
}

// ===============================
// 2) RUN_PLAN (POPUP -> BG) 1 VEZ
// ===============================
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type !== "RUN_PLAN") return;

    const { tabId, payloadObj, runnerJsString, mustUrlIncludes } = msg;

    // guarda para reinjetar após refresh/postback
    await setLastRun(tabId, { payloadObj, runnerJsString, mustUrlIncludes });

    // injeta agora
    await injectPlanRunner({ tabId, payloadObj, runnerJsString });

    sendResponse({ ok: true });
  })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true; // async response
});

// ===============================
// 3) AUTO-REINJETAR APÓS REFRESH/POSTBACK
// ===============================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const ctx = await getLastRun(tabId);
  if (!ctx) return;

  const url = tab?.url || "";
  if (!urlMatches(url, ctx.mustUrlIncludes || [])) return;

  try {
    await injectPlanRunner({
      tabId,
      payloadObj: ctx.payloadObj,
      runnerJsString: ctx.runnerJsString,
    });
  } catch (e) {
    console.warn("Reinject failed:", e);
  }
});

// ===============================
// 4) LIMPEZA (opcional)
// ===============================
chrome.tabs.onRemoved.addListener((tabId) => {
  clearLastRun(tabId).catch(() => {});
});
