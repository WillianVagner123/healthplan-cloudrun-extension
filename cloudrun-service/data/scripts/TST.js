
/*@maskara{
  "mustUrlIncludes": ["prosocial.trf1.jus.br","/prosocial/","pagemain.aspx"],
  "detectAny": [
    "input[name='adicionarProcedimento']",
    "select[name='procedimento.codTabela']",
    "#codItemProcedimento",
    "#procedimento\\.numQtdSolicitada"
  ],
  "actions": [{"type":"focus","selector":"#codItemProcedimento"}]
}*/

(() => {
  // =========================
  // ✅ Frame/Doc filter
  // =========================
  const HAS_FORM =
    !!document.querySelector("input[name='adicionarProcedimento']") ||
    !!document.querySelector("#codItemProcedimento") ||
    !!document.querySelector("select[name='procedimento.codTabela']");

  if (!HAS_FORM) return;

  // Reinjeção = continue
  if (window.__HP_TRF_PRO_SOCIAL_PROC_API__?.resume) {
    try { window.__HP_TRF_PRO_SOCIAL_PROC_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_TRF_PRO_SOCIAL_PROC_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TRF_PRO_SOCIAL_PROC";

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  // =========================
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_trf_pro_social_proc_v1";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  // Codes vêm do popup.js (kit)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    const st = loadState();
    if (codesFromPopup.length) return codesFromPopup.map(String);
    if (st?.codes?.length) return st.codes.map(String);
    return [];
  }

  // =========================
  // ✅ Robust: hook XHR + fetch (pra esperar consultarProcedimentoAjax)
  // =========================
  (function hookNetOnce() {
    if (window.__HP_NET_HOOKED__) return;
    window.__HP_NET_HOOKED__ = true;
    window.__HP_NET_PENDING__ = 0;

    // XHR
    try {
      const _open = XMLHttpRequest.prototype.open;
      const _send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(...args) {
        this.__hp_tracked = true;
        return _open.apply(this, args);
      };
      XMLHttpRequest.prototype.send = function(...args) {
        if (this.__hp_tracked) {
          window.__HP_NET_PENDING__++;
          const dec = () => { window.__HP_NET_PENDING__ = Math.max(0, window.__HP_NET_PENDING__ - 1); };
          this.addEventListener("loadend", dec, { once: true });
          this.addEventListener("error", dec, { once: true });
          this.addEventListener("abort", dec, { once: true });
        }
        return _send.apply(this, args);
      };
    } catch {}

    // fetch
    try {
      const _fetch = window.fetch;
      if (typeof _fetch === "function") {
        window.fetch = function(...args) {
          window.__HP_NET_PENDING__++;
          return _fetch.apply(this, args)
            .catch((e) => { throw e; })
            .finally(() => { window.__HP_NET_PENDING__ = Math.max(0, window.__HP_NET_PENDING__ - 1); });
        };
      }
    } catch {}
  })();

  async function waitNetIdle({ minWaitMs = 250, timeoutMs = 12000 } = {}) {
    const t0 = Date.now();
    await delay(minWaitMs);
    while (Date.now() - t0 < timeoutMs) {
      if ((window.__HP_NET_PENDING__ || 0) <= 0) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // Helpers DOM
  // =========================
  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function clickSafe(el) {
    if (!el) return false;
    try { el.focus?.(); } catch {}
    try { el.click(); return true; } catch {}
    try {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {}
    return false;
  }

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  function fireKey(el, type, key, keyCode = 0) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, keyCode, which: keyCode }));
  }

  async function waitFor(selector, { timeoutMs = 30000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(120);
    }
    return null;
  }

  async function waitForVisible(selector, timeoutMs = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
      await delay(120);
    }
    return null;
  }

  // =========================
  // ✅ Digitar número por número (sem Ctrl+A, campo vem vazio)
  // =========================
  async function typeDigits(el, text, { keyDelay = 70 } = {}) {
    el.focus();
    await delay(80);

    // não limpa: o portal já entrega vazio
    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      fireKey(el, "keydown", ch, code);
      fireKey(el, "keypress", ch, code);

      // tenta inserção “humana”
      try { document.execCommand && document.execCommand("insertText", false, ch); } catch {}

      // eventos que muitas máscaras escutam
      try { el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: ch, inputType: "insertText" })); } catch {}
      try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); } catch { fire(el, "input"); }

      fireKey(el, "keyup", ch, code);
      await delay(keyDelay);
    }

    fire(el, "change");
    return true;
  }

  // =========================
  // ✅ Select Tabela = TUSS (value=16 OU texto contém "TUSS")
  // =========================
  function setTabelaTUSS(sel) {
    if (!sel) return false;
    const opts = Array.from(sel.options || []);
    const byVal = opts.find(o => String(o.value) === "16");
    const byTxt = opts.find(o => /tuss/i.test(String(o.text || "")));
    const pick = byVal || byTxt;
    if (!pick) return false;

    sel.value = pick.value;
    fire(sel, "input");
    fire(sel, "change");
    return true;
  }

  // =========================
  // ✅ Botões/Campos específicos
  // =========================
  const S = {
    btnAddProc: "input[name='adicionarProcedimento']",
    selTabela: "select[name='procedimento.codTabela']",
    inputProc: "#codItemProcedimento",
    inputQtd: "#procedimento\\.numQtdSolicitada",

    // se existir algum confirmar/salvar do “item”, tentamos clicar
    btnConfirmCandidates: [
      "input[name='confirmarProcedimento']",
      "input[name='confirmar']",
      "input[value*='Confirmar']",
      "button[name='confirmar']",
      "button:contains('Confirmar')" // (nem sempre funciona no querySelector)
    ]
  };

  function findConfirmButton() {
    // sem :contains no CSS; então a gente tenta por texto manualmente também
    for (const sel of S.btnConfirmCandidates) {
      try {
        if (sel.includes(":contains")) continue;
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch {}
    }
    // fallback: busca por texto “Confirmar”
    const all = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
    const found = all.find(el => {
      const txt = (el.value || el.textContent || "").trim();
      return /confirmar/i.test(txt) && isVisible(el);
    });
    return found || null;
  }

  // =========================
  // ✅ Execução de 1 item
  // =========================
  async function insertOne(code) {
    // 1) clicar "Adicionar Procedimento" (abre/ativa a linha)
    const btn = await waitForVisible(S.btnAddProc, 30000);
    if (!btn) throw new Error("Botão Adicionar Procedimento não encontrado");
    clickSafe(btn);

    // 2) garantir select tabela e setar TUSS
    const selTab = await waitFor(S.selTabela, { timeoutMs: 30000 });
    if (!selTab) throw new Error("Select Tabela não encontrado");
    const okTab = setTabelaTUSS(selTab);
    if (!okTab) warn("Não achei opção TUSS; verifique values/textos do select.");

    // 3) procedimento: digita e blur (dispara consultarProcedimentoAjax)
    const inpProc = await waitForVisible(S.inputProc, 30000);
    if (!inpProc) throw new Error("Campo Procedimento (codItemProcedimento) não encontrado");

    // (campo vem vazio)
    await typeDigits(inpProc, code, { keyDelay: 80 });

    // dispara onblur consultarProcedimentoAjax(this)
    inpProc.blur();
    fire(inpProc, "blur");

    // 4) espera AJAX assentar (GetValorProcedimento / consultarProcedimentoAjax)
    await waitNetIdle({ minWaitMs: 300, timeoutMs: 15000 });

    // 5) quantidade
    const inpQtd = await waitForVisible(S.inputQtd, 30000);
    if (!inpQtd) throw new Error("Campo Quantidade não encontrado");

    inpQtd.focus();
    await delay(80);
    // aqui pode setar value porque é simples; mas disparamos eventos
    inpQtd.value = "1";
    fire(inpQtd, "input");
    fire(inpQtd, "change");
    inpQtd.blur();
    fire(inpQtd, "blur");

    // 6) se existir botão confirmar do item, clica; senão só aguarda um tiquinho e segue
    const btnConf = findConfirmButton();
    if (btnConf) {
      clickSafe(btnConf);
      await waitNetIdle({ minWaitMs: 250, timeoutMs: 12000 });
      await delay(200);
    } else {
      // muitos desses formulários salvam o item automaticamente quando o ajax retorna + qtd preenchida
      await delay(450);
    }

    return true;
  }

  // =========================
  // ✅ Runner principal + resume
  // =========================
  async function runAll() {
    const st = loadState() || { running: false, idx: 0, codes: null };
    const codes = st.codes || getCodes();
    if (!codes.length) {
      warn("Sem codes (payload vazio e sem estado salvo).");
      return;
    }

    st.codes = codes;
    st.running = true;
    saveState(st);

    for (let i = st.idx; i < codes.length; i++) {
      const code = String(codes[i]).trim();
      st.idx = i;
      st.lastCode = code;
      saveState(st);

      log(`▶️ (${i + 1}/${codes.length})`, code);

      try {
        await insertOne(code);
        log("✅ OK", code);
      } catch (e) {
        err("❌ Falha no código", code, e);
        // Para e mantém estado pra retomar
        return;
      }

      st.idx = i + 1;
      saveState(st);

      await delay(500);
    }

    log("🎉 Finalizado!", { total: codes.length });
    clearState();
  }

  // API p/ reinjeção
  let inFlight = false;
  async function resume(reason = "tick") {
    if (inFlight) return;
    inFlight = true;
    try { await runAll(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_TRF_PRO_SOCIAL_PROC_API__.resume = resume;

  // =========================
  // ✅ UI botão flutuante
  // =========================
  const btn = document.createElement("button");
  btn.id = "hpRunnerFloatingBtn";
  btn.type = "button";
  btn.textContent = "⚡ Inserir Procedimentos (TUSS)";
  btn.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    padding: 12px 14px; border-radius: 14px; border: none;
    background: #0d6efd; color: #fff; font-weight: 800; cursor: pointer;
    box-shadow: 0 10px 24px rgba(0,0,0,.25); user-select: none;
  `;
  document.body.appendChild(btn);

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Clique para inserir lista do kit.";
  hint.style.cssText = `
    position: fixed; right: 16px; bottom: 62px; z-index: 2147483647;
    padding: 8px 10px; border-radius: 12px;
    background: rgba(0,0,0,.65); color: rgba(255,255,255,.92);
    font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
    box-shadow: 0 10px 24px rgba(0,0,0,.20);
  `;
  document.body.appendChild(hint);

  btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      hint.textContent = "Nenhum código no payload. Rode pelo popup.";
      warn("Nenhum código no payload.");
      return;
    }

    // salva codes no state (pra retomar)
    const st = loadState() || {};
    st.codes = list.map(String);
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    saveState(st);

    hint.textContent = `Executando ${list.length}…`;
    await resume("button");
    hint.textContent = "Finalizado ✅ (ou veja console se parou)";
  };

  // Auto-retoma se já estava rodando
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto_resume"), 250);
  }

  log("🛡️ Runner TRF_PRO_SOCIAL_PROC ativo", { total: getCodes().length });
})();
