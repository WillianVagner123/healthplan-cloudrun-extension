/*@maskara{
  "mustUrlIncludes": ["camara", "camara.leg.br", "deputados"],
  "detectAny": [
    "input[name='EVENTO']",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // =====================================================
  // 0) ANTI-BOOT DUPLO (mesma página / mesmo frame)
  // =====================================================
  const BOOT_KEY = "__HP_CAMARA_BOOT_AT__";
  const now = Date.now();
  if (window[BOOT_KEY] && (now - window[BOOT_KEY]) < 500) return;
  window[BOOT_KEY] = now;

  // =====================================================
  // 1) API GLOBAL (resume / watchdog)
  // =====================================================
  if (!window.__HP_CAMARA_API__) {
    window.__HP_CAMARA_API__ = {};
  }

  const API = window.__HP_CAMARA_API__;

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise(r => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =====================================================
  // 2) HELPERS
  // =====================================================
  function waitForElement(selector, { timeoutMs = 60000 } = {}) {
    if (B?.waitForElement) return B.waitForElement(selector, { timeoutMs });
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function ghostType(el, text, charDelay = 40) {
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    for (const ch of String(text)) {
      el.value += ch;
      fire(el, "input");
      await delay(charDelay);
    }
    fire(el, "change");
  }

  function pageHasRegistroNaoEncontrado() {
    const t = (document.body?.innerText || "").toLowerCase();
    return t.includes("registro não encontrado") ||
           t.includes("verifique mensagens nos campos");
  }

  async function isRightFrame() {
    const evento = document.querySelector("input[name='EVENTO']");
    const btn =
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']");
    return !!(evento && btn);
  }

  // =====================================================
  // 3) STATE
  // =====================================================
  const STORE_KEY = "hp_runner_state_camara_v3";

  const loadState = () => {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); }
    catch { return null; }
  };

  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  // =====================================================
  // 4) LOOP PRINCIPAL
  // =====================================================
  async function runLoop() {
    if (!(await isRightFrame())) return;

    const st = loadState() || { idx: 0, running: false, phase: "idle", lastCode: null, codes: null };

    if (!st.codes || !st.codes.length) {
      warn("Sem códigos no estado.");
      return;
    }

    // voltou de postback?
    if (st.phase === "clicked" && st.lastCode) {
      if (pageHasRegistroNaoEncontrado()) {
        warn("⚠️ Registro não encontrado:", st.lastCode);
      } else {
        log("✅ OK:", st.lastCode);
      }
      st.idx++;
      st.phase = "idle";
      st.lastCode = null;
      saveState(st);
    }

    if (st.idx >= st.codes.length) {
      log("🎉 FINALIZADO:", st.codes.length);
      clearState();
      return;
    }

    const evento = await waitForElement("input[name='EVENTO']", { timeoutMs: 15000 });
    const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 15000 });

    if (!evento || !btn) return;

    const code = st.codes[st.idx];
    log(`▶️ (${st.idx + 1}/${st.codes.length})`, code);

    await ghostType(evento, code);

    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    saveState(st);

    btn.click();
  }

  // =====================================================
  // 5) WATCHDOG AUTÔNOMO
  // =====================================================
  let watchdogActive = false;
  let inFlight = false;

  async function watchdogTick() {
    if (inFlight) return;

    const st = loadState();
    if (!st?.running || !st.codes?.length) return;

    if (!(await isRightFrame())) return;

    inFlight = true;
    try {
      await runLoop();
    } catch (e) {
      err("watchdog erro:", e);
    } finally {
      inFlight = false;
    }
  }

  function startWatchdog() {
    if (watchdogActive) return;
    watchdogActive = true;

    setInterval(() => {
      watchdogTick().catch(() => {});
    }, 1200); // 🔁 1.2s
  }

  API.resume = async () => {
    await runLoop();
  };

  // =====================================================
  // 6) AUTO-START
  // =====================================================
  const st0 = loadState();

  if (st0?.running && st0.codes?.length) {
    startWatchdog();
  } else if (codesFromPopup.length) {
    const st = {
      idx: 0,
      running: true,
      phase: "idle",
      lastCode: null,
      codes: codesFromPopup
    };
    saveState(st);
    startWatchdog();
  }

  log("🛡️ Runner + Watchdog ativos", { total: codesFromPopup.length });
})();
