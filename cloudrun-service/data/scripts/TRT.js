/*@maskara{
  "mustUrlIncludes": ["audicare.valoragil3.com.br", "/Web/autorizacaoDeAtendimento/Autorizacao.aspx"],
  "frame": "iframe[src*='interface.audicare']",
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
      hasCodigo, hasQtd, hasBtn,
      payloadKeys: Object.keys(payload || {})
    });
  } catch {}

  // =========================
  // ASSINATURA: ajuda o background a confirmar o frame certo
  // =========================
  try {
    window.__HP_FRAME_SIG__ = window.__HP_FRAME_SIG__ || {};
    window.__HP_FRAME_SIG__.TRT_HON = true;
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
    // TUNING (aceleração opcional)
    // payload.fast=true acelera timeouts/intervalos
    // =========================
    const FAST = !!(payload.fast || payload.mode === "fast");
    const WAIT_TERM_MS   = Number(payload.waitTermMs)   > 0 ? Number(payload.waitTermMs)   : (FAST ? 8000  : 20000);
    const WAIT_RESET_MS  = Number(payload.waitResetMs)  > 0 ? Number(payload.waitResetMs)  : (FAST ? 9000  : 20000);
    const STEP_MS        = Number(payload.stepMs)       > 0 ? Number(payload.stepMs)       : (FAST ? 80    : 150);
    const WATCHDOG_MS    = Number(payload.watchdogMs)   > 0 ? Number(payload.watchdogMs)   : (FAST ? 260   : 650);
    const POST_CLICK_GAP = Number(payload.postClickGap) > 0 ? Number(payload.postClickGap) : (FAST ? 450   : 900);

    // =========================
    // Estado persistente
    // =========================
    const STORE_KEY = "hp_runner_state_trt_honorarios_v3";
    const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
    const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
    const clearState = () => localStorage.removeItem(STORE_KEY);

    // =========================
    // Quantidade: SEMPRE 1 por padrão (não depende do mouse)
    // Pode sobrescrever via payload.qtd ou items/qtyByCode se você quiser.
    // =========================
    const DEFAULT_QTY =
      (Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade ?? payload.qty) > 0)
        ? Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade ?? payload.qty)
        : 1;

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
      // 1) mapa por código
      const qMap = getQtyFromMap(code);
      if (qMap) return qMap;

      // 2) lista items
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

      // 3) fallback
      return DEFAULT_QTY;
    }

    // =========================
    // Anti-"depender do mouse": foco/scroll/overlay + clique programático robusto
    // =========================
    function isVisible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vw = window.innerWidth  || document.documentElement.clientWidth;
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    }

    function ensureIntoView(el) {
      try {
        if (!el) return;
        if (!isVisible(el)) el.scrollIntoView({ block: "center", inline: "center" });
      } catch {}
    }

    function forceFocus(el) {
      try {
        if (!el) return;
        ensureIntoView(el);
        el.focus({ preventScroll: true });
      } catch {
        try { el.focus(); } catch {}
      }
    }

    function anyBusyOverlay() {
      // genérico (Angular/Bootstrap/CDK/spinners comuns)
      const sel = [
        ".spinner", ".spinner-border", ".loading", ".loading-mask", ".loading-overlay",
        ".ngx-spinner-overlay", ".ngx-spinner", ".block-ui", ".overlay",
        ".cdk-overlay-backdrop", ".cdk-global-overlay-wrapper",
        "[aria-busy='true']"
      ].join(",");

      try {
        if (document.body?.getAttribute("aria-busy") === "true") return true;
        return !!document.querySelector(sel);
      } catch {
        return false;
      }
    }

    async function waitNotBusy(timeoutMs = 15000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (!anyBusyOverlay()) return true;
        await delay(80);
      }
      return false;
    }

    function dispatchClickSequence(el) {
      // sem “mouse”: apenas eventos básicos + click()
      try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
      try { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); } catch {}
      try { el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true })); } catch {}
      try { el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
      try { el.click(); } catch {}
    }

    async function safeClick(el, timeoutMs = 12000) {
      if (!el) return false;
      await waitNotBusy(timeoutMs);
      ensureIntoView(el);
      forceFocus(el);

      // aguarda habilitar
      const okEnabled = await waitFor(() => {
        try {
          const disabled = !!el.disabled || el.getAttribute("aria-disabled") === "true";
          return !disabled;
        } catch { return true; }
      }, 5000, 80);

      if (!okEnabled) warn("Botão ainda parece desabilitado (tentando assim mesmo).");

      dispatchClickSequence(el);
      return true;
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
      forceFocus(el);
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

    // reset mais rápido: código limpou OU qtd limpou OU mudou
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

        const ok = await waitResetAfterConfirm(st.lastCode, WAIT_RESET_MS);
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

        // espera termo/valor OU apenas fim do overlay
        await waitNotBusy(12000);
        await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), WAIT_TERM_MS, STEP_MS);

        const qi = qtdEl();
        if (!qi) { err("Qtd input não encontrado."); return; }

        // ✅ se você quer SEMPRE 1, troque a linha abaixo por: const qty = 1;
        const qty = st.lastQty ?? getQtyForCode(st.lastCode);

        await typeValueAngular(qi, String(qty));
        qi.dispatchEvent(new Event("blur", { bubbles: true }));
        await delay(140); // dá tempo pro Angular habilitar botão

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

      // ✅ Quer “1 sempre”? descomente e use este:
      // const qty = 1;
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
    }, WATCHDOG_MS);

    log("🛡️ Runner + Watchdog (TRT • código → qtd → confirmar) ativos", {
      total: codesFromPopup.length,
      FAST,
      DEFAULT_QTY,
      WAIT_TERM_MS,
      WAIT_RESET_MS,
      WATCHDOG_MS
    });
  })();
})();
