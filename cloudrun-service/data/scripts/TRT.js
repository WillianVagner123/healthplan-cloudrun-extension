/*@maskara{
  "mustUrlIncludes": ["trf_social", "honorarios", "solicitacoes", "sp-sadt", "gdf.maida.health"],
  "detectAny": [
    "input#termoCodigoSolicitado",
    "ng-select#termoSolicitado",
    "input#termoQtdSolicitada",
    "button[aria-label*='Confirmar']"
  ],
  "actions": { "focus": "input#termoCodigoSolicitado" }
}*/

/**
 * TRT/TRF (Nebular + Angular / ng-select) • Inserção em lote (KIT-only)
 * Usa os IDs do HTML:
 *  - Código:  #termoCodigoSolicitado
 *  - Termo:   ng-select#termoSolicitado (input interno .ng-input input)
 *  - Qtd:     #termoQtdSolicitada
 *  - Data:    #termoDataRealização (opcional)
 *  - Confirmar: button[aria-label="Confirmar Honorário"] / texto "Confirmar"
 *
 * Fonte de códigos: SOMENTE do popup.js (payload.codes). Sem fallback.
 * Estado persistente: localStorage (continua após reinjeção / reload parcial).
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
  const STORE_KEY = "hp_runner_state_trt_ngselect_v1";
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
    catch { return null; }
  };
  const saveState = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // =========================
  // ✅ Codes vêm SOMENTE do KIT (payload.codes)
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  function getCodes() { return codesFromPopup; }

  // =========================
  // DOM helpers
  // =========================
  const q = (sel, root = document) => root.querySelector(sel);

  function codigoInput() { return q("input#termoCodigoSolicitado"); }
  function qtdInput()    { return q("input#termoQtdSolicitada"); }
  function dataInput()   { return q("input#termoDataRealização"); }
  function termoNgSelect(){ return q("ng-select#termoSolicitado"); }
  function termoInnerInput() {
    const ns = termoNgSelect();
    if (!ns) return null;
    return ns.querySelector(".ng-input input[type='text']") || null;
  }

  function confirmarBtn() {
    return (
      q("button[aria-label='Confirmar Honorário']") ||
      Array.from(document.querySelectorAll("button"))
        .find(b => ((b.getAttribute("aria-label") || "").toLowerCase().includes("confirmar"))) ||
      Array.from(document.querySelectorAll("button"))
        .find(b => ((b.textContent || "").trim().toLowerCase() === "confirmar")) ||
      Array.from(document.querySelectorAll("button"))
        .find(b => ((b.textContent || "").toLowerCase().includes("confirmar"))) ||
      null
    );
  }

  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
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

  function pressEnter(el) {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
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

  function formReady() {
    return !!codigoInput() && !!qtdInput() && !!confirmarBtn() && !!termoNgSelect();
  }

  function isBtnDisabled(btn) {
    if (!btn) return true;
    const aria = (btn.getAttribute("aria-disabled") || "").toLowerCase();
    return btn.disabled || aria === "true";
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  // Heurística: ng-select tem “valor selecionado” quando aparece .ng-value ou quando input interno tem texto
  function termoHasValue() {
    const ns = termoNgSelect();
    if (!ns) return false;
    if (ns.querySelector(".ng-value, .ng-value-label")) return true;
    const ti = termoInnerInput();
    const v = (ti?.value || "").trim();
    return v.length > 0;
  }

  // Após confirmar, normalmente o formulário limpa o Código ou muda
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

  // =========================
  // ✅ State machine
  // =========================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",       // idle | after_enter | confirming | waiting_reset
      lastCode: null,
      codes: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    st.codes = codes;

    if (!codes || !codes.length) {
      warn("Sem codes no payload (kit). Rode pelo popup.js para injetar payload.codes.");
      return;
    }

    // finalizou
    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // aguarda form ficar pronto
    if (!formReady()) {
      await waitFor(() => formReady(), { timeoutMs: 90000 });
      if (!formReady()) { err("Form ainda não ficou pronto."); return; }
    }

    // Evita duplo clique em reinjeções
    if (st.phase === "confirming" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // =========================
    // Phase: waiting_reset (após Confirmar)
    // =========================
    if (st.phase === "waiting_reset" && st.lastCode) {
      const why = await waitFormReset(st.lastCode, { timeoutMs: 25000 });
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
    // Phase: after_enter (aguarda ng-select carregar/selecionar)
    // =========================
    if (st.phase === "after_enter" && st.lastCode) {
      // espera Termo ter algo
      const ok = await (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 8000) {
          if (termoHasValue()) return true;
          await delay(200);
        }
        return false;
      })();

      if (!ok) {
        // “cutuca” ng-select: foco + ENTER
        const ti = termoInnerInput();
        if (ti) {
          ti.focus();
          pressEnter(ti);
          await delay(600);
        }
      }

      // preenche qtd (default 1 se vazio/0)
      const qtd = qtdInput();
      if (qtd) {
        const v = String(qtd.value || "").trim();
        if (!v || v === "0") {
          await ghostType(qtd, "1", 12);
          log("✅ Qtd preenchida: 1");
        }
      }

      // (opcional) data: preenche hoje se vazio
      const dt = dataInput();
      if (dt) {
        const v = String(dt.value || "").trim();
        if (!v) {
          dt.focus();
          dt.value = todayISO();
          fire(dt, "input"); fire(dt, "change");
          log("✅ Data preenchida:", dt.value);
        }
      }

      // clica Confirmar
      const btn = confirmarBtn();
      if (!btn) { err("Botão Confirmar não encontrado."); return; }

      if (isBtnDisabled(btn)) {
        warn("⚠️ Botão Confirmar parece desabilitado. Vou esperar um pouco e tentar…");
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
    // Phase: idle → inicia próximo código
    // =========================
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const code = codes[st.idx];
    const ci = codigoInput();
    if (!ci) { err("Campo #termoCodigoSolicitado não encontrado."); return; }

    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    // limpa campos principais
    try {
      ci.focus();
      ci.value = "";
      fire(ci, "input"); fire(ci, "change");
      const qtd = qtdInput();
      if (qtd) { qtd.value = ""; fire(qtd, "input"); fire(qtd, "change"); }
    } catch {}

    // digita código + ENTER (lookup)
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

  // 1) Se já estava rodando (estado salvo), continua
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 150);
  }
  // 2) Se veio do kit (payload.codes), inicia
  else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 250);
  }
  // 3) Se não veio nada, NÃO roda
  else {
    warn("Runner carregou, mas SEM payload.codes. Abra pelo popup.js (kit) e rode de novo.");
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 900);

  log("🛡️ Runner + Watchdog (TRT/ng-select) ativos", { total: getCodes().length });
})();
