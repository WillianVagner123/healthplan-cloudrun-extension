/*@maskara{
  "mustUrlIncludes": ["honorarios", "trf_social", "solicitacoes", "sp-sadt", "gdf.maida.health"],
  "detectAny": [
    "input#termoCodigoSolicitado",
    "ng-select#termoSolicitado",
    "input#termoQtdSolicitada",
    "button[aria-label='Confirmar Honorário']"
  ],
  "actions": { "focus": "input#termoCodigoSolicitado" }
}*/

/**
 * TRT/TRF (Angular moderno + Nebular + ng-select) • Inserção em lote (KIT-only)
 * Fluxo que você pediu:
 * 1) INSERE CÓDIGO (#termoCodigoSolicitado) com setter nativo + InputEvent
 * 2) ENTER (para resolver termo/valor)
 * 3) INSERE QUANTIDADE (#termoQtdSolicitada) com setter nativo + InputEvent
 * 4) CLICA CONFIRMAR (button[aria-label="Confirmar Honorário"])
 *
 * ✅ Auto-frame: acha o frame certo automaticamente (o que contém o botão Confirmar)
 * ✅ State machine + watchdog: continua em reinjeção/reload parcial (localStorage)
 * ✅ Codes vêm SOMENTE do KIT (payload.codes). Sem fallback.
 *
 * 📌 Quantidade:
 * - padrão: usa payload.qtd (se vier número) OU payload.defaultQty OU 11
 * - se payload.items existir (ex: [{code,qtd}...]), usa qtd por código
 */
(() => {
  // Reinjeção = continue
  if (window.__HP_TRT_API__?.resume) {
    try { window.__HP_TRT_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_TRT_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TRT";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_trt_honorarios_v2";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // =========================
  // KIT-only (codes)
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  function getCodes() { return codesFromPopup; }

  // Quantidade: por item (payload.items) OU default (payload.qtd/defaultQty) OU 11
  function getQtyForCode(code) {
    const items = Array.isArray(payload.items) ? payload.items : null;
    if (items) {
      const hit = items.find(x => String(x?.code || x?.codigo || "") === String(code));
      const q = hit?.qtd ?? hit?.qty ?? hit?.quantidade;
      const n = Number(q);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const q0 = payload.qtd ?? payload.defaultQty ?? payload.quantidade;
    const n0 = Number(q0);
    if (Number.isFinite(n0) && n0 > 0) return n0;
    return 11; // default (como no seu print)
  }

  // =========================
  // Auto-frame: acha o frame que contém o botão Confirmar
  // =========================
  const CONFIRM_SEL = "button[aria-label='Confirmar Honorário']";
  function safeHas(win, selector) { try { return !!win?.document?.querySelector(selector); } catch { return false; } }

  async function findTargetWindow(timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (safeHas(window, CONFIRM_SEL)) return window;

      const frames = Array.from(window.frames || []);
      for (const f of frames) {
        if (safeHas(f, CONFIRM_SEL)) return f;
      }
      await delay(200);
    }
    return null;
  }

  // =========================
  // Angular-friendly setter + eventos
  // =========================
  function setNativeValue(input, value) {
    try {
      const { set: valueSetter } = Object.getOwnPropertyDescriptor(input, "value") || {};
      const prototype = Object.getPrototypeOf(input);
      const { set: prototypeSetter } = Object.getOwnPropertyDescriptor(prototype, "value") || {};
      (prototypeSetter || valueSetter).call(input, value);
    } catch {
      input.value = value;
    }
  }

  function fireAngularInput(el, dataStr, inputType = "insertText") {
    if (!el) return;
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
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function typeValueAngular(el, value) {
    el.focus();
    setNativeValue(el, "");
    fireAngularInput(el, "", "deleteContentBackward");
    await delay(15);

    setNativeValue(el, String(value));
    fireAngularInput(el, String(value), "insertText");
  }

  async function waitFor(fn, { timeoutMs = 20000, stepMs = 150 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (fn()) return true; } catch {}
      await delay(stepMs);
    }
    return false;
  }

  // =========================
  // Context (document do frame certo)
  // =========================
  async function buildCtx() {
    const targetWin = await findTargetWindow(20000);
    if (!targetWin) return null;

    const doc = targetWin.document;
    const q = (sel, root = doc) => root.querySelector(sel);

    const codigoInput = () => q("#termoCodigoSolicitado");
    const qtdInput    = () => q("#termoQtdSolicitada");
    const valorInput  = () => q("#termoValorSolicitado");
    const dataInput   = () => q("#termoDataRealização");
    const termoNg     = () => q("ng-select#termoSolicitado");
    const termoInner  = () => {
      const ns = termoNg();
      return ns ? (ns.querySelector(".ng-input input[type='text']") || null) : null;
    };

    const confirmarBtn = () =>
      q("button[aria-label='Confirmar Honorário']") ||
      q("button.botao-success") ||
      Array.from(doc.querySelectorAll("button")).find(b => (b.textContent || "").toLowerCase().includes("confirmar")) ||
      null;

    const isBtnDisabled = (btn) => {
      if (!btn) return true;
      const aria = (btn.getAttribute("aria-disabled") || "").toLowerCase();
      return btn.disabled || aria === "true";
    };

    const termoHasValue = () => {
      const ns = termoNg();
      if (!ns) return false;
      if (ns.querySelector(".ng-value, .ng-value-label")) return true;
      const ti = termoInner();
      return !!((ti?.value || "").trim());
    };

    const formReady = () => !!codigoInput() && !!qtdInput() && !!termoNg() && !!confirmarBtn();

    async function waitResetAfterConfirm(prevCode, timeoutMs = 25000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const ci = codigoInput();
        const cv = (ci?.value || "").trim();
        // após confirmar, normalmente código limpa (ou muda)
        if (cv === "" || cv !== String(prevCode)) return true;
        await delay(200);
      }
      return false;
    }

    return {
      targetWin, doc, q,
      codigoInput, qtdInput, valorInput, dataInput, termoNg, termoInner,
      confirmarBtn, isBtnDisabled, termoHasValue, formReady, waitResetAfterConfirm
    };
  }

  // =========================
  // State machine
  // =========================
  async function stepOnce() {
    const ctx = await buildCtx();
    if (!ctx) { warn("Frame correto não encontrado ainda."); return; }

    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",        // idle | after_code | after_qty | waiting_reset
      lastCode: null,
      lastQty: null,
      codes: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    st.codes = codes;

    if (!codes?.length) {
      warn("Sem payload.codes (kit). Rode pelo popup.js para injetar payload.codes.");
      return;
    }

    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // garante form pronto
    if (!ctx.formReady()) {
      await waitFor(() => ctx.formReady(), { timeoutMs: 90000 });
      if (!ctx.formReady()) { err("Form não ficou pronto no frame alvo."); return; }
    }

    // 1) Após clicar confirmar, esperar reset e avançar
    if (st.phase === "waiting_reset" && st.lastCode) {
      const ok = await ctx.waitResetAfterConfirm(st.lastCode, 25000);
      if (!ok) {
        warn("⏳ Ainda esperando reset após Confirmar…", { code: st.lastCode });
        saveState(st);
        return;
      }
      log("✅ Confirmado e reset detectado:", { code: st.lastCode, qtd: st.lastQty });

      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastQty = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    // 2) Depois do código + enter: esperar Termo/Valor e então preencher Qtd
    if (st.phase === "after_code" && st.lastCode) {
      const vb = ctx.valorInput();
      const got = await waitFor(() => ctx.termoHasValue() || ((vb?.value || "").trim() !== ""), { timeoutMs: 25000, stepMs: 200 });

      if (!got) warn("⚠️ Termo/Valor não preencheram a tempo (vou tentar mesmo assim).", { code: st.lastCode });

      // preencher QUANTIDADE
      const qty = st.lastQty ?? getQtyForCode(st.lastCode);
      const qi = ctx.qtdInput();
      if (!qi) { err("Qtd input não encontrado."); return; }

      await typeValueAngular(qi, String(qty));
      qi.dispatchEvent(new Event("blur", { bubbles: true }));

      st.lastQty = qty;
      st.phase = "after_qty";
      saveState(st);
      return;
    }

    // 3) Depois da qtd: clicar Confirmar
    if (st.phase === "after_qty" && st.lastCode) {
      const btn = ctx.confirmarBtn();
      if (!btn) { err("Botão Confirmar não encontrado."); return; }

      // evita duplo clique em reinjeção rápida
      if (st.clickedAt && Date.now() - st.clickedAt < 1200) return;

      if (ctx.isBtnDisabled(btn)) {
        warn("⚠️ Confirmar parece desabilitado — aguardando um pouco…");
        await delay(800);
      }

      st.clickedAt = Date.now();
      saveState(st);

      btn.click();
      log("🖱️ Confirmar clicado:", { code: st.lastCode, qtd: st.lastQty });

      st.phase = "waiting_reset";
      saveState(st);
      return;
    }

    // 4) idle: inserir próximo CÓDIGO + ENTER
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const code = codes[st.idx];
    const qty = getQtyForCode(code);

    const ci = ctx.codigoInput();
    if (!ci) { err("#termoCodigoSolicitado não encontrado."); return; }

    log(`▶️ (${st.idx + 1}/${codes.length}) ${code} (qtd=${qty})`);

    // limpar e inserir CÓDIGO (setter nativo)
    await typeValueAngular(ci, code);
    pressEnter(ci);

    st.running = true;
    st.lastCode = code;
    st.lastQty  = qty;
    st.phase = "after_code";
    saveState(st);
  }

  // =========================
  // Resume + Watchdog
  // =========================
  let inFlight = false;
  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_TRT_API__.resume = resume;

  // =========================
  // Boot (KIT-only)
  // =========================
  const st0 = loadState();

  // continua estado salvo
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 150);
  }
  // inicia com kit
  else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 250);
  }
  // sem kit
  else {
    warn("Runner carregou sem payload.codes. Rode pelo popup.js (kit) e injete novamente.");
  }

  // watchdog
  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 850);

  log("🛡️ Runner + Watchdog (TRT • código → qtd → confirmar) ativos", { total: getCodes().length });
})();
