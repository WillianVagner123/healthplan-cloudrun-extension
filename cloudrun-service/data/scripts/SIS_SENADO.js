/*@maskara{"mustUrlIncludes":["prosocial.trf1.jus.br","SENADO","pagemain.aspx"],"detectAny":["input[name='EVENTO']","#EVENTO_btn","input[name='CODIGOTABELA']","#CODIGOTABELA_btn","input[name='GRAU']","#GRAU_btn","a[accesskey='N']","a[accesskey='S']","a[onclick*='lkp_ok']"],"actions":[{"type":"focus","selector":"input[name='EVENTO']"}]}*/

(() => {
  // =========================
  // ✅ FRAME FILTER
  // =========================
  const IS_POPUP_DOC = !!document.querySelector("a[onclick*='lkp_ok']");
  const IS_FORM_DOC =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("#EVENTO_btn") ||
    !!document.querySelector("input[name='CODIGOTABELA']") ||
    !!document.querySelector("#CODIGOTABELA_btn") ||
    !!document.querySelector("input[name='GRAU']") ||
    !!document.querySelector("#GRAU_btn") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']");

  if (!IS_POPUP_DOC && !IS_FORM_DOC) return;

  // Reinjeção: vira "continue"
  if (window.__HP_SIS_SENADO_API__?.resume) {
    try { window.__HP_SIS_SENADO_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_SIS_SENADO_API__ = { resume: async () => {} };

  // ==========================================================
  // ✅ Captura a janela REAL do lookup (qualquer nome).
  //    Interceptamos o window.open do sistema e guardamos a janela
  //    que ele abrir. Assim o runner NÃO cria mais janela em branco.
  //    (Patch e janela capturada ficam COMPARTILHADOS de propósito —
  //     se TRF e SENADO caírem na mesma página, os dois usam a mesma.)
  // ==========================================================
  if (!window.__HP_OPEN_PATCHED__) {
    window.__HP_OPEN_PATCHED__ = true;
    const __origOpen = window.open.bind(window);
    window.open = function (url, name, features) {
      const w = __origOpen(url, name, features);
      try {
        if (w && url && String(url).trim() !== "") window.__HP_LOOKUP_WIN__ = w;
      } catch {}
      return w;
    };
  }

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "SIS_SENADO";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // ✅ Estado persistente (chave PRÓPRIA do SENADO)
  // =========================
  const STORE_KEY = "hp_runner_state_sis_senado_v2";

  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
    catch { return null; }
  };
  const saveState = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

  // Falha "mole": tenta recomeçar o código atual algumas vezes antes de parar de vez.
  // Seguro contra duplicidade: nada é salvo até os 3 obrigatórios estarem preenchidos.
  const MAX_HARD_RETRY = 3;
  function bailOrRetry(st, reason, info) {
    st.hardRetry = st.hardRetry || {};
    const k = String(st.idx);
    const n = (st.hardRetry[k] || 0) + 1;
    st.hardRetry[k] = n;
    if (n <= MAX_HARD_RETRY) {
      warn("🔁 " + reason + " — recomeçando este código do zero (tentativa " + n + "/" + MAX_HARD_RETRY + ").", info);
      st.phase = "idle";
      st.lastCode = null;
      st.beforeClickToken = null;
      st.clickedAt = null;
      st.resyncKey = "";
      st.resyncCount = 0;
      saveState(st);
    } else {
      warn("⛔ PAREI: " + reason + " após " + MAX_HARD_RETRY + " tentativas. " +
           "Nada foi salvo neste código — precisa de ajuste manual (provável ordem/dependência dos campos).", info);
      st.running = false;
      st.phase = "halted";
      saveState(st);
    }
  }

  // Codes vêm do popup.js (kit)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup.map(String);
    const st = loadState();
    if (st?.codes?.length) return st.codes.map(String);
    return [];
  }

  // token de página (muda em reload real)
  const PAGE_TOKEN = String(performance.timeOrigin || Date.now());

  function waitForElement(selector, { timeoutMs = 60000, root = document } = {}) {
    if (B?.waitForElement) return B.waitForElement(selector, { timeoutMs, root });
    return new Promise((resolve) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(root.documentElement || root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
    });
  }

  function fire(el, type) {
    if (B?.fire) return B.fire(el, type);
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function ghostType(el, text, charDelay = 35) {
    if (B?.ghostType) return B.ghostType(el, text, charDelay);
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

  // =========================
  // Form helpers (MAIN)
  // =========================
  const $byName = (n) => document.querySelector(`input[name='${n}']`) || document.getElementsByName(n)?.[0] || null;

  function eventoField() { return $byName("EVENTO"); }
  function eventoHnd() { return $byName("EVENTO_hnd"); }
  function eventoValHidden() { return $byName("EVENTO_val"); }

  function codTabField() { return $byName("CODIGOTABELA"); }
  function codTabHnd() { return $byName("CODIGOTABELA_hnd"); }
  function codTabValHidden() { return $byName("CODIGOTABELA_val"); }
  function codTabBtn() { return document.querySelector("#CODIGOTABELA_btn") || document.getElementById("CODIGOTABELA_btn") || null; }

  function grauField() { return $byName("GRAU"); }
  function grauHnd() { return $byName("GRAU_hnd"); }
  function grauValHidden() { return $byName("GRAU_val"); }
  function grauBtn() { return document.querySelector("#GRAU_btn") || document.getElementById("GRAU_btn") || null; }

  function btnSalvarNovo() {
    return document.querySelector("a[accesskey='N']") ||
           document.querySelector("a[title^='Salvar / Novo']") ||
           document.querySelector("a[title*='Salvar / Novo']") ||
           null;
  }
  function btnSalvar() {
    return document.querySelector("a[accesskey='S']") || null;
  }

  function formIsReady() {
    return !!eventoField() && (!!btnSalvarNovo() || !!btnSalvar());
  }

  // =========================
  // ✅ Popup: usa a janela CAPTURADA (não adivinha nome, não cria em branco)
  // =========================
  function getPopupMain() {
    try {
      const w = window.__HP_LOOKUP_WIN__;
      if (w && !w.closed && w.document) return w;
    } catch {}
    return null; // IMPORTANTE: não abre mais janela em branco aqui
  }

  // Procura as linhas lkp_ok no documento E dentro de iframes/frames same-origin.
  function popupRowsFromDoc(doc, depth = 0) {
    let rows = [];
    try { rows = Array.from(doc.querySelectorAll("a[onclick*='lkp_ok']")); }
    catch { return []; }
    if (depth < 4) {
      let frames = [];
      try { frames = Array.from(doc.querySelectorAll("iframe, frame")); } catch {}
      for (const f of frames) {
        let idoc = null;
        try { idoc = f.contentDocument || f.contentWindow?.document || null; } catch { idoc = null; }
        if (idoc) {
          try { rows = rows.concat(popupRowsFromDoc(idoc, depth + 1)); } catch {}
        }
      }
    }
    return rows;
  }

  // Escolhe a melhor linha (por dígitos) ou a primeira, e clica.
  function clickBestRow(rows, { matchDigits = "", pickFirst = false }) {
    if (!rows.length) return { ok: false, reason: "no_rows" };
    let picked = rows[0];
    if (!pickFirst && matchDigits) {
      const found = rows.find((a) => {
        const tr = a.closest("tr");
        const txt = (tr?.innerText || "").replace(/\s+/g, " ").trim();
        const digits = txt.replace(/\D/g, "");
        return digits.includes(matchDigits);
      });
      if (found) picked = found;
    }
    picked.click();
    return { ok: true, total: rows.length };
  }

  // Procura em: (a) própria página (grade embutida) e (b) janela capturada.
  async function pickFromPopupMain({ matchDigits = "", pickFirst = false }, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const here = popupRowsFromDoc(document);
      if (here.length) return clickBestRow(here, { matchDigits, pickFirst });

      const pop = getPopupMain();
      if (pop && pop.document) {
        const rows = popupRowsFromDoc(pop.document);
        if (rows.length) return clickBestRow(rows, { matchDigits, pickFirst });
      }
      await delay(200);
    }
    return { ok: false, reason: "popup_timeout" };
  }

  function tryPickFromThisDocPopup({ matchDigits = "", pickFirst = false }) {
    const rows = popupRowsFromDoc(document);
    return clickBestRow(rows, { matchDigits, pickFirst });
  }

  async function confirmPostbackDone(st, timeoutMs = 25000) {
    const startedAt = Date.now();
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    while (Date.now() - startedAt < timeoutMs) {
      if (formIsReady()) {
        const ev = eventoField();
        const v = (ev?.value || "").trim();
        return v === "" ? "ready_evento_empty" : "buttons_present";
      }
      await delay(250);
    }
    return "timeout";
  }

  function clearLookupPair(fieldEl, valEl, hndEl) {
    try {
      if (fieldEl) { fieldEl.value = ""; fire(fieldEl, "input"); fire(fieldEl, "change"); }
      if (valEl) valEl.value = "";
      if (hndEl) hndEl.value = "";
    } catch {}
  }

  function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function waitHiddenFilled(hndEl, timeoutMs = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = (hndEl?.value || "").trim();
      if (v) return true;
      await delay(150);
    }
    return false;
  }

  // =========================
  // ✅ State machine
  // =========================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",
      lastCode: null,
      codes: null,
      beforeClickToken: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes (payload vazio e sem estado salvo)."); return; }
    st.codes = codes;

    // 🔎 Diagnóstico (só leitura)
    if (IS_FORM_DOC) {
      try {
        const _d = st.phase + " | idx=" + st.idx +
          " | proc=" + !!(eventoHnd()?.value || "").trim() +
          " | codTab=" + !!(codTabHnd()?.value || "").trim() +
          " | item=" + !!(grauHnd()?.value || "").trim() +
          " | qtd=" + (($byName("QUANTIDADE")?.value) || "");
        if (window.__HP_LAST_DBG_SENADO__ !== _d) { window.__HP_LAST_DBG_SENADO__ = _d; log("🔎", _d); }
      } catch {}
    }

    // Popup doc (script reinjetado dentro da janela do lookup)
    if (IS_POPUP_DOC) {
      if (st.phase === "waiting_evento_popup" && st.lastCode) {
        const digits = String(st.lastCode).replace(/\D/g, "");
        const picked = tryPickFromThisDocPopup({ matchDigits: digits, pickFirst: false });
        if (picked.ok) log("✅ Procedimento selecionado (doc).");
        st.phase = "picked_evento"; saveState(st); return;
      }
      if (st.phase === "waiting_codtab_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "22", pickFirst: false });
        if (picked.ok) log("✅ Código tabela selecionado (doc).");
        st.phase = "picked_codtab"; saveState(st); return;
      }
      if (st.phase === "waiting_grau_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "", pickFirst: true });
        if (picked.ok) log("✅ Item de custo selecionado (doc).");
        st.phase = "picked_grau"; saveState(st); return;
      }
      return;
    }

    // ==========================================================
    // 🔧 RESYNC (1x por carga): alinha a FASE à REALIDADE.
    // ==========================================================
    if (!window.__HP_RESYNCED_SENADO__) {
      window.__HP_RESYNCED_SENADO__ = true;
      if (st.running && st.phase !== "halted" && st.phase !== "clicked") {
        const procOk = !!(eventoHnd()?.value || "").trim();
        const ctOk   = !!(codTabHnd()?.value || "").trim();
        const itemOk = !!(grauHnd()?.value || "").trim();
        const rankOf = (ph) => ({
          idle:0, waiting_evento_popup:0,
          picked_evento:1, waiting_codtab_popup:1,
          picked_codtab:2, waiting_grau_popup:2,
          picked_grau:3
        })[ph] ?? 0;
        let target, tRank;
        if (!procOk)      { target = "idle";          tRank = 0; }
        else if (!ctOk)   { target = "picked_evento"; tRank = 1; }
        else if (!itemOk) { target = "picked_codtab"; tRank = 2; }
        else              { target = "picked_grau";   tRank = 3; }

        if (tRank < rankOf(st.phase)) {
          const key = st.idx + ":" + target;
          if (st.resyncKey === key) st.resyncCount = (st.resyncCount || 0) + 1;
          else { st.resyncKey = key; st.resyncCount = 1; }
          if (st.resyncCount > 6) {
            bailOrRetry(st, "Campos não permanecem preenchidos (dessincronização repetida — provável lookup dependente/ordem diferente)",
                        { idx: st.idx, proc: procOk, codTab: ctOk, item: itemOk });
            return;
          }
          log("🔧 Resync: fase", st.phase, "→", target,
              "(proc/codTab/item =", procOk, ctOk, itemOk, ") #" + st.resyncCount);
          st.phase = target;
          if (target === "idle") st.lastCode = null;
          saveState(st);
        } else if (st.resyncKey) {
          st.resyncKey = ""; st.resyncCount = 0; saveState(st);
        }
      }
    }

    // fim
    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // anti-duplo clique
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // waiting EVENTO
    if (st.phase === "waiting_evento_popup" && st.lastCode) {
      if ((eventoHnd()?.value || "").trim()) { st.phase = "picked_evento"; saveState(st); return; }
      const digits = String(st.lastCode).replace(/\D/g, "");
      const picked = await pickFromPopupMain({ matchDigits: digits, pickFirst: false }, 6000);
      if (picked.ok) { log("✅ Procedimento selecionado."); st.phase = "picked_evento"; saveState(st); }
      return;
    }

    // picked EVENTO -> CODIGOTABELA=22
    if (st.phase === "picked_evento" && st.lastCode) {
      await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 20000 });
      const ct = codTabField();
      if (!ct) { err("Campo CODIGOTABELA não encontrado."); return; }

      clearLookupPair(ct, codTabValHidden(), codTabHnd());
      await ghostType(ct, "22", 20);

      const btn = codTabBtn();
      if (btn) btn.click(); else pressEnter(ct);

      st.phase = "waiting_codtab_popup"; saveState(st);

      if (await waitHiddenFilled(codTabHnd(), 2000)) { st.phase = "picked_codtab"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "22", pickFirst: false }, 8000);
      if (picked.ok) { log("✅ Código tabela selecionado."); st.phase = "picked_codtab"; saveState(st); return; }

      warn("⏳ Código tabela: aguardando busca…");
      return;
    }

    // waiting CODIGOTABELA
    if (st.phase === "waiting_codtab_popup") {
      if ((codTabHnd()?.value || "").trim()) { st.phase = "picked_codtab"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "22", pickFirst: false }, 6000);
      if (picked.ok) { log("✅ Código tabela selecionado."); st.phase = "picked_codtab"; saveState(st); }
      return;
    }

    // picked CODIGOTABELA -> GRAU
    if (st.phase === "picked_codtab" && st.lastCode) {
      await waitForElement("input[name='GRAU']", { timeoutMs: 20000 });
      const g = grauField();
      if (!g) { err("Campo GRAU não encontrado."); return; }

      clearLookupPair(g, grauValHidden(), grauHnd());
      const btn = grauBtn();
      if (btn) btn.click(); else pressEnter(g);

      st.phase = "waiting_grau_popup"; saveState(st);

      if (await waitHiddenFilled(grauHnd(), 2000)) { st.phase = "picked_grau"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "", pickFirst: true }, 8000);
      if (picked.ok) { log("✅ Item de custo selecionado."); st.phase = "picked_grau"; saveState(st); return; }

      warn("⏳ Item de custo: aguardando busca…");
      return;
    }

    // waiting GRAU
    if (st.phase === "waiting_grau_popup") {
      if ((grauHnd()?.value || "").trim()) { st.phase = "picked_grau"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "", pickFirst: true }, 6000);
      if (picked.ok) { log("✅ Item de custo selecionado."); st.phase = "picked_grau"; saveState(st); }
      return;
    }

    // picked GRAU -> garantir obrigatórios e salvar
    if (st.phase === "picked_grau" && st.lastCode) {
      // Quantidade sempre = 1 (campo obrigatório; postback pode resetar)
      const q = $byName("QUANTIDADE");
      if (q && String(q.value ?? "").trim() !== "1") {
        q.value = "1"; fire(q, "input"); fire(q, "change");
      }

      // Segurança: só salva com os obrigatórios de lookup resolvidos
      const evOk = !!(eventoHnd()?.value || "").trim();
      const ctOk = !!(codTabHnd()?.value || "").trim();
      const grOk = !!(grauHnd()?.value || "").trim();
      if (!evOk || !ctOk || !grOk) {
        bailOrRetry(st, "Cheguei no Salvar com o formulário sem os obrigatórios preenchidos",
                    { procedimento: evOk, codigoTabela: ctOk, itemCusto: grOk, idx: st.idx });
        return;
      }

      log("📋 OK → Procedimento", st.lastCode, "· Código tabela 22 · Item de custo (1º) · Qtd 1 · (Grau de Participação/Recebedor em branco)");
      const isLast = (st.idx === codes.length - 1);
      const btn = isLast ? btnSalvar() : btnSalvarNovo();
      if (!btn) { err("Botão Salvar/Novo (N) ou Salvar (S) não encontrado."); return; }

      st.phase = "clicked";
      st.clickedAt = Date.now();
      st.beforeClickToken = PAGE_TOKEN;
      saveState(st);

      log(`🖱️ Clicando ${isLast ? "Salvar (S)" : "Salvar / Novo (N)"}…`);
      btn.click();
      return;
    }

    // clicked -> confirmar -> next
    if (st.phase === "clicked" && st.lastCode) {
      const why = await confirmPostbackDone(st, 25000);
      if (why === "timeout") { warn("⏳ Postback não confirmou ainda…"); return; }

      log(`✅ Postback confirmado (${why}). Próximo.`);
      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.beforeClickToken = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    // idle -> iniciar EVENTO
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    clearLookupPair(ev, eventoValHidden(), eventoHnd());

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await ghostType(ev, code, 30);
    const evBtn = document.querySelector("#EVENTO_btn") || document.getElementById("EVENTO_btn");
    if (evBtn) evBtn.click(); else pressEnter(ev); // clica a lupa (lkp_show) — mais confiável que Enter

    st.running = true;
    st.lastCode = code;
    saveState(st);

    if (await waitHiddenFilled(eventoHnd(), 2000)) {
      st.phase = "picked_evento"; saveState(st); return;
    }

    st.phase = "waiting_evento_popup"; saveState(st);

    const digits = String(code).replace(/\D/g, "");
    const picked = await pickFromPopupMain({ matchDigits: digits, pickFirst: false }, 6000);
    if (picked.ok) { log("✅ Procedimento selecionado."); st.phase = "picked_evento"; saveState(st); return; }

    warn("⏳ Procedimento: aguardando busca…");
  }

  // =========================
  // ✅ Resume + Watchdog
  // =========================
  let inFlight = false;
  async function resume() {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_SIS_SENADO_API__.resume = resume;

  // Resiliência: qualquer erro na página não deve parar o loop.
  if (!window.__HP_ERR_LISTENER_SENADO__) {
    window.__HP_ERR_LISTENER_SENADO__ = true;
    const nudge = () => { try { const s = loadState(); if (s?.running) setTimeout(resume, 300); } catch {} };
    window.addEventListener("error", nudge);
    window.addEventListener("unhandledrejection", nudge);
  }

  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(resume, 150);
  } else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(resume, 250);
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume();
  }, 1100);

  log("🛡️ Runner + Watchdog (SIS SENADO) ativos", { total: (getCodes() || []).length });
})();
