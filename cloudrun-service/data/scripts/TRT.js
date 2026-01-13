/*@maskara{
  "allFrames": true,
  "mustUrlIncludes": [
    "audicare.valoragil3.com.br",
    "interface.audicare.valoragil3.com.br"
  ],
  "detectAny": [
    "#cdk-overlay-container",
    "app-autorizacao-modal",
    "app-aut-honorarios",
    "input#termoCodigoSolicitado",
    "input#termoQtdSolicitada",
    "ng-select#termoSolicitado",
    "button[aria-label='Confirmar Honorário']"
  ],
  "actions": { "focus": "input#termoCodigoSolicitado" }
}*/

(() => {
  // Reinjeção = continue
  if (window.__HP_TRT_API__?.resume) {
    try { window.__HP_TRT_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_TRT_API__ = { resume: async () => {} };

  const scope = "TRT";
  const payload = window.__HP_PAYLOAD__ || {};
  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // ====== util ======
  async function waitForSel(sel, timeoutMs = 60000, stepMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = document.querySelector(sel);
      if (el) return el;
      await delay(stepMs);
    }
    return null;
  }

  function hasHonorariosForm() {
    try {
      return !!(
        document.querySelector("#termoCodigoSolicitado") &&
        document.querySelector("#termoQtdSolicitada") &&
        document.querySelector("ng-select#termoSolicitado") &&
        document.querySelector("button[aria-label='Confirmar Honorário']")
      );
    } catch { return false; }
  }

  async function ensureFormReady() {
    // espera o MODAL/overlay aparecer
    await waitForSel("#cdk-overlay-container, app-autorizacao-modal, app-aut-honorarios", 60000, 200);
    // depois espera os campos
    const ok = await waitForSel("#termoCodigoSolicitado", 60000, 200);
    await waitForSel("#termoQtdSolicitada", 60000, 200);
    await waitForSel("ng-select#termoSolicitado", 60000, 200);
    await waitForSel("button[aria-label='Confirmar Honorário']", 60000, 200);
    return !!ok;
  }

  // DEBUG frame
  try {
    console.log("TRT: frame-check", {
      href: location.href,
      host: location.host,
      isTop: window.top === window,
      readyNow: hasHonorariosForm(),
      payloadKeys: Object.keys(payload || {})
    });
  } catch {}

  // ====== payload ======
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  if (!codesFromPopup.length) {
    warn("Sem payload.codes (kit).");
    return;
  }

  // ====== runner settings ======
  const FAST = !!(payload.fast || payload.mode === "fast");
  const WAIT_TERM_MS   = Number(payload.waitTermMs)   > 0 ? Number(payload.waitTermMs)   : (FAST ? 8000  : 20000);
  const WAIT_RESET_MS  = Number(payload.waitResetMs)  > 0 ? Number(payload.waitResetMs)  : (FAST ? 9000  : 20000);
  const STEP_MS        = Number(payload.stepMs)       > 0 ? Number(payload.stepMs)       : (FAST ? 80    : 150);
  const WATCHDOG_MS    = Number(payload.watchdogMs)   > 0 ? Number(payload.watchdogMs)   : (FAST ? 260   : 650);
  const POST_CLICK_GAP = Number(payload.postClickGap) > 0 ? Number(payload.postClickGap) : (FAST ? 450   : 900);

  // ====== state ======
  const STORE_KEY = "hp_runner_state_trt_honorarios_v6";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // ====== DOM ======
  const codigoEl = () => document.querySelector("#termoCodigoSolicitado");
  const qtdEl    = () => document.querySelector("#termoQtdSolicitada");
  const valorEl  = () => document.querySelector("#termoValorSolicitado");
  const termoNg  = () => document.querySelector("ng-select#termoSolicitado");
  const confirmarBtn = () => document.querySelector("button[aria-label='Confirmar Honorário']");

  function termoPreenchido() {
    const ns = termoNg();
    if (!ns) return false;
    if (ns.querySelector(".ng-value, .ng-value-label")) return true;
    const ti = ns.querySelector(".ng-input input");
    return !!((ti?.value || "").trim());
  }

  // ====== Angular-friendly set ======
  function setNativeValue(input, value) {
    try {
      const { set: valueSetter } = Object.getOwnPropertyDescriptor(input, "value") || {};
      const proto = Object.getPrototypeOf(input);
      const { set: protoSetter } = Object.getOwnPropertyDescriptor(proto, "value") || {};
      (protoSetter || valueSetter).call(input, value);
    } catch { input.value = value; }
  }

  function fireAngularInput(el, dataStr, inputType = "insertText") {
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: dataStr ?? null }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function typeValueAngular(el, value) {
    try { el.scrollIntoView({ block: "center" }); } catch {}
    try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
    setNativeValue(el, "");
    fireAngularInput(el, "", "deleteContentBackward");
    await delay(10);
    setNativeValue(el, String(value));
    fireAngularInput(el, String(value), "insertText");
  }

  async function waitFor(fn, timeoutMs = 25000, stepMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (fn()) return true; } catch {}
      await delay(stepMs);
    }
    return false;
  }

  async function safeClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center" }); } catch {}
    try { el.focus({ preventScroll: true }); } catch {}
    try { el.click(); } catch {}
    return true;
  }

  async function waitResetAfterConfirm(prevCode, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const ci = codigoEl();
      const qi = qtdEl();
      const cv = (ci?.value || "").trim();
      const qv = (qi?.value || "").trim();
      if (cv === "" || cv !== String(prevCode) || qv === "") return true;
      await delay(STEP_MS);
    }
    return false;
  }

  // ====== main loop ======
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: true,
      phase: "idle",        // idle | after_code | after_qty | waiting_reset
      lastCode: null,
      lastQty: 1,
      codes: codesFromPopup,
      clickedAt: null
    };

    const codes = st.codes || codesFromPopup;

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    if (st.phase === "waiting_reset" && st.lastCode) {
      const ok = await waitResetAfterConfirm(st.lastCode, WAIT_RESET_MS);
      if (!ok) return;
      log("✅ Reset detectado:", st.lastCode);
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    if (st.phase === "after_code" && st.lastCode) {
      const vb = valorEl();
      await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), WAIT_TERM_MS, STEP_MS);

      const qi = qtdEl();
      if (!qi) return;

      await typeValueAngular(qi, "1"); // SEMPRE 1
      qi.dispatchEvent(new Event("blur", { bubbles: true }));
      await delay(160);

      st.phase = "after_qty";
      saveState(st);
      return;
    }

    if (st.phase === "after_qty" && st.lastCode) {
      const btn = confirmarBtn();
      if (!btn) return;

      if (st.clickedAt && Date.now() - st.clickedAt < POST_CLICK_GAP) return;
      st.clickedAt = Date.now();
      saveState(st);

      await safeClick(btn);
      log("🖱️ Confirmar:", st.lastCode);

      st.phase = "waiting_reset";
      saveState(st);
      return;
    }

    // idle
    const code = codes[st.idx];
    const ci = codigoEl();
    if (!ci) return;

    log(`▶️ (${st.idx + 1}/${codes.length}) ${code} (qtd=1)`);
    await typeValueAngular(ci, code);
    pressEnter(ci);

    st.lastCode = code;
    st.phase = "after_code";
    saveState(st);
  }

  let inFlight = false;
  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_TRT_API__.resume = resume;

  // ====== BOOT: ESPERA O FORM APARECER NESTE FRAME ======
  (async () => {
    const ok = await ensureFormReady();
    if (!ok) {
      warn("TRT: não apareceu form neste frame em 60s -> skip", location.href);
      return;
    }
    log("✅ Form detectado neste frame. Iniciando runner…", location.href);

    // start / resume
    const st0 = loadState();
    if (!st0) saveState({ idx: 0, running: true, phase: "idle", lastCode: null, lastQty: 1, codes: codesFromPopup, clickedAt: null });

    setTimeout(() => resume("auto-start"), 250);

    setInterval(() => {
      const st = loadState();
      if (!st?.running) return;
      resume("watchdog-tick");
    }, WATCHDOG_MS);
  })();
})();
