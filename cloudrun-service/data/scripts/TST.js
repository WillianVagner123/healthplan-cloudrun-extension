/*@maskara{
  "mustUrlIncludes": ["SolicitacaoSpSadtManter.do","tst","planevida","facilinformatica"],
  "detectAny": [
    "#codItemProcedimento",
    "select[name='procedimento.codTabela']",
    "input[name='adicionarProcedimento']",
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
  // ✅ normalize codes
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
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_tst_tuss_proc_v4";
  const loadState  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState  = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  function getCodes() {
    const st = loadState();
    const a = normalizeCodes(payload.codes);
    if (a.length) return a;
    const b = normalizeCodes(st?.codes);
    if (b.length) return b;
    return [];
  }

  // =========================
  // ✅ find context (top + iframes same-origin) COM RETRY
  // =========================
  function tryFindInDoc(doc) {
    try {
      const inpProc = doc.querySelector("#codItemProcedimento");
      const selTab  = doc.querySelector("select[name='procedimento.codTabela']");
      const inpQtd  = doc.querySelector("#procedimento\\.numQtdSolicitada");

      // botão abrir/ativar linha (pode ser input[type=button] com name)
      const btnAddProc =
        doc.querySelector("input[name='adicionarProcedimento']") ||
        doc.querySelector("input[onclick*='abrirPopupProcOpmDesp']") ||
        Array.from(doc.querySelectorAll("input[type='button'],input[type='submit'],button,a")).find(el => {
          const t = (el.value || el.textContent || "").trim();
          const oc = el.getAttribute?.("onclick") || "";
          const title = el.getAttribute?.("title") || "";
          return /Adicionar Procedimento/i.test(t) || /Incluir Procedimento/i.test(title) || /abrirPopupProcOpmDesp/i.test(oc);
        }) ||
        null;

      // ✅ Critério mínimo para “é aqui”
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
        // cross-origin -> ignora
      }
    }
    return null;
  }

  async function findTargetContextRetry(timeoutMs = 20000) {
    const t0 = Date.now();
    let hit = findTargetContextOnce();
    while (!hit && Date.now() - t0 < timeoutMs) {
      await delay(250);
      hit = findTargetContextOnce();
    }
    return hit;
  }

  // =========================
  // ✅ waitForElement dentro do DOC do frame
  // =========================
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
  // ✅ Net hook (frame window)
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
          XHR.prototype.open = function(...args) { this.__hp_tracked = true; return _open.apply(this, args); };
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
  // ✅ DOM helpers (no window do frame)
  // =========================
  function fire(win, el, type) { el.dispatchEvent(new win.Event(type, { bubbles: true })); }

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

  // Digita número por número (sem Ctrl+A)
  async function typeDigits(win, el, text, { keyDelay = 75 } = {}) {
    el.focus();
    await delay(60);

    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      fireKey(win, el, "keydown", ch, code);
      fireKey(win, el, "keypress", ch, code);

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
    return true;
  }

  // ✅ encontra o botão “Adicionar” do item (dinâmico)
  function findBtnAdicionarItem(doc) {
    const candidates = Array.from(doc.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
    // prioridade: jQuery UI button com span.ui-button-text = "Adicionar"
    const jq = candidates.find(el => {
      const span = el.querySelector?.("span.ui-button-text");
      const txt = (span?.textContent || "").replace(/\s+/g, " ").trim();
      return /^Adicionar$/i.test(txt);
    });
    if (jq) return jq;

    // fallback: texto/value
    return candidates.find(el => {
      const txt = (el.textContent || el.value || "").replace(/\s+/g, " ").trim();
      return /^Adicionar$/i.test(txt);
    }) || null;
  }

  // =========================
  // ✅ Inserir 1 item: abrir linha -> TUSS -> cod -> blur/ajax -> qtd -> Adicionar
  // =========================
  async function insertOne(ctx, code) {
    const { win: W, doc: D } = ctx;

    // (relocaliza sempre, porque a página pode recriar os inputs)
    const inpProc = await waitForElementInDoc(D, "#codItemProcedimento", 30000);
    const selTab  = await waitForElementInDoc(D, "select[name='procedimento.codTabela']", 30000);
    const inpQtd  = await waitForElementInDoc(D, "#procedimento\\.numQtdSolicitada", 30000);
    if (!inpProc || !selTab || !inpQtd) throw new Error("Campos base não encontrados (proc/tabela/qtd).");

    // botão abrir linha (se existir — alguns já deixam a linha aberta)
    const btnAddProc =
      D.querySelector("input[name='adicionarProcedimento']") ||
      D.querySelector("input[onclick*='abrirPopupProcOpmDesp']") ||
      null;

    if (btnAddProc) {
      clickSafe(W, btnAddProc);
      await delay(160);
    }

    if (!setTabelaTUSS(W, selTab)) warn("Não achei opção TUSS no select.");

    // procedimento
    await typeDigits(W, inpProc, code, { keyDelay: 80 });
    inpProc.blur();
    fire(W, inpProc, "blur");

    // espera ajax de consultarProcedimentoAjax
    await waitNetIdle(W, { minWaitMs: 350, timeoutMs: 20000 });

    // quantidade
    inpQtd.focus();
    await delay(60);
    inpQtd.value = "1";
    fire(W, inpQtd, "input");
    fire(W, inpQtd, "change");
    inpQtd.blur();
    fire(W, inpQtd, "blur");

    // ✅ botão Adicionar (confirmar)
    await delay(120);
    const btnAddItem = findBtnAdicionarItem(D) || (await waitForElementInDoc(D, "button, input[type='button'], input[type='submit']", 2000) && findBtnAdicionarItem(D));
    if (!btnAddItem) throw new Error("Botão 'Adicionar' (do item) não encontrado.");

    clickSafe(W, btnAddItem);

    // espera salvar/atualizar
    await waitNetIdle(W, { minWaitMs: 250, timeoutMs: 20000 });
    await delay(250);
  }

  // =========================
  // ✅ Main
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

    // UI
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

    // Runner
    let inFlight = false;
    async function runAll() {
      if (inFlight) return;
      inFlight = true;

      try {
        const st = loadState() || { running: false, idx: 0, codes: null };
        const codes = normalizeCodes(st.codes || getCodes());
        if (!codes.length) { warn("Sem codes."); return; }

        st.codes = codes;
        st.running = true;
        if (typeof st.idx !== "number") st.idx = 0;
        saveState(st);

        for (let i = st.idx; i < st.codes.length; i++) {
          const code = String(st.codes[i]).trim();
          st.idx = i;
          st.lastCode = code;
          saveState(st);

          log(`▶️ (${i + 1}/${st.codes.length})`, code);

          await insertOne(ctx, code);

          log("✅ OK", code);

          st.idx = i + 1;
          saveState(st);

          await delay(450);
        }

        log("🎉 Finalizado!", { total: st.codes.length });
        clearState();
      } catch (e) {
        err("Falhou:", e);
      } finally {
        inFlight = false;
      }
    }

    // Expor API de reinjeção
    window.__HP_TST_TUSS_PROC_API__ = { resume: runAll };

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
      await runAll();
      hint.textContent = "Finalizado ✅ (ou parou — veja console)";
    };

    // auto-retoma
    const st0 = loadState();
    if (st0?.running) setTimeout(runAll, 250);

    log("🛡️ Runner TST/TUSS ativo", { total: getCodes().length });
  })().catch((e) => err("bootstrap erro:", e));
})();
