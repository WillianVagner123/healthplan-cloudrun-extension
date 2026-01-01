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

/*
  TST_TUSS_PROC.js — Runner SP/SADT (TST) ✅

  Fluxo (por código):
    1) clicar "Adicionar Procedimento" (abre/ativa linha)
    2) setar Tabela = TUSS (value=16 ou texto TUSS)
    3) digitar código número-por-número no #codItemProcedimento
    4) blur -> consultarProcedimentoAjax() -> aguardar rede ficar idle
    5) preencher quantidade (#procedimento.numQtdSolicitada) = 1
    6) clicar botão "Adicionar" (CONFIRMAR ITEM) [jQuery UI button com span.ui-button-text=Adicionar]
    7) aguardar rede idle / estabilizar e repetir

  Usa window.__HP_PAYLOAD__ = { codes, kitKey, planId }
  Resume: salva idx em localStorage
*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TST_TUSS_PROC";

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  // =========================
  // Normalize codes
  // =========================
  function normalizeCodes(x) {
    if (x && typeof x === "object" && !Array.isArray(x) && Array.isArray(x.codes)) x = x.codes;

    if (Array.isArray(x)) return x.map(v => String(v ?? "").trim()).filter(Boolean);

    if (typeof x === "string") {
      const s = x.trim();
      if (!s) return [];
      return s.split(/[\n,;|\t ]+/g).map(v => String(v ?? "").trim()).filter(Boolean);
    }
    return [];
  }

  // =========================
  // State
  // =========================
  const STORE_KEY = "hp_runner_state_tst_tuss_proc_v5";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  function getCodes() {
    const st = loadState();
    const fromPayload = normalizeCodes(payload.codes);
    if (fromPayload.length) return fromPayload;

    const fromState = normalizeCodes(st?.codes);
    if (fromState.length) return fromState;

    return [];
  }

  // =========================
  // Frame scan (same-origin) + retry
  // =========================
  function tryFindInDoc(doc) {
    try {
      const inpProc = doc.querySelector("#codItemProcedimento");
      const selTab  = doc.querySelector("select[name='procedimento.codTabela']");
      const inpQtd  = doc.querySelector("#procedimento\\.numQtdSolicitada");
      const btnAddProc = doc.querySelector("input[name='adicionarProcedimento']") || null;

      // critério mínimo (o botão "Adicionar" do item aparece depois)
      const ok = !!(inpProc && selTab && inpQtd);
      return ok ? { doc, inpProc, selTab, inpQtd, btnAddProc } : null;
    } catch {
      return null;
    }
  }

  function findTargetContextOnce() {
    const topHit = tryFindInDoc(document);
    if (topHit) return { win: window, ...topHit };

    const ifs = Array.from(document.querySelectorAll("iframe"));
    for (const f of ifs) {
      try {
        const w = f.contentWindow;
        const d = f.contentDocument || w.document;
        if (!d) continue;
        const hit = tryFindInDoc(d);
        if (hit) return { win: w, frame: f, ...hit };
      } catch {
        // cross-origin: ignore
      }
    }
    return null;
  }

  async function findTargetContextRetry(timeoutMs = 25000) {
    const t0 = Date.now();
    let hit = findTargetContextOnce();
    while (!hit && Date.now() - t0 < timeoutMs) {
      await delay(250);
      hit = findTargetContextOnce();
    }
    return hit;
  }

  function waitForElementInDoc(doc, selector, timeoutMs = 30000) {
    return new Promise((resolve) => {
      try {
        const found = doc.querySelector(selector);
        if (found) return resolve(found);

        const obs = new MutationObserver(() => {
          const el = doc.querySelector(selector);
          if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(doc.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
      } catch {
        resolve(null);
      }
    });
  }

  // =========================
  // Net hook (frame window)
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
            return _fetch.apply(this, args).finally(() => {
              win.__HP_NET_PENDING__ = Math.max(0, win.__HP_NET_PENDING__ - 1);
            });
          };
        }
      } catch {}
    } catch {}
  }

  async function waitNetIdle(win, { minWaitMs = 250, timeoutMs = 20000 } = {}) {
    const t0 = Date.now();
    await delay(minWaitMs);
    while (Date.now() - t0 < timeoutMs) {
      if ((win.__HP_NET_PENDING__ || 0) <= 0) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // DOM helpers (win)
  // =========================
  function fire(win, el, type) {
    el.dispatchEvent(new win.Event(type, { bubbles: true }));
  }

  function clickSafe(win, el) {
    if (!el) return false;
    try { el.focus?.(); } catch {}
    try { el.click(); return true; } catch {}
    try {
      el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true, view: win }));
      el.dispatchEvent(new win.MouseEvent("mouseup",   { bubbles: true, cancelable: true, view: win }));
      el.dispatchEvent(new win.MouseEvent("click",     { bubbles: true, cancelable: true, view: win }));
      return true;
    } catch {}
    return false;
  }

  function fireKey(win, el, type, key, keyCode) {
    el.dispatchEvent(new win.KeyboardEvent(type, {
      bubbles: true, cancelable: true, key, keyCode, which: keyCode
    }));
  }

  // Digitar número por número (sem limpar — campo vem vazio)
  async function typeDigits(win, el, text, { keyDelay = 85 } = {}) {
    el.focus();
    await delay(80);

    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      fireKey(win, el, "keydown", ch, code);
      fireKey(win, el, "keypress", ch, code);

      // melhor esforço para simular digitação real
      try { win.document.execCommand && win.document.execCommand("insertText", false, ch); } catch {}

      try { el.dispatchEvent(new win.InputEvent("beforeinput", { bubbles: true, cancelable: true, data: ch, inputType: "insertText" })); } catch {}
      try { el.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); } catch { fire(win, el, "input"); }

      fireKey(win, el, "keyup", ch, code);
      await delay(keyDelay);
    }

    fire(win, el, "change");
  }

  function setTabelaTUSS(win, sel) {
    const opts = Array.from(sel.options || []);
    const byVal = opts.find(o => String(o.value) === "16");
    const byTxt = opts.find(o => /tuss/i.test(String(o.text || "")));
    const pick = byVal || byTxt;
    if (!pick) return false;

    sel.value = pick.value;
    fire(win, sel, "input");
    fire(win, sel, "change");

    // alguns códigos usam onclick para preencher descrição
    // então forçamos um click também
    try { sel.click?.(); } catch {}
    return true;
  }

  // ✅ Botão CONFIRMAR ITEM: <button> ... <span class="ui-button-text">Adicionar</span>
  function findBtnConfirmAdicionarItem(doc) {
    // prioridade: jQuery UI button
    const btn = Array.from(doc.querySelectorAll("button.ui-button, button"))
      .find(b => {
        const sp = b.querySelector("span.ui-button-text");
        return sp && sp.textContent.trim() === "Adicionar";
      });
    if (btn) return btn;

    // fallback
    return Array.from(doc.querySelectorAll("button, input[type='button'], input[type='submit'], a"))
      .find(el => (el.textContent || el.value || "").replace(/\s+/g, " ").trim() === "Adicionar")
      || null;
  }

  // =========================
  // Insert one code
  // =========================
  async function insertOne(ctx, code) {
    const W = ctx.win;
    const D = ctx.doc;

    // relocaliza sempre (página pode recriar)
    const inpProc = await waitForElementInDoc(D, "#codItemProcedimento", 30000);
    const selTab  = await waitForElementInDoc(D, "select[name='procedimento.codTabela']", 30000);
    const inpQtd  = await waitForElementInDoc(D, "#procedimento\\.numQtdSolicitada", 30000);
    if (!inpProc || !selTab || !inpQtd) throw new Error("Campos base não encontrados (proc/tabela/qtd).");

    // 1) ABRIR LINHA: "Adicionar Procedimento"
    const btnAddProc = D.querySelector("input[name='adicionarProcedimento']");
    if (!btnAddProc) throw new Error("Botão 'Adicionar Procedimento' não encontrado.");
    clickSafe(W, btnAddProc);
    await delay(220);

    // 2) Tabela: TUSS
    if (!setTabelaTUSS(W, selTab)) warn("Não achei opção TUSS no select.");

    // 3) Digitar código (número por número) + blur (ajax)
    await typeDigits(W, inpProc, code, { keyDelay: 95 });
    inpProc.blur();
    fire(W, inpProc, "blur");

    // ⏳ esperar consultarProcedimentoAjax
    await waitNetIdle(W, { minWaitMs: 450, timeoutMs: 25000 });

    // 4) Quantidade (sem limpar)
    inpQtd.focus();
    await delay(80);
    inpQtd.value = "1";
    fire(W, inpQtd, "input");
    fire(W, inpQtd, "change");
    inpQtd.blur();
    fire(W, inpQtd, "blur");

    // 5) CONFIRMAR ITEM: botão "Adicionar"
    await delay(150);
    let btnConfirm = findBtnConfirmAdicionarItem(D);

    // alguns portais criam o botão só depois do blur/qtd
    if (!btnConfirm) {
      await delay(350);
      btnConfirm = findBtnConfirmAdicionarItem(D);
    }
    if (!btnConfirm) throw new Error("Botão 'Adicionar' (confirmar item) não encontrado.");

    clickSafe(W, btnConfirm);

    // ⏳ esperar salvar/atualizar
    await waitNetIdle(W, { minWaitMs: 350, timeoutMs: 25000 });
    await delay(250);
  }

  // =========================
  // UI
  // =========================
  function addUi(onRun) {
    // remove antigo
    const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
    remove("hpRunnerFloatingBtn");
    remove("hpRunnerFloatingHint");

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
      const list = normalizeCodes(payload.codes);
      if (!list.length) {
        hint.textContent = "Nenhum código no payload. Rode pelo popup.";
        warn("Nenhum código no payload.");
        return;
      }
      const st = loadState() || {};
      st.codes = list;
      st.running = true;
      if (typeof st.idx !== "number") st.idx = 0;
      saveState(st);

      hint.textContent = `Executando ${list.length}…`;
      const r = await onRun();
      hint.textContent = r?.ok ? "Finalizado ✅" : "Parou ❌ (veja o console)";
    };
  }

  // =========================
  // Main
  // =========================
  (async () => {
    const ctx = await findTargetContextRetry(25000);
    if (!ctx) {
      warn("Não achei o FORM alvo (talvez em iframe cross-origin ou selectors mudaram).");
      return;
    }

    hookNet(ctx.win);

    log("🧩 Contexto alvo OK", {
      inIframe: !!ctx.frame,
      href: (() => { try { return ctx.win.location.href; } catch { return "(sem acesso)"; } })()
    });

    let inFlight = false;

    async function runAll() {
      if (inFlight) return { ok: false, msg: "busy" };
      inFlight = true;

      try {
        const st = loadState() || { running: false, idx: 0, codes: null };
        const codes = normalizeCodes(st.codes || getCodes());

        if (!codes.length) { warn("Sem codes."); return { ok: false, msg: "sem codes" }; }

        st.codes = codes;
        st.running = true;
        if (typeof st.idx !== "number") st.idx = 0;
        saveState(st);

        log("🛡️ Runner TST/TUSS ativo", { total: codes.length });

        for (let i = st.idx; i < codes.length; i++) {
          const code = String(codes[i]).trim();

          st.idx = i;
          st.lastCode = code;
          saveState(st);

          log(`▶️ (${i + 1}/${codes.length})`, code);

          await insertOne(ctx, code);

          log("✅ OK", code);

          st.idx = i + 1;
          saveState(st);

          await delay(450);
        }

        log("🎉 Finalizado!", { total: codes.length });
        clearState();
        return { ok: true, msg: "finalizado" };
      } catch (e) {
        err("❌ Falhou:", e);
        return { ok: false, msg: String(e?.message || e) };
      } finally {
        inFlight = false;
      }
    }

    window.__HP_TST_TUSS_PROC_API__ = { resume: runAll };

    addUi(runAll);

    // auto-resume se estava rodando
    const st0 = loadState();
    if (st0?.running) setTimeout(() => runAll(), 300);

  })().catch((e) => err("bootstrap erro:", e));
})();
