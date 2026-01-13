/*@maskara{
  "allFrames": true,
  "mustUrlIncludes": [
    "interface.audicare.valoragil3.com.br",
    "/Web/autorizacaoDeAtendimento/Autorizacao.aspx"
  ],
  "detectAny": [
    "input#termoCodigoSolicitado",
    "ng-select#termoSolicitado",
    "input#termoQtdSolicitada",
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

  // ==========
  // GUARD de frame: só roda se o FORM existir NESTE frame
  // ==========
  const HAS_FORM = () => {
    try {
      return !!(
        document.querySelector("#termoCodigoSolicitado") &&
        document.querySelector("#termoQtdSolicitada") &&
        document.querySelector("ng-select#termoSolicitado")
      );
    } catch { return false; }
  };

  // DEBUG
  try {
    console.log("TRT: frame-check", {
      href: location.href,
      isTop: window.top === window,
      hasForm: HAS_FORM(),
      hasCodigo: !!document.querySelector("#termoCodigoSolicitado"),
      hasQtd: !!document.querySelector("#termoQtdSolicitada"),
      hasBtn: !!document.querySelector("button[aria-label='Confirmar Honorário']"),
      payloadKeys: Object.keys(payload || {})
    });
  } catch {}

  // Se este frame não tem o form, NÃO roda (allFrames vai injetar em vários)
  if (!HAS_FORM()) {
    warn("TRT: frame sem form -> skip", location.href);
    return;
  }

  // ==========
  // KIT-only
  // ==========
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  if (!codesFromPopup.length) {
    warn("Sem payload.codes (kit).");
    return;
  }

  // ==========
  // TUNING
  // ==========
  const FAST = !!(payload.fast || payload.mode === "fast");
  const WAIT_TERM_MS   = Number(payload.waitTermMs)   > 0 ? Number(payload.waitTermMs)   : (FAST ? 8000  : 20000);
  const WAIT_RESET_MS  = Number(payload.waitResetMs)  > 0 ? Number(payload.waitResetMs)  : (FAST ? 9000  : 20000);
  const STEP_MS        = Number(payload.stepMs)       > 0 ? Number(payload.stepMs)       : (FAST ? 80    : 150);
  const WATCHDOG_MS    = Number(payload.watchdogMs)   > 0 ? Number(payload.watchdogMs)   : (FAST ? 260   : 650);
  const POST_CLICK_GAP = Number(payload.postClickGap) > 0 ? Number(payload.postClickGap) : (FAST ? 450   : 900);

  // ==========
  // Estado persistente
  // ==========
  const STORE_KEY = "hp_runner_state_trt_honorarios_v5";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // ==========
  // Quantidade SEMPRE 1 (como você pediu)
  // ==========
  const getQtyForCode = () => 1;

  function anyBusyOverlay() {
    const sel = [
      ".spinner", ".spinner-border", ".loading", ".loading-mask", ".loading-overlay",
      ".ngx-spinner-overlay", ".ngx-spinner", ".block-ui", ".overlay",
      ".cdk-overlay-backdrop", ".cdk-global-overlay-wrapper",
      "[aria-busy='true']"
    ].join(",");
    try {
      if (document.body?.getAttribute("aria-busy") === "true") return true;
      return !!document.querySelector(sel);
    } catch { return false; }
  }

  async function waitNotBusy(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (!anyBusyOverlay()) return true;
      await delay(80);
    }
    return false;
  }

  function setNativeValue(input, value) {
    try {
      const { set: valueSetter } = Object.getOwnPropertyDescriptor(input, "value") || {};
      const proto = Object.getPrototypeOf(input);
      const { set: protoSetter } = Object.getOwnPropertyDescriptor(proto, "value") || {};
      (protoSetter || valueSetter).call(input, value);
    } catch {
      input.value = value;
    }
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

  function dispatchClickSequence(el) {
    try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
    try { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); } catch {}
    try { el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true })); } catch {}
    try { el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
    try { el.click(); } catch {}
  }

  async function safeClick(el, timeoutMs = 12000) {
    if (!el) return false;
    await waitNotBusy(timeoutMs);

    try { el.scrollIntoView({ block: "center" }); } catch {}
    try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }

    await waitFor(() => {
      try {
        const disabled = !!el.disabled || el.getAttribute("aria-disabled") === "true";
        return !disabled;
      } catch { return true; }
    }, 5000, 80);

    dispatchClickSequence(el);
    return true;
  }

  // ==========
  // Selectors
  // ==========
  const codigoEl = () => document.querySelector("#termoCodigoSolicitado");
  const qtdEl    = () => document.querySelector("#termoQtdSolicitada");
  const valorEl  = () => document.querySelector("#termoValorSolicitado");
  const termoNg  = () => document.querySelector("ng-select#termoSolicitado");

  const confirmarBtn = () =>
    document.querySelector("button[aria-label='Confirmar Honorário']") ||
    document.querySelector("button.botao-success") ||
    Array.from(document.querySelectorAll("button")).find(b => (b.textContent || "").toLowerCase().includes("confirmar")) ||
    null;

  function termoPreenchido() {
    const ns = termoNg();
    if (!ns) return false;
    if (ns.querySelector(".ng-value, .ng-value-label")) return true;
    const ti = ns.querySelector(".ng-input input");
    return !!((ti?.value || "").trim());
  }

  async function waitResetAfterConfirm(prevCode, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (anyBusyOverlay()) await waitNotBusy(8000);

      const ci = codigoEl();
      const qi = qtdEl();
      const cv = (ci?.value || "").trim();
      const qv = (qi?.value || "").trim();

      if (cv === "" || cv !== String(prevCode) || qv === "") return true;
      await delay(STEP_MS);
    }
    return false;
  }

  // ==========
  // Runner
  // ==========
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",        // idle | after_code | after_qty | waiting_reset
      lastCode: null,
      lastQty: null,
      codes: null,
      clickedAt: null
    };

    const codes = st.codes || codesFromPopup;
    st.codes = codes;

    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // 1) aguardando reset
    if (st.phase === "waiting_reset" && st.lastCode) {
      const ok = await waitResetAfterConfirm(st.lastCode, WAIT_RESET_MS);
      if (!ok) { saveState(st); return; }

      log("✅ Confirmado e reset detectado:", { code: st.lastCode, qtd: st.lastQty });

      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastQty = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    // 2) após código: esperar termo/valor e preencher qtd
    if (st.phase === "after_code" && st.lastCode) {
      const vb = valorEl();

      await waitNotBusy(12000);
      await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), WAIT_TERM_MS, STEP_MS);

      const qi = qtdEl();
      if (!qi) { err("Qtd input não encontrado."); return; }

      const qty = 1; // SEMPRE 1
      await typeValueAngular(qi, String(qty));
      qi.dispatchEvent(new Event("blur", { bubbles: true }));
      await delay(160);

      st.lastQty = qty;
      st.phase = "after_qty";
      saveState(st);
      return;
    }

    // 3) após qtd: confirmar
    if (st.phase === "after_qty" && st.lastCode) {
      const btn = confirmarBtn();
      if (!btn) { err("Botão Confirmar não encontrado."); return; }

      if (st.clickedAt && Date.now() - st.clickedAt < POST_CLICK_GAP) return;
      st.clickedAt = Date.now();
      saveState(st);

      await safeClick(btn, 12000);
      log("🖱️ Confirmar clicado:", { code: st.lastCode, qtd: st.lastQty });

      st.phase = "waiting_reset";
      saveState(st);
      return;
    }

    // 4) idle: inserir próximo código + enter
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const code = codes[st.idx];
    const ci = codigoEl();
    if (!ci) { err("#termoCodigoSolicitado não encontrado."); return; }

    await waitNotBusy(12000);
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code} (qtd=1)`);

    await typeValueAngular(ci, code);
    pressEnter(ci);

    st.running = true;
    st.lastCode = code;
    st.lastQty = 1;
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

  // Boot
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 150);
  } else {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 250);
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, WATCHDOG_MS);

  log("🛡️ Runner ativo (TRT • código → qtd=1 → confirmar)", {
    total: codesFromPopup.length,
    FAST,
    WAIT_TERM_MS,
    WAIT_RESET_MS,
    WATCHDOG_MS
  });
})();
