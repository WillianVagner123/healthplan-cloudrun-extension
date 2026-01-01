/*@maskara{
  "mustUrlIncludes": ["tstsaude.tst.jus.br", "SolicitacaoSpSadtManter.do"],
  "detectAny": [
    "input[name='adicionarProcedimento']",
    "select[name='procedimento.codTabela']",
    "#codItemProcedimento",
    "#procedimento\\.numQtdSolicitada",
    "button span.ui-button-text"
  ],
  "actions": [{"type":"focus","selector":"#codItemProcedimento"}]
}*/

(() => {
  const scope = "TST_TUSS_PROC";
  const payload = window.__HP_PAYLOAD__ || {};

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  // Evita múltiplas instâncias na mesma página
  if (window.__HP_TST_TUSS_PROC_V9__) {
    try { window.__HP_TST_TUSS_PROC_API__?.resume?.("reinjected"); } catch {}
    return;
  }
  window.__HP_TST_TUSS_PROC_V9__ = true;

  // =========================
  // State (persist across refresh)
  // =========================
  const STORE_KEY = "hp_runner_state_tst_tuss_proc_v9";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  // =========================
  // Deep unwrap / normalize codes
  // =========================
  function tryJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  // desfaz: "\"[\\\"20101023\\\", ...]\"" -> ["20101023", ...]
  function deepUnwrap(value, maxDepth = 10) {
    let v = value;
    for (let i = 0; i < maxDepth; i++) {
      if (typeof v === "string") {
        const t = v.trim();
        // se parece JSON de array/obj/string
        if ((t.startsWith("[") && t.endsWith("]")) ||
            (t.startsWith("{") && t.endsWith("}")) ||
            (t.startsWith("\"") && t.endsWith("\""))) {
          const p = tryJsonParse(t);
          if (p !== null) { v = p; continue; }
        }
        // não parseou -> para
        return v;
      }
      // se é {codes:[...]}
      if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.codes)) {
        v = v.codes;
        continue;
      }
      return v;
    }
    return v;
  }

  function normalizeCodes(any) {
    let v = deepUnwrap(any);

    // caso venha { codes: [...] }
    if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.codes)) v = v.codes;

    // se veio string com vários separadores
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return [];
      // tenta parsear de novo se for array em string
      const p = deepUnwrap(s);
      if (Array.isArray(p)) v = p;
      else {
        return s
          .split(/[\n,;|\t ]+/g)
          .map(x => String(x || "").trim())
          .filter(Boolean);
      }
    }

    if (Array.isArray(v)) {
      // às vezes vem ["[\"20101023\",\"...\"]"] (array com 1 string JSON)
      if (v.length === 1 && typeof v[0] === "string") {
        const maybe = deepUnwrap(v[0]);
        if (Array.isArray(maybe)) v = maybe;
      }

      return v
        .map(x => String(deepUnwrap(x) ?? "").trim())
        .map(x => x.replace(/[^\d]/g, "")) // deixa só dígitos
        .filter(x => x.length >= 5); // ajuste se tiver códigos curtos
    }

    return [];
  }

  function getCodes() {
    const st = loadState();
    const fromPayload = normalizeCodes(payload.codes);
    if (fromPayload.length) return fromPayload;

    const fromState = normalizeCodes(st?.codes);
    if (fromState.length) return fromState;

    return [];
  }

  // =========================
  // Locate target context (doc or same-origin iframe)
  // =========================
  function tryFindInDoc(doc) {
    try {
      const btnAddProc = doc.querySelector("input[name='adicionarProcedimento']");
      const selTab  = doc.querySelector("select[name='procedimento.codTabela']");
      const inpProc = doc.querySelector("#codItemProcedimento");
      const inpQtd  = doc.querySelector("#procedimento\\.numQtdSolicitada");
      const ok = !!(btnAddProc && selTab && inpProc && inpQtd);
      return ok ? { doc } : null;
    } catch { return null; }
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
      } catch {}
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
      } catch { resolve(null); }
    });
  }

  // =========================
  // Network hook (best-effort)
  // =========================
  function hookNet(win) {
    try {
      if (win.__HP_NET_HOOKED__) return;
      win.__HP_NET_HOOKED__ = true;
      win.__HP_NET_PENDING__ = 0;

      // XHR
      try {
        const XHR = win.XMLHttpRequest;
        if (XHR?.prototype) {
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

  async function waitNetIdle(win, { minWaitMs = 350, timeoutMs = 25000 } = {}) {
    const t0 = Date.now();
    await delay(minWaitMs);
    while (Date.now() - t0 < timeoutMs) {
      if ((win.__HP_NET_PENDING__ || 0) <= 0) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // DOM interaction helpers
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
    el.dispatchEvent(new win.KeyboardEvent(type, { bubbles: true, cancelable: true, key, keyCode, which: keyCode }));
  }

  // digitar dígito por dígito (sem ctrl+a)
  async function typeDigits(win, el, text, { keyDelay = 85 } = {}) {
    el.focus();
    await delay(60);

    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      fireKey(win, el, "keydown", ch, code);
      fireKey(win, el, "keypress", ch, code);

      try { win.document.execCommand?.("insertText", false, ch); } catch {}

      try {
        el.dispatchEvent(new win.InputEvent("beforeinput", { bubbles: true, cancelable: true, data: ch, inputType: "insertText" }));
      } catch {}

      try {
        el.dispatchEvent(new win.InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
      } catch {
        fire(win, el, "input");
      }

      fireKey(win, el, "keyup", ch, code);
      await delay(keyDelay);
    }

    fire(win, el, "change");
  }

  // =========================
  // Tabela: forçar "Tabela TUSS"
  // (o select usa onclick pra copiar texto; então fazemos click + change)
  // =========================
  function setTabelaTUSS(win, sel) {
    const opts = Array.from(sel.options || []);
    const opt = opts.find(o => /tuss/i.test(String(o.text || ""))) || null;
    if (!opt) return false;

    sel.value = opt.value;

    // IMPORTANT: dispara o "onclick" do select + change/input
    try { sel.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); } catch {}
    fire(win, sel, "input");
    fire(win, sel, "change");
    return true;
  }

  function findBtnConfirmAdicionarItem(doc) {
    // botão "Adicionar" (confirmar item)
    const btn = Array.from(doc.querySelectorAll("button"))
      .find(b => {
        const sp = b.querySelector("span.ui-button-text");
        return sp && sp.textContent.trim() === "Adicionar";
      });
    if (btn) return btn;

    return Array.from(doc.querySelectorAll("button, input[type='button'], input[type='submit'], a"))
      .find(el => (el.textContent || el.value || "").replace(/\s+/g, " ").trim() === "Adicionar")
      || null;
  }

  // =========================
  // Querystring sync (após refresh)
  // =========================
  function getInsertedCodesFromQuery() {
    const usp = new URLSearchParams(location.search);
    const all = usp.getAll("dadosProcedimentos") || [];
    const items = [];

    for (const raw of all) {
      const s = decodeURIComponent(raw || "");
      const parts = s.split(":::").map(x => x.trim()).filter(Boolean);
      let code = null;

      // pega primeiro token com cara de código
      for (const p of parts) {
        const dig = p.replace(/\D/g, "");
        // no TST, procedimento codItem é 8 dígitos (ex 20101023)
        if (dig.length >= 8 && dig.length <= 12) { code = dig; break; }
      }
      if (code) items.push(code);
    }

    const seen = new Set();
    return items.filter(c => (seen.has(c) ? false : (seen.add(c), true)));
  }

  function syncStateWithPage(st, codes) {
    const inserted = getInsertedCodesFromQuery();
    if (!inserted.length) return st;

    // avança idx para o primeiro code que NÃO está no inserted
    let i = 0;
    while (i < codes.length && inserted.includes(String(codes[i]))) i++;

    // se idx salvo está menor, corrige; se já está maior, mantém
    const oldIdx = (typeof st.idx === "number") ? st.idx : 0;
    const newIdx = Math.max(oldIdx, i);

    if (newIdx !== oldIdx) {
      log("↪️ Sync via querystring", { idxFrom: oldIdx, idxTo: newIdx, inserted: inserted.length, lastInserted: inserted[inserted.length - 1] });
      st.idx = newIdx;
      st.lastCode = inserted[inserted.length - 1] || st.lastCode;
    }
    return st;
  }

  // =========================
  // Wait ready for next insertion
  // =========================
  async function waitNextReady(ctx, timeoutMs = 30000) {
    const D = ctx.doc;
    const inp = await waitForElementInDoc(D, "#codItemProcedimento", timeoutMs);
    if (!inp) return false;

    // normalmente já vem vazio; só espera estabilizar
    await delay(300);
    return true;
  }

  // =========================
  // INSERT ONE — ordem exata:
  // 1) Adicionar Procedimento
  // 2) Selecionar TUSS
  // 3) Digitar código (dígito)
  // 4) blur (consultarProcedimentoAjax)
  // 5) esperar ajax
  // 6) quantidade=1
  // 7) clicar "Adicionar" (confirmar item / refresh)
  // =========================
  async function insertOne(ctx, code) {
    const W = ctx.win;
    const D = ctx.doc;

    const btnAddProc = await waitForElementInDoc(D, "input[name='adicionarProcedimento']", 30000);
    const selTab  = await waitForElementInDoc(D, "select[name='procedimento.codTabela']", 30000);
    const inpProc = await waitForElementInDoc(D, "#codItemProcedimento", 30000);
    const inpQtd  = await waitForElementInDoc(D, "#procedimento\\.numQtdSolicitada", 30000);

    if (!btnAddProc || !selTab || !inpProc || !inpQtd) {
      throw new Error("Campos base não encontrados (Adicionar Procedimento / tabela / código / qtd).");
    }

    // 1) Adicionar Procedimento (abre linha)
    clickSafe(W, btnAddProc);
    await delay(220);

    // 2) Tabela TUSS (por texto) + dispara click/change
    const okTuss = setTabelaTUSS(W, selTab);
    if (!okTuss) warn("⚠️ Não achei opção 'Tabela TUSS' no select.");

    // 3) digitar código (sem limpar)
    inpProc.focus();
    await delay(50);
    await typeDigits(W, inpProc, code, { keyDelay: 90 });

    // 4) blur: dispara consultarProcedimentoAjax(this)
    inpProc.blur();
    fire(W, inpProc, "blur");

    // 5) aguarda ajax
    await waitNetIdle(W, { minWaitMs: 500, timeoutMs: 25000 });

    // 6) quantidade
    inpQtd.focus();
    await delay(60);
    inpQtd.value = "1";
    fire(W, inpQtd, "input");
    fire(W, inpQtd, "change");
    inpQtd.blur();
    fire(W, inpQtd, "blur");

    // 7) botão "Adicionar" (confirmar item)
    await delay(220);
    let btnConfirm = findBtnConfirmAdicionarItem(D);
    if (!btnConfirm) { await delay(500); btnConfirm = findBtnConfirmAdicionarItem(D); }
    if (!btnConfirm) throw new Error("Botão 'Adicionar' (confirmar item) não encontrado.");

    clickSafe(W, btnConfirm);

    // após isso pode refresh / post
    await waitNetIdle(W, { minWaitMs: 700, timeoutMs: 30000 });
    await waitNextReady(ctx, 30000);
  }

  // =========================
  // UI
  // =========================
  function addUi(startFn) {
    const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
    remove("hpRunnerFloatingBtn");
    remove("hpRunnerFloatingHint");

    const btn = document.createElement("button");
    btn.id = "hpRunnerFloatingBtn";
    btn.type = "button";
    btn.textContent = "⚡ Inserir Procedimentos (TST → TUSS)";
    btn.style.cssText = `
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      padding: 12px 14px; border-radius: 14px; border: none;
      background: #0d6efd; color: #fff; font-weight: 800; cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,.25); user-select: none;
    `;
    document.body.appendChild(btn);

    const hint = document.createElement("div");
    hint.id = "hpRunnerFloatingHint";
    hint.textContent = "Clique para iniciar/retomar.";
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
        hint.textContent = "Sem codes no payload (inicie pelo popup).";
        warn("Sem codes no payload.");
        return;
      }

      const st = loadState() || {};
      st.codes = list;
      st.running = true;
      st.phase = "running";
      st.idx = (typeof st.idx === "number") ? st.idx : 0;
      st.total = list.length;
      saveState(st);

      hint.textContent = `Executando ${list.length}…`;
      const r = await startFn();
      hint.textContent = r?.ok ? "Finalizado ✅" : "Parou ❌ (veja o console)";
    };
  }

  // =========================
  // Runner core
  // =========================
  let inFlight = false;

  async function runAll(ctx) {
    if (inFlight) return { ok: false, msg: "busy" };
    inFlight = true;

    try {
      let st = loadState() || {};
      const codes = normalizeCodes(st.codes || getCodes());
      if (!codes.length) { warn("Sem codes."); return { ok: false, msg: "sem codes" }; }

      st.codes = codes;
      st.total = codes.length;
      st.running = true;
      st.phase = "running";
      st.idx = (typeof st.idx === "number") ? st.idx : 0;

      // ✅ SYNC com querystring (após refresh)
      st = syncStateWithPage(st, codes);
      saveState(st);

      log("🛡️ Runner TST/TUSS ativo", { total: codes.length, idx: st.idx });

      for (let i = st.idx; i < codes.length; i++) {
        const code = String(codes[i]).trim();
        if (!code) continue;

        // salva ANTES (pois refresh pode acontecer)
        st.idx = i;
        st.lastCode = code;
        saveState(st);

        log(`▶️ (${i + 1}/${codes.length})`, code);

        await insertOne(ctx, code);

        log("✅ OK", code);

        // próximo
        st.idx = i + 1;
        st.lastCode = code;
        saveState(st);

        await delay(400);
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

  // =========================
  // API
  // =========================
  window.__HP_TST_TUSS_PROC_API__ = {
    resume: async () => {
      const ctx = await findTargetContextRetry(25000);
      if (!ctx) { warn("Não achei o FORM alvo."); return { ok: false, msg: "noctx" }; }
      hookNet(ctx.win);
      return runAll(ctx);
    },
    clear: () => { clearState(); log("State limpo."); }
  };

  // =========================
  // Bootstrap
  // =========================
  (async () => {
    const ctx = await findTargetContextRetry(25000);
    if (!ctx) {
      warn("Não achei o FORM alvo (iframe cross-origin ou selectors mudaram).");
      return;
    }

    hookNet(ctx.win);

    log("🧩 Contexto alvo OK", {
      inIframe: !!ctx.frame,
      href: (() => { try { return ctx.win.location.href; } catch { return "(sem acesso)"; } })()
    });

    addUi(() => runAll(ctx));

    // ✅ Auto-resume após refresh
    const st0 = loadState();
    const stCodes = normalizeCodes(st0?.codes);
    if (st0?.running && stCodes.length) {
      log("↩️ Auto-resume detectado", { idx: st0.idx, total: st0.total || stCodes.length, lastCode: st0.lastCode });
      setTimeout(() => runAll(ctx), 700);
    } else {
      // se tiver codes no payload e quiser já preparar state (sem auto-executar)
      const fromPayload = normalizeCodes(payload.codes);
      if (fromPayload.length && !st0) {
        saveState({ running: false, idx: 0, codes: fromPayload, total: fromPayload.length, phase: "idle" });
      }
    }
  })().catch((e) => err("bootstrap erro:", e));
})();
