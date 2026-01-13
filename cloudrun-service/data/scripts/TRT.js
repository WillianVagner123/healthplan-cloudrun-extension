/*@maskara{
  "mustUrlIncludes": [
    "audicare.valoragil3.com.br",
    "/Web/autorizacaoDeAtendimento/Autorizacao.aspx",
    "interface.audicare.valoragil3.com.br"
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
  // =========================
  // 0) REINJEÇÃO = CONTINUE
  // =========================
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
  // 1) SELECTORS DO FORM
  // =========================
  const SEL = {
    codigo: "#termoCodigoSolicitado",
    qtd: "#termoQtdSolicitada",
    valor: "#termoValorSolicitado",
    termoNg: "ng-select#termoSolicitado",
    confirmarBtn: "button[aria-label='Confirmar Honorário']"
  };

  function hasFormHere(doc = document) {
    try {
      return !!(doc.querySelector(SEL.codigo) && doc.querySelector(SEL.qtd) && doc.querySelector(SEL.termoNg));
    } catch {
      return false;
    }
  }

  // =========================
  // 2) ENCONTRAR O FRAME CERTO (sem depender do background)
  //    - se já estamos no frame certo, segue
  //    - se estamos no top e o form está dentro de um iframe SAME-ORIGIN, injeta lá
  //    - se for cross-origin, NÃO tem como ler/injetar via JS do frame pai
  //      → nesse caso você PRECISA que o Maskara injete allFrames OU use mustUrlIncludes
  //        que bata no URL do iframe
  // =========================
  async function findSameOriginFrameWithForm(maxDepth = 6) {
    // retorna window (frame) onde o form existe, ou null
    const visited = new Set();

    function iter(win, depth) {
      if (!win || visited.has(win) || depth > maxDepth) return null;
      visited.add(win);

      try {
        const d = win.document;
        if (hasFormHere(d)) return win;
      } catch {
        // cross-origin: não dá pra acessar
        return null;
      }

      // desce para filhos
      let frames = [];
      try {
        frames = Array.from(win.frames || []);
      } catch {
        frames = [];
      }

      for (const child of frames) {
        const hit = iter(child, depth + 1);
        if (hit) return hit;
      }
      return null;
    }

    return iter(window.top || window, 0);
  }

  function installFrameSig() {
    try {
      window.__HP_FRAME_SIG__ = window.__HP_FRAME_SIG__ || {};
      window.__HP_FRAME_SIG__.TRT_HON = true;
    } catch {}
  }

  // =========================
  // 3) FUNÇÕES UTILITÁRIAS
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

  function anyBusyOverlay(doc = document) {
    const sel = [
      ".spinner", ".spinner-border", ".loading", ".loading-mask", ".loading-overlay",
      ".ngx-spinner-overlay", ".ngx-spinner", ".block-ui", ".overlay",
      ".cdk-overlay-backdrop", ".cdk-global-overlay-wrapper",
      "[aria-busy='true']"
    ].join(",");

    try {
      if (doc.body?.getAttribute("aria-busy") === "true") return true;
      return !!doc.querySelector(sel);
    } catch {
      return false;
    }
  }

  async function waitNotBusy(timeoutMs = 15000, doc = document) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (!anyBusyOverlay(doc)) return true;
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

  function dispatchClickSequence(el) {
    try { el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
    try { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); } catch {}
    try { el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true })); } catch {}
    try { el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse" })); } catch {}
    try { el.click(); } catch {}
  }

  async function safeClick(el, timeoutMs = 12000, doc = document) {
    if (!el) return false;
    await waitNotBusy(timeoutMs, doc);
    ensureIntoView(el);
    forceFocus(el);

    // aguarda habilitar
    const okEnabled = await waitFor(() => {
      try {
        const disabled = !!el.disabled || el.getAttribute("aria-disabled") === "true";
        return !disabled;
      } catch { return true; }
    }, 5000, 80);

    if (!okEnabled) warn("Botão ainda parece desabilitado (tentando assim mesmo)." );
    dispatchClickSequence(el);
    return true;
  }

  // =========================
  // 4) RUNNER (executa dentro do frame certo)
  // =========================
  async function runInThisFrame() {
    installFrameSig();

    // DEBUG: mostra em qual frame caiu
    try {
      const hasCodigo = !!document.querySelector(SEL.codigo);
      const hasQtd    = !!document.querySelector(SEL.qtd);
      const hasBtn    = !!document.querySelector(SEL.confirmarBtn);
      console.log("TRT: frame-check", {
        href: location.href,
        isTop: window.top === window,
        hasCodigo, hasQtd, hasBtn,
        payloadKeys: Object.keys(payload || {})
      });
    } catch {}

    // Guard
    if (!hasFormHere()) {
      warn("Este frame não contém o form TRT (código/qtd/termo)." );
      return;
    }

    // KIT-only
    const codesFromPopup = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
    if (!codesFromPopup.length) {
      warn("Sem payload.codes (kit)." );
      return;
    }

    // Tuning
    const FAST = !!(payload.fast || payload.mode === "fast");
    const WAIT_TERM_MS   = Number(payload.waitTermMs)   > 0 ? Number(payload.waitTermMs)   : (FAST ? 8000  : 20000);
    const WAIT_RESET_MS  = Number(payload.waitResetMs)  > 0 ? Number(payload.waitResetMs)  : (FAST ? 9000  : 20000);
    const STEP_MS        = Number(payload.stepMs)       > 0 ? Number(payload.stepMs)       : (FAST ? 80    : 150);
    const WATCHDOG_MS    = Number(payload.watchdogMs)   > 0 ? Number(payload.watchdogMs)   : (FAST ? 260   : 650);
    const POST_CLICK_GAP = Number(payload.postClickGap) > 0 ? Number(payload.postClickGap) : (FAST ? 450   : 900);

    // Estado persistente
    const STORE_KEY = "hp_runner_state_trt_honorarios_v4";
    const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
    const saveState  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
    const clearState = () => localStorage.removeItem(STORE_KEY);

    // Quantidade padrão (se quiser SEMPRE 1, deixe DEFAULT_QTY=1 e ignore os maps)
    const DEFAULT_QTY = 1;

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

    // DOM getters
    const codigoEl = () => document.querySelector(SEL.codigo);
    const qtdEl    = () => document.querySelector(SEL.qtd);
    const valorEl  = () => document.querySelector(SEL.valor);
    const termoNg  = () => document.querySelector(SEL.termoNg);
    const confirmarBtn = () =>
      document.querySelector(SEL.confirmarBtn) ||
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

        // reset detectado por limpar ou mudar
        if (cv === "" || cv !== String(prevCode) || qv === "") return true;
        await delay(STEP_MS);
      }
      return false;
    }

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
        warn("Sem codes." );
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

      // 4) idle: inserir próximo código
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

    log("🛡️ Runner + Watchdog (TRT • código → qtd → confirmar) ativos", {
      total: codesFromPopup.length,
      FAST,
      DEFAULT_QTY,
      WAIT_TERM_MS,
      WAIT_RESET_MS,
      WATCHDOG_MS
    });
  }

  // =========================
  // 5) BOOTSTRAP: se não estamos no frame certo, tenta achar e executar lá
  // =========================
  (async () => {
    // caso já esteja no frame certo
    if (hasFormHere()) {
      await runInThisFrame();
      return;
    }

    // se estamos no top, tenta achar um iframe SAME-ORIGIN contendo o form
    if (window.top === window) {
      const hit = await findSameOriginFrameWithForm(6);
      if (hit && hit !== window) {
        log("🔎 Form encontrado em iframe same-origin. Executando lá…", {
          topHref: location.href,
          hitHref: (() => { try { return hit.location.href; } catch { return "(sem acesso)"; } })()
        });

        // injeta a função runInThisFrame no contexto do iframe
        try {
          hit.eval(`(${runInThisFrame.toString()})()`);
          return;
        } catch (e) {
          err("Falha ao executar no iframe (eval).");
          err(e);
        }
      }

      warn("⚠️ Não encontrei iframe same-origin com o form. Provável cross-origin.");
      warn("Se for cross-origin: o Maskara precisa injetar ALL-FRAMES e o mustUrlIncludes precisa bater no URL do iframe.");
    } else {
      warn("⚠️ Estamos em um iframe que não tem o form. Se for cross-origin, depende do allFrames do Maskara.");
    }
  })();
})();
