/*@maskara{
  "mustUrlIncludes": ["trf_social", "honorarios", "solicitacoes", "sp-sadt", "gdf.maida.health"],
  "detectAny": [
    "input#termoCodigoSolicitado",
    "ng-select#termoSolicitado",
    "button[aria-label='Confirmar Honorário']"
  ],
  "actions": { "focus": "input#termoCodigoSolicitado" }
}*/

/**
 * TRT/TRF (Angular + Nebular + ng-select) • Inserção em lote (KIT-only) + AUTO-FRAME
 *
 * ✔ Acha automaticamente o frame correto (o que contém o botão "Confirmar Honorário")
 * ✔ Usa SOMENTE payload.codes (kit / popup.js). Sem fallback.
 * ✔ State machine + watchdog com localStorage (continua em reinjeção).
 *
 * Campos (IDs do seu HTML):
 *  - Código:  #termoCodigoSolicitado
 *  - Termo:   ng-select#termoSolicitado (input interno: .ng-input input)
 *  - Qtd:     #termoQtdSolicitada
 *  - Valor:   #termoValorSolicitado (disabled)
 *  - Data:    #termoDataRealização (opcional)
 *  - Confirmar: button[aria-label="Confirmar Honorário"]
 */
(() => {
  // ✅ Reinjeção vira continue
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
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_trt_ngselect_frame_v1";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // =========================
  // ✅ Códigos: SOMENTE do KIT (payload.codes)
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const getCodes = () => codesFromPopup;

  // =========================
  // ✅ Auto-FRAME resolver
  // =========================
  const CONFIRM_SEL = "button[aria-label='Confirmar Honorário']";

  function safeHas(win, selector) {
    try { return !!win?.document?.querySelector(selector); } catch { return false; }
  }

  async function findTargetWindow(timeoutMs = 20000) {
    const t0 = Date.now();

    while (Date.now() - t0 < timeoutMs) {
      // 1) document atual
      if (safeHas(window, CONFIRM_SEL)) return window;

      // 2) todos os frames acessíveis
      const frames = Array.from(window.frames || []);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (safeHas(f, CONFIRM_SEL)) return f;
      }

      await delay(200);
    }
    return null;
  }

  // =========================
  // Helpers (usando doc do frame certo)
  // =========================
  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function pressEnter(el) {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function ghostType(el, text, charDelay = 22) {
    if (!el) return;
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

  async function waitFor(fn, { timeoutMs = 30000, stepMs = 150 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const v = fn();
        if (v) return v;
      } catch {}
      await delay(stepMs);
    }
    return null;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // =========================
  // Runner core (usa targetWin + doc)
  // =========================
  async function buildCtx() {
    const targetWin = await findTargetWindow(20000);
    if (!targetWin) return null;

    const doc = targetWin.document;
    const q = (sel, root = doc) => root.querySelector(sel);

    function codigoInput() { return q("input#termoCodigoSolicitado"); }
    function qtdInput()    { return q("input#termoQtdSolicitada"); }
    function valorInput()  { return q("input#termoValorSolicitado"); }
    function dataInput()   { return q("input#termoDataRealização"); }
    function termoNgSelect(){ return q("ng-select#termoSolicitado"); }
    function termoInnerInput() {
      const ns = termoNgSelect();
      if (!ns) return null;
      return ns.querySelector(".ng-input input[type='text']") || null;
    }

    function confirmarBtn() {
      // O seu botão exato:
      const a = q("button[aria-label='Confirmar Honorário']");
      if (a) return a;

      // Fallbacks
      const b = Array.from(doc.querySelectorAll("button"))
        .find(btn => (btn.getAttribute("aria-label") || "").toLowerCase().includes("confirmar"));
      if (b) return b;

      const c = Array.from(doc.querySelectorAll("button"))
        .find(btn => (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() === "confirmar");
      if (c) return c;

      const d = q("button.botao-success");
      if (d) return d;

      return null;
    }

    function isBtnDisabled(btn) {
      if (!btn) return true;
      const aria = (btn.getAttribute("aria-disabled") || "").toLowerCase();
      return btn.disabled || aria === "true";
    }

    function termoHasValue() {
      const ns = termoNgSelect();
      if (!ns) return false;
      if (ns.querySelector(".ng-value, .ng-value-label")) return true;
      const ti = termoInnerInput();
      return ((ti?.value || "").trim().length > 0);
    }

    function formReady() {
      return !!codigoInput() && !!qtdInput() && !!termoNgSelect() && !!confirmarBtn();
    }

    async function waitFormReset(prevCode, { timeoutMs = 25000 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const ci = codigoInput();
        if (ci) {
          const v = (ci.value || "").trim();
          if (v === "" || v !== String(prevCode)) return "codigo_reset";
        }
        await delay(200);
      }
      return "timeout";
    }

    return {
      targetWin, doc, q,
      codigoInput, qtdInput, valorInput, dataInput, termoNgSelect, termoInnerInput,
      confirmarBtn, isBtnDisabled, termoHasValue, formReady, waitFormReset
    };
  }

  // =========================
  // ✅ State machine
  // =========================
  async function stepOnce() {
    const ctx = await buildCtx();
    if (!ctx) {
      warn("Frame correto não encontrado (ainda). Vou tentar no próximo tick…");
      return;
    }

    // log “onde está rodando”
    try { log("🎯 Frame alvo:", ctx.targetWin.location?.href || "(sem href)"); } catch { log("🎯 Frame alvo: (sem acesso a href)"); }

    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",       // idle | after_enter | confirming | waiting_reset
      lastCode: null,
      codes: null,
      clickedAt: null
    };

    // ✅ codes do kit OU estado salvo
    const codes = st.codes || getCodes();
    st.codes = codes;

    if (!codes || !codes.length) {
      warn("Sem payload.codes (kit). Rode pelo popup.js para injetar payload.codes.");
      return;
    }

    // finalizou
    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // aguarda form pronto no frame certo
    if (!ctx.formReady()) {
      await waitFor(() => ctx.formReady(), { timeoutMs: 90000 });
      if (!ctx.formReady()) {
        err("Form não ficou pronto no frame alvo.");
        return;
      }
    }

    // evita clique duplicado
    if (st.phase === "confirming" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // =========================
    // Phase: waiting_reset
    // =========================
    if (st.phase === "waiting_reset" && st.lastCode) {
      const why = await ctx.waitFormReset(st.lastCode, { timeoutMs: 25000 });
      if (why === "timeout") {
        warn("⏳ Ainda esperando reset do form…", { code: st.lastCode });
        saveState(st);
        return;
      }
      log("✅ Confirmado / reset detectado:", { code: st.lastCode, why });

      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    // =========================
    // Phase: after_enter
    // =========================
    if (st.phase === "after_enter" && st.lastCode) {
      // espera termo preencher
      const ok = await (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 8000) {
          if (ctx.termoHasValue()) return true;
          await delay(200);
        }
        return false;
      })();

      if (!ok) {
        // cutuca ng-select
        const ti = ctx.termoInnerInput();
        if (ti) {
          ti.focus();
          pressEnter(ti);
          await delay(600);
        }
      }

      // Qtd default = 1
      const qtd = ctx.qtdInput();
      if (qtd) {
        const v = String(qtd.value || "").trim();
        if (!v || v === "0") {
          await ghostType(qtd, "1", 12);
          log("✅ Qtd preenchida: 1");
        }
      }

      // Data (opcional) = hoje se vazio
      const dt = ctx.dataInput();
      if (dt) {
        const v = String(dt.value || "").trim();
        if (!v) {
          dt.focus();
          dt.value = todayISO();
          fire(dt, "input"); fire(dt, "change");
          log("✅ Data preenchida:", dt.value);
        }
      }

      // Confirmar
      const btn = ctx.confirmarBtn();
      if (!btn) { err("Botão Confirmar não encontrado no frame alvo."); return; }

      if (ctx.isBtnDisabled(btn)) {
        warn("⚠️ Confirmar parece desabilitado. Vou aguardar e tentar mesmo assim…");
        await delay(1200);
      }

      st.phase = "confirming";
      st.clickedAt = Date.now();
      saveState(st);

      btn.click();
      log("🖱️ Confirmar clicado:", st.lastCode);

      st.phase = "waiting_reset";
      saveState(st);
      return;
    }

    // =========================
    // Phase: idle
    // =========================
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const code = codes[st.idx];
    const ci = ctx.codigoInput();
    if (!ci) { err("Campo #termoCodigoSolicitado não encontrado no frame alvo."); return; }

    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    // limpa campos
    try {
      ci.focus();
      ci.value = "";
      fire(ci, "input"); fire(ci, "change");

      const qtd = ctx.qtdInput();
      if (qtd) { qtd.value = ""; fire(qtd, "input"); fire(qtd, "change"); }
    } catch {}

    // digita + ENTER
    await ghostType(ci, code, 20);
    pressEnter(ci);

    st.running = true;
    st.lastCode = code;
    st.phase = "after_enter";
    saveState(st);
  }

  // =========================
  // ✅ Resume + Watchdog
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
  // ✅ Boot (KIT-only)
  // =========================
  const st0 = loadState();

  // 1) Se já estava rodando, continua
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 150);
  }
  // 2) Se veio do kit, inicia
  else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 250);
  }
  // 3) Sem kit => não roda
  else {
    warn("Runner carregou, mas SEM payload.codes. Rode pelo popup.js (kit) e injete novamente.");
  }

  // Watchdog
  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 900);

  log("🛡️ Runner + Watchdog (TRT/ng-select + frame) ativos", { total: getCodes().length });
})();
