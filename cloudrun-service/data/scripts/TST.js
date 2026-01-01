/*@maskara{
  "mustUrlIncludes": ["SolicitacaoSpSadtManter.do","tst","saude","prosocial","planevida","facilinformatica"],
  "detectAny": [
    "input[name='adicionarProcedimento']",
    "select[name='procedimento.codTabela']",
    "#codItemProcedimento",
    "#procedimento\\.numQtdSolicitada",
    "table"
  ],
  "actions": [{"type":"focus","selector":"#codItemProcedimento"}]
}*/

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
  // State (persist across refresh)
  // =========================
  const STORE_KEY = "hp_runner_state_tst_tuss_proc_v7";

  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
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
  // Find target doc/window (same-origin)
  // =========================
  function tryFindInDoc(doc) {
    try {
      const inpProc = doc.querySelector("#codItemProcedimento");
      const selTab  = doc.querySelector("select[name='procedimento.codTabela']");
      const inpQtd  = doc.querySelector("#procedimento\\.numQtdSolicitada");
      const btnAddProc = doc.querySelector("input[name='adicionarProcedimento']");
      const ok = !!(inpProc && selTab && inpQtd && btnAddProc);
      return ok ? { doc } : null;
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
        // cross-origin ignore
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
  // Net hook (best-effort)
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

  async function waitNetIdle(win, { minWaitMs = 300, timeoutMs = 20000 } = {}) {
    const t0 = Date.now();
    await delay(minWaitMs);
    while (Date.now() - t0 < timeoutMs) {
      if ((win.__HP_NET_PENDING__ || 0) <= 0) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // DOM helpers
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

  async function typeDigits(win, el, text, { keyDelay = 95 } = {}) {
    el.focus();
    await delay(80);
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
    try { sel.click?.(); } catch {}
    return true;
  }

  function findBtnConfirmAdicionarItem(doc) {
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
  // Detect if a code already exists in table (anti-dup)
  // =========================
  function pageHasCode(doc, code) {
    const c = String(code).trim();
    if (!c) return false;

    // Procura em células da tabela de procedimentos
    const tds = Array.from(doc.querySelectorAll("table td"));
    return tds.some(td => (td.textContent || "").includes(c));
  }

  // =========================
  // After confirm, page "refreshes" -> next run resumes from state
  // We still do a best-effort local wait, but real resume happens on reinjection.
  // =========================
  async function waitNextReady(ctx, timeoutMs = 30000) {
    const D = ctx.doc;
    const nextInput = await waitForElementInDoc(D, "#codItemProcedimento", timeoutMs);
    if (!nextInput) return false;

    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      if ((nextInput.value || "").trim() === "") return true;
      await delay(150);
    }
    return true;
  }

  // =========================
  // Insert one code
  // =========================
  async function insertOne(ctx, code) {
    const W = ctx.win;
    const D = ctx.doc;

    // re-fetch fields
    const btnAddProc = await waitForElementInDoc(D, "input[name='adicionarProcedimento']", 30000);
    const inpProc    = await waitForElementInDoc(D, "#codItemProcedimento", 30000);
    const selTab     = await waitForElementInDoc(D, "select[name='procedimento.codTabela']", 30000);
    const inpQtd     = await waitForElementInDoc(D, "#procedimento\\.numQtdSolicitada", 30000);

    if (!btnAddProc || !inpProc || !selTab || !inpQtd) throw new Error("Campos base não encontrados (btn/proc/tabela/qtd).");

    // A) abrir linha
    clickSafe(W, btnAddProc);
    await delay(240);

    // tabela TUSS
    if (!setTabelaTUSS(W, selTab)) warn("Não achei opção TUSS no select.");

    // digitar código
    await typeDigits(W, inpProc, code, { keyDelay: 95 });
    inpProc.blur();
    fire(W, inpProc, "blur");

    // aguarda AJAX da descrição
    await waitNetIdle(W, { minWaitMs: 500, timeoutMs: 25000 });

    // quantidade
    inpQtd.focus();
    await delay(80);
    inpQtd.value = "1";
    fire(W, inpQtd, "input");
    fire(W, inpQtd, "change");
    inpQtd.blur();
    fire(W, inpQtd, "blur");

    // B) confirmar item (Adicionar)
    await delay(180);
    let btnConfirm = findBtnConfirmAdicionarItem(D);
    if (!btnConfirm) { await delay(450); btnConfirm = findBtnConfirmAdicionarItem(D); }
    if (!btnConfirm) throw new Error("Botão 'Adicionar' (confirmar item) não encontrado.");

    clickSafe(W, btnConfirm);

    // muitas vezes vira POST / refresh
    await waitNetIdle(W, { minWaitMs: 600, timeoutMs: 30000 });
    await waitNextReady(ctx, 30000);
  }

  // =========================
  // UI
  // =========================
  function addUi(onStart) {
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
      saveState(st);

      hint.textContent = `Executando ${list.length}…`;
      const r = await onStart();
      hint.textContent = r?.ok ? "Finalizado ✅" : "Parou ❌ (veja o console)";
    };
  }

  // =========================
  // Runner core (resume-safe)
  // =========================
  let inFlight = false;

  async function runAll(ctx) {
    if (inFlight) return { ok: false, msg: "busy" };
    inFlight = true;

    try {
      const st = loadState() || {};
      const codes = normalizeCodes(st.codes || getCodes());
      if (!codes.length) { warn("Sem codes."); return { ok: false, msg: "sem codes" }; }

      // se veio payload e ainda não está salvo, salva
      if (!st.codes && normalizeCodes(payload.codes).length) st.codes = normalizeCodes(payload.codes);

      st.running = true;
      st.phase = "running";
      st.idx = (typeof st.idx === "number") ? st.idx : 0;
      st.total = codes.length;
      saveState(st);

      log("🛡️ Runner TST/TUSS ativo", { total: codes.length });

      // anti-dup: se o lastCode já está na tabela, avança
      if (st.lastCode && pageHasCode(ctx.doc, st.lastCode) && st.idx < codes.length) {
        // se o idx ainda aponta para o mesmo lastCode, avança 1
        if (String(codes[st.idx] ?? "") === String(st.lastCode)) {
          st.idx = st.idx + 1;
          saveState(st);
          log("↪️ Detectei que o último código já entrou na tabela. Avançando para", st.idx + 1);
        }
      }

      for (let i = st.idx; i < codes.length; i++) {
        const code = String(codes[i]).trim();

        // se já existe, pula
        if (pageHasCode(ctx.doc, code)) {
          log(`⏭️ (${i + 1}/${codes.length}) já existe na tabela:`, code);
          st.idx = i + 1;
          st.lastCode = code;
          saveState(st);
          continue;
        }

        st.idx = i;
        st.lastCode = code;

        // ✅ salva ANTES do clique "Adicionar" (pois pode refreshar)
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

  // =========================
  // Bootstrap
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

    window.__HP_TST_TUSS_PROC_API__ = {
      resume: async () => runAll(ctx),
      clear: () => { clearState(); log("State limpo."); }
    };

    addUi(async () => runAll(ctx));

    // ✅ AUTO-RESUME após refresh se estava rodando
    const st0 = loadState();
    if (st0?.running && normalizeCodes(st0?.codes).length) {
      log("↩️ Auto-resume detectado", { idx: st0.idx, total: st0.total || normalizeCodes(st0.codes).length, lastCode: st0.lastCode });
      setTimeout(() => runAll(ctx), 650);
    }
  })().catch((e) => err("bootstrap erro:", e));
})();
