/*@maskara{
  "mustUrlIncludes": ["SolicitacaoSpSadtManter.do","tst","planevida","facilinformatica"],
  "detectAny": [
    "input[name='adicionarProcedimento']",
    "select[name='procedimento.codTabela']",
    "#codItemProcedimento",
    "#procedimento\\.numQtdSolicitada"
  ],
  "actions": [{"type":"focus","selector":"#codItemProcedimento"}]
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TST_TUSS_PROC";

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  // =========================
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_tst_tuss_proc_v1";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    const st = loadState();
    if (codesFromPopup.length) return codesFromPopup.map(String);
    if (st?.codes?.length) return st.codes.map(String);
    return [];
  }

  // =========================
  // ✅ Frame scan (same-origin)
  // =========================
  function tryFindInDoc(doc) {
    try {
      const btnAdd =
        doc.querySelector("input[name='adicionarProcedimento']") ||
        doc.querySelector("input[onclick*='abrirPopupProcOpmDesp']") ||
        Array.from(doc.querySelectorAll("input[type='button'],input[type='submit'],button,a")).find(el => {
          const t = (el.value || el.textContent || "").trim();
          const oc = el.getAttribute?.("onclick") || "";
          const title = el.getAttribute?.("title") || "";
          return /Adicionar Procedimento/i.test(t) || /Incluir Procedimento/i.test(title) || /abrirPopupProcOpmDesp/i.test(oc);
        }) ||
        null;

      const selTab = doc.querySelector("select[name='procedimento.codTabela']");
      const inpProc = doc.querySelector("#codItemProcedimento");
      const inpQtd  = doc.querySelector("#procedimento\\.numQtdSolicitada");

      const ok = !!(btnAdd && selTab && inpProc && inpQtd);
      return ok ? { btnAdd, selTab, inpProc, inpQtd } : null;
    } catch {
      return null;
    }
  }

  function findTargetContext() {
    // 1) tenta no top
    const hitTop = tryFindInDoc(document);
    if (hitTop) return { win: window, doc: document, ...hitTop };

    // 2) tenta em iframes same-origin
    const ifs = Array.from(document.querySelectorAll("iframe"));
    for (const f of ifs) {
      try {
        const w = f.contentWindow;
        const d = f.contentDocument || w.document;
        if (!d) continue;
        const hit = tryFindInDoc(d);
        if (hit) return { win: w, doc: d, frame: f, ...hit };
      } catch {
        // cross-origin: ignora
      }
    }
    return null;
  }

  const ctx = findTargetContext();
  if (!ctx) {
    warn("Não achei o FORM alvo (talvez esteja em iframe cross-origin ou selectors mudaram).");
    return;
  }
  log("🧩 Contexto alvo OK", {
    inIframe: !!ctx.frame,
    href: (() => { try { return ctx.win.location.href; } catch { return "(sem acesso)"; } })()
  });

  const W = ctx.win;
  const D = ctx.doc;

  // =========================
  // ✅ Net hook no window do frame (pra esperar consultarProcedimentoAjax)
  // =========================
  function hookNet(win) {
    try {
      if (win.__HP_NET_HOOKED__) return;
      win.__HP_NET_HOOKED__ = true;
      win.__HP_NET_PENDING__ = 0;

      // XHR
      try {
        const XHR = win.XMLHttpRequest;
        if (XHR && XHR.prototype) {
          const _open = XHR.prototype.open;
          const _send = XHR.prototype.send;

          XHR.prototype.open = function(...args) {
            this.__hp_tracked = true;
            return _open.apply(this, args);
          };
          XHR.prototype.send = function(...args) {
            if (this.__hp_tracked) {
              win.__HP_NET_PENDING__++;
              const dec = () => { win.__HP_NET_PENDING__ = Math.max(0, win.__HP_NET_PENDING__ - 1); };
              this.addEventListener("loadend", dec, { once: true });
              this.addEventListener("error", dec, { once: true });
              this.addEventListener("abort", dec, { once: true });
            }
            return _send.apply(this, args);
          };
        }
      } catch {}

      // fetch
      try {
        const _fetch = win.fetch;
        if (typeof _fetch === "function") {
          win.fetch = function(...args) {
            win.__HP_NET_PENDING__++;
            return _fetch.apply(this, args)
              .finally(() => { win.__HP_NET_PENDING__ = Math.max(0, win.__HP_NET_PENDING__ - 1); });
          };
        }
      } catch {}
    } catch {}
  }
  hookNet(W);

  async function waitNetIdle({ minWaitMs = 250, timeoutMs = 15000 } = {}) {
    const t0 = Date.now();
    await delay(minWaitMs);
    while (Date.now() - t0 < timeoutMs) {
      if ((W.__HP_NET_PENDING__ || 0) <= 0) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // ✅ Helpers DOM (no doc do frame)
  // =========================
  function fire(el, type) { el.dispatchEvent(new W.Event(type, { bubbles: true })); }

  function isVisible(el) {
    if (!el) return false;
    const st = W.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function clickSafe(el) {
    if (!el) return false;
    try { el.focus?.(); } catch {}
    try { el.click(); return true; } catch {}
    try {
      el.dispatchEvent(new W.MouseEvent("mousedown", { bubbles: true, cancelable: true, view: W }));
      el.dispatchEvent(new W.MouseEvent("mouseup", { bubbles: true, cancelable: true, view: W }));
      el.dispatchEvent(new W.MouseEvent("click", { bubbles: true, cancelable: true, view: W }));
      return true;
    } catch {}
    return false;
  }

  function fireKey(el, type, key, keyCode) {
    el.dispatchEvent(new W.KeyboardEvent(type, { bubbles: true, cancelable: true, key, keyCode, which: keyCode }));
  }

  // Digitação número-por-número (sem Ctrl+A; campo já vem vazio)
  async function typeDigits(el, text, { keyDelay = 75 } = {}) {
    el.focus();
    await delay(60);

    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      fireKey(el, "keydown", ch, code);
      fireKey(el, "keypress", ch, code);

      // tenta inserir como humano
      try { W.document.execCommand && W.document.execCommand("insertText", false, ch); } catch {}

      // eventos que máscaras escutam
      try { el.dispatchEvent(new W.InputEvent("beforeinput", { bubbles: true, cancelable: true, data: ch, inputType: "insertText" })); } catch {}
      try { el.dispatchEvent(new W.InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); } catch { fire(el, "input"); }

      fireKey(el, "keyup", ch, code);
      await delay(keyDelay);
    }

    fire(el, "change");
    return true;
  }

  // =========================
  // ✅ Set Tabela = TUSS
  // =========================
  function setTabelaTUSS(sel) {
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
  // ✅ Execução 1 item
  // =========================
  async function insertOne(code) {
    // 1) Adicionar procedimento (pode só “habilitar” a linha)
    if (!isVisible(ctx.btnAdd)) warn("Botão adicionar está invisível, tentando mesmo assim…");
    clickSafe(ctx.btnAdd);

    // 2) Tabela TUSS
    const okTab = setTabelaTUSS(ctx.selTab);
    if (!okTab) warn("Não achei opção TUSS no select (verifique valores/textos).");

    // 3) Procedimento: digita + blur (consultarProcedimentoAjax)
    await typeDigits(ctx.inpProc, code, { keyDelay: 80 });

    ctx.inpProc.blur();
    fire(ctx.inpProc, "blur");

    // 4) espera o ajax do consultarProcedimentoAjax “assentar”
    await waitNetIdle({ minWaitMs: 300, timeoutMs: 20000 });

    // 5) Quantidade = 1
    ctx.inpQtd.focus();
    await delay(60);
    ctx.inpQtd.value = "1";
    fire(ctx.inpQtd, "input");
    fire(ctx.inpQtd, "change");
    ctx.inpQtd.blur();
    fire(ctx.inpQtd, "blur");

    // 6) alguns TSTs precisam clicar “Adicionar Procedimento” de novo pra inserir a próxima linha.
    // Como você disse “E depois repete em inserir”, a gente só dá um pequeno wait.
    await delay(350);

    return true;
  }

  // =========================
  // ✅ Loop + resume
  // =========================
  async function runAll() {
    const st = loadState() || { running: false, idx: 0, codes: null };
    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes."); return; }

    st.codes = codes.map(String);
    st.running = true;
    saveState(st);

    for (let i = st.idx; i < st.codes.length; i++) {
      const code = String(st.codes[i]).trim();
      st.idx = i;
      st.lastCode = code;
      saveState(st);

      log(`▶️ (${i + 1}/${st.codes.length})`, code);

      try {
        await insertOne(code);
        log("✅ OK", code);
      } catch (e) {
        err("❌ Falha no código", code, e);
        return; // mantém estado pra retomar
      }

      st.idx = i + 1;
      saveState(st);

      await delay(450);
    }

    log("🎉 Finalizado!", { total: st.codes.length });
    clearState();
  }

  // API reinjeção
  let inFlight = false;
  async function resume(reason = "tick") {
    if (inFlight) return;
    inFlight = true;
    try { await runAll(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_TRF_PRO_SOCIAL_PROC_API__ = window.__HP_TRF_PRO_SOCIAL_PROC_API__ || {};
  window.__HP_TRF_PRO_SOCIAL_PROC_API__.resume = resume;

  // =========================
  // ✅ UI Botão
  // =========================
  const btn = document.createElement("button");
  btn.id = "hpRunnerFloatingBtn";
  btn.type = "button";
  btn.textContent = "⚡ Inserir Procedimentos (TST/TUSS)";
  btn.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    padding: 12px 14px; border-radius: 14px; border: none;
    background: #0d6efd; color: #fff; font-weight: 800; cursor: pointer;
    box-shadow: 0 10px 24px rgba(0,0,0,.25); user-select: none;
  `;
  document.body.appendChild(btn);

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Clique para rodar o kit.";
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
    const st = loadState() || {};
    st.codes = list.map(String);
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    saveState(st);

    hint.textContent = `Executando ${list.length}…`;
    await resume("button");
    hint.textContent = "Finalizado ✅ (ou parou — veja console)";
  };

  // auto-retoma
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto_resume"), 250);
  }

  log("🛡️ Runner TST/TUSS ativo", { total: getCodes().length });
})();
