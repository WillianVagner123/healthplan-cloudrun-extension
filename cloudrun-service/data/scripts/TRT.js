/*@maskara{
  "mustUrlIncludes": ["audicare.valoragil3.com.br", "/Web/autorizacaoDeAtendimento/Autorizacao.aspx"],
  "frame": "iframe[src^='https://interface.audicare.valoragil3.com.br']",
  "wait": 800,
  "maxRetries": 40,
  "retryInterval": 500,

  "detectAny": [
    "#termoCodigoSolicitado",
    "#termoQtdSolicitada",
    "button[aria-label='Confirmar Honorário']",
    "ng-select#termoSolicitado"
  ],

  "actions": {
    "focus": "#termoCodigoSolicitado"
  }
}*/

(() => {
  // Se reinjetar, retoma
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

  // =========================
  // GATE: só roda no frame certo
  // =========================
  try {
    const href = String(location.href || "");
    const isInterface = href.includes("interface.audicare.valoragil3.com.br/#/pages/autorizacoes");
    if (!isInterface) return;

    const hasCodigo = !!document.querySelector("#termoCodigoSolicitado");
    const hasQtd    = !!document.querySelector("#termoQtdSolicitada");
    const hasBtn    = !!document.querySelector("button[aria-label='Confirmar Honorário']");
    if (!(hasCodigo && hasQtd && hasBtn)) return;

    // assinatura pro background (se você quiser capturar frame certo depois)
    window.__HP_FRAME_SIG__ = window.__HP_FRAME_SIG__ || {};
    window.__HP_FRAME_SIG__.TRT_INTERFACE_AUTORIZACOES = true;

    log("✅ Frame correto (interface) detectado:", { href, hasCodigo, hasQtd, hasBtn });
  } catch { return; }

  // =========================
  // Helpers
  // =========================
  function anyBusyOverlay() {
    const sel = [
      ".spinner", ".spinner-border", ".loading", ".loading-mask", ".loading-overlay",
      ".ngx-spinner-overlay", ".ngx-spinner", ".block-ui",
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

  async function waitSel(sel, timeoutMs = 60000, stepMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = document.querySelector(sel);
      if (el) return el;
      await delay(stepMs);
    }
    return null;
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
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType,
        data: dataStr ?? null
      }));
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
    el.focus();
    setNativeValue(el, "");
    fireAngularInput(el, "", "deleteContentBackward");
    await delay(10);

    setNativeValue(el, String(value));
    fireAngularInput(el, String(value), "insertText");
  }

  async function waitFor(fn, timeoutMs = 25000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (fn()) return true; } catch {}
      await delay(stepMs);
    }
    return false;
  }

  // =========================
  // Selectors reais (confirmados)
  // =========================
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

  // =========================
  // Config
  // =========================
  const FAST = !!(payload.fast || payload.mode === "fast");
  const WAIT_TERM_MS   = Number(payload.waitTermMs)   > 0 ? Number(payload.waitTermMs)   : (FAST ? 8000  : 20000);
  const WAIT_RESET_MS  = Number(payload.waitResetMs)  > 0 ? Number(payload.waitResetMs)  : (FAST ? 9000  : 20000);
  const STEP_MS        = Number(payload.stepMs)       > 0 ? Number(payload.stepMs)       : (FAST ? 80    : 150);
  const WATCHDOG_MS    = Number(payload.watchdogMs)   > 0 ? Number(payload.watchdogMs)   : (FAST ? 260   : 650);
  const POST_CLICK_GAP = Number(payload.postClickGap) > 0 ? Number(payload.postClickGap) : (FAST ? 450   : 900);

  const DEFAULT_QTY =
    (Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade ?? payload.qty) > 0)
      ? Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade ?? payload.qty)
      : 1;

  const STORE_KEY = "hp_runner_state_trt_honorarios_v4";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  function normalizeCode(x) {
    const s = String(x ?? "").trim();
    return s.replace(/[^\dA-Za-z]/g, "");
  }

  function getQtyFromMap(code) {
    const m = payload.qtyByCode || payload.qtdByCode || payload.quantidadePorCodigo || null;
    if (!m || typeof m !== "object") return null;
    const v = m[String(code)];
    const q = Number(v);
    return (Number.isFinite(q) && q > 0) ? q : null;
  }

  function getQtyForCode(code) {
    const qMap = getQtyFromMap(code);
    if (qMap) return qMap;

    const items = Array.isArray(payload.items) ? payload.items : null;
    if (items) {
      const target = normalizeCode(code);
      const hit = items.find(x => {
        const c1 = normalizeCode(x?.code);
        const c2 = normalizeCode(x?.codigo);
        const c3 = normalizeCode(x?.cod);
        const c4 = normalizeCode(x?.procedimento);
        const c5 = normalizeCode(x?.codigoTuss);
        const c6 = normalizeCode(x?.tuss);
        return [c1,c2,c3,c4,c5,c6].some(v => v && v === target);
      });
      const q = Number(hit?.qtd ?? hit?.qty ?? hit?.quantidade ?? hit?.q);
      if (Number.isFinite(q) && q > 0) return q;
    }

    return DEFAULT_QTY;
  }

  async function ensureFormReady() {
    const ci = await waitSel("#termoCodigoSolicitado", 60000);
    const qi = await waitSel("#termoQtdSolicitada", 60000);
    const btn = await waitSel("button[aria-label='Confirmar Honorário']", 60000);
    const ns = await waitSel("ng-select#termoSolicitado", 60000);
    return !!(ci && qi && btn && ns);
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

  // =========================
  // Runner
  // =========================
  (async () => {
    const ok = await ensureFormReady();
    if (!ok) return;

    const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
    if (!codesFromPopup.length) { warn("Sem payload.codes (kit)."); return; }

    async function stepOnce() {
      const st = loadState() || {
        idx: 0, running: false, phase: "idle",
        lastCode: null, lastQty: null, codes: null, clickedAt: null
      };

      const codes = st.codes || codesFromPopup;
      st.codes = codes;

      if (st.running && st.idx >= codes.length) {
        log("🎉 Finalizado! Total:", codes.length);
        clearState();
        return;
      }

      if (st.phase === "waiting_reset" && st.lastCode) {
        const ok = await waitResetAfterConfirm(st.lastCode, WAIT_RESET_MS);
        if (!ok) { warn("⏳ Aguardando reset…", { code: st.lastCode }); saveState(st); return; }
        log("✅ Confirmado e reset detectado:", { code: st.lastCode, qtd: st.lastQty });
        st.idx += 1;
        st.phase = "idle";
        st.lastCode = null;
        st.lastQty = null;
        st.clickedAt = null;
        saveState(st);
        return;
      }

      if (st.phase === "after_code" && st.lastCode) {
        const vb = valorEl();
        await waitNotBusy(12000);
        await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), WAIT_TERM_MS, STEP_MS);

        const qi = qtdEl();
        if (!qi) { err("Qtd input não encontrado."); return; }

        const qty = st.lastQty ?? getQtyForCode(st.lastCode);
        await typeValueAngular(qi, String(qty));
        qi.dispatchEvent(new Event("blur", { bubbles: true }));
        await delay(140);

        st.lastQty = qty;
        st.phase = "after_qty";
        saveState(st);
        return;
      }

      if (st.phase === "after_qty" && st.lastCode) {
        const btn = confirmarBtn();
        if (!btn) { err("Botão Confirmar não encontrado."); return; }

        if (st.clickedAt && Date.now() - st.clickedAt < POST_CLICK_GAP) return;

        st.clickedAt = Date.now();
        saveState(st);

        await waitNotBusy(12000);
        btn.click();
        log("🖱️ Confirmar clicado:", { code: st.lastCode, qtd: st.lastQty });

        st.phase = "waiting_reset";
        saveState(st);
        return;
      }

      if (st.idx >= codes.length) {
        log("🎉 Finalizado! Total:", codes.length);
        clearState();
        return;
      }

      const code = codes[st.idx];
      const qty = getQtyForCode(code);

      const ci = codigoEl();
      if (!ci) { err("#termoCodigoSolicitado não encontrado."); return; }

      await waitNotBusy(12000);
      log(`▶️ (${st.idx + 1}/${codes.length}) ${code} (qtd=${qty})`);

      await typeValueAngular(ci, code);
      pressEnter(ci);

      st.running = true;
      st.lastCode = code;
      st.lastQty = qty;
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

    log("🛡️ Runner + Watchdog ativos (TRT • interface • código→qtd→confirmar)", {
      total: codesFromPopup.length,
      FAST,
      DEFAULT_QTY,
      WAIT_TERM_MS,
      WAIT_RESET_MS,
      WATCHDOG_MS
    });
  })();
})();
