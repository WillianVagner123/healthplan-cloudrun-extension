/*@maskara{
  "mustUrlIncludes": ["audicare.valoragil3.com.br", "/Web/autorizacaoDeAtendimento/Autorizacao.aspx"],
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

  // =========================
  // DEBUG: mostra em qual frame caiu
  // =========================
  try {
    const hasCodigo = !!document.querySelector("#termoCodigoSolicitado");
    const hasQtd    = !!document.querySelector("#termoQtdSolicitada");
    const hasBtn    = !!document.querySelector("button[aria-label='Confirmar Honorário']");
    console.log("TRT: frame-check", {
      href: location.href,
      isTop: window.top === window,
      hasCodigo, hasQtd, hasBtn
    });
  } catch {}

  // =========================
  // Guard + espera Angular renderizar
  // =========================
  async function waitSel(sel, timeoutMs = 60000, stepMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = document.querySelector(sel);
      if (el) return el;
      await delay(stepMs);
    }
    return null;
  }

  async function ensureFormReady() {
    const ci = await waitSel("#termoCodigoSolicitado", 60000);
    const qi = await waitSel("#termoQtdSolicitada", 60000);
    const btn = await waitSel("button[aria-label='Confirmar Honorário']", 60000);
    const ns = await waitSel("ng-select#termoSolicitado", 60000);
    return !!(ci && qi && btn && ns);
  }

  // Se este frame não tem o form, não roda (allFrames)
  // (Mas espera um pouco porque Angular pode renderizar depois)
  (async () => {
    const ok = await ensureFormReady();
    if (!ok) return; // frame errado ou não renderizou aqui

    // =========================
    // KIT-only
    // =========================
    const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
    if (!codesFromPopup.length) {
      warn("Sem payload.codes (kit).");
      return;
    }

    // =========================
    // Estado persistente
    // =========================
    const STORE_KEY = "hp_runner_state_trt_honorarios_v3";
    const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
    const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
    const clearState = () => localStorage.removeItem(STORE_KEY);

    // =========================
    // Quantidade: por item OU default
    // =========================
    const DEFAULT_QTY =
      (Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade) > 0)
        ? Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade)
        : 11;

    function getQtyForCode(code) {
      const items = Array.isArray(payload.items) ? payload.items : null;
      if (items) {
        const hit = items.find(x => String(x?.code ?? x?.codigo ?? "") === String(code));
        const q = Number(hit?.qtd ?? hit?.qty ?? hit?.quantidade);
        if (Number.isFinite(q) && q > 0) return q;
      }
      return DEFAULT_QTY;
    }

    // =========================
    // Angular-friendly setter + eventos
    // =========================
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

    async function waitFor(fn, timeoutMs = 25000, stepMs = 200) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { if (fn()) return true; } catch {}
        await delay(stepMs);
      }
      return false;
    }

    // =========================
    // Selectors do seu HTML
    // =========================
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
        const ci = codigoEl();
        const cv = (ci?.value || "").trim();
        if (cv === "" || cv !== String(prevCode)) return true;
        await delay(200);
      }
      return false;
    }

    // =========================
    // State machine + watchdog
    // =========================
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

      if (!codes?.length) {
        warn("Sem codes.");
        return;
      }

      if (st.running && st.idx >= codes.length) {
        log("🎉 Finalizado! Total:", codes.length);
        clearState();
        return;
      }

      // 1) aguardando reset
      if (st.phase === "waiting_reset" && st.lastCode) {
        const ok = await waitResetAfterConfirm(st.lastCode, 25000);
        if (!ok) {
          warn("⏳ Aguardando reset…", { code: st.lastCode });
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

      // 2) após código: esperar termo/valor e preencher qtd
      if (st.phase === "after_code" && st.lastCode) {
        const vb = valorEl();
        await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), 25000, 200);

        const qi = qtdEl();
        if (!qi) { err("Qtd input não encontrado."); return; }

        const qty = st.lastQty ?? getQtyForCode(st.lastCode);
        await typeValueAngular(qi, String(qty));
        qi.dispatchEvent(new Event("blur", { bubbles: true }));

        st.lastQty = qty;
        st.phase = "after_qty";
        saveState(st);
        return;
      }

      // 3) após qtd: confirmar
      if (st.phase === "after_qty" && st.lastCode) {
        const btn = confirmarBtn();
        if (!btn) { err("Botão Confirmar não encontrado."); return; }

        if (st.clickedAt && Date.now() - st.clickedAt < 1200) return;

        st.clickedAt = Date.now();
        saveState(st);

        btn.click();
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
      const qty = getQtyForCode(code);

      const ci = codigoEl();
      if (!ci) { err("#termoCodigoSolicitado não encontrado."); return; }

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

    // Boot: inicia/retoma
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
    }, 850);

    log("🛡️ Runner + Watchdog (TRT • código → qtd → confirmar) ativos", { total: codesFromPopup.length });
  })();
})();
