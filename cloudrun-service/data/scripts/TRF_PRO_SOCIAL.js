/*@maskara{"mustUrlIncludes":["prosocial.trf1.jus.br","/prosocial/","pagemain.aspx"],"detectAny":["input[name='EVENTO']","#EVENTO_btn","input[name='CODIGOTABELA']","#CODIGOTABELA_btn","input[name='GRAU']","#GRAU_btn","a[accesskey='N']","a[accesskey='S']","a[onclick*='lkp_ok']"],"actions":[{"type":"focus","selector":"input[name='EVENTO']"}]}*/

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
  if (window.__HP_TRF_PRO_SOCIAL_API__?.resume) {
    try { window.__HP_TRF_PRO_SOCIAL_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_TRF_PRO_SOCIAL_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TRF_PRO_SOCIAL";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_trf_pro_social_v2";

  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
    catch { return null; }
  };
  const saveState = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

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
  // ✅ Popup como JANELA (target="popupMain")
  // =========================
  function getPopupMain() {
    try {
      const w = window.open("", "popupMain");
      if (!w || w.closed) return null;
      return w;
    } catch {
      return null;
    }
  }

  function popupRowsFromDoc(doc) {
    return Array.from(doc.querySelectorAll("a[onclick*='lkp_ok']"));
  }

  async function pickFromPopupMain({ matchDigits = "", pickFirst = false }, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const pop = getPopupMain();
      if (pop && pop.document) {
        const rows = popupRowsFromDoc(pop.document);
        if (rows.length) {
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
      }
      await delay(200);
    }
    return { ok: false, reason: "popup_timeout" };
  }

  function tryPickFromThisDocPopup({ matchDigits = "", pickFirst = false }) {
    const rows = popupRowsFromDoc(document);
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

    // Popup doc (raro)
    if (IS_POPUP_DOC) {
      if (st.phase === "waiting_evento_popup" && st.lastCode) {
        const digits = String(st.lastCode).replace(/\D/g, "");
        const picked = tryPickFromThisDocPopup({ matchDigits: digits, pickFirst: false });
        if (picked.ok) log("✅ Popup EVENTO selecionado (doc).");
        st.phase = "picked_evento"; saveState(st); return;
      }
      if (st.phase === "waiting_codtab_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "22", pickFirst: false });
        if (picked.ok) log("✅ Popup CODIGOTABELA selecionado (doc).");
        st.phase = "picked_codtab"; saveState(st); return;
      }
      if (st.phase === "waiting_grau_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "", pickFirst: true });
        if (picked.ok) log("✅ Popup GRAU selecionado (doc).");
        st.phase = "picked_grau"; saveState(st); return;
      }
      return;
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
      if (picked.ok) { log("✅ Popup EVENTO selecionado."); st.phase = "picked_evento"; saveState(st); }
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
      if (picked.ok) { log("✅ Popup CODIGOTABELA selecionado."); st.phase = "picked_codtab"; saveState(st); return; }

      warn("⏳ CODIGOTABELA: aguardando popup…");
      return;
    }

    // waiting CODIGOTABELA
    if (st.phase === "waiting_codtab_popup") {
      if ((codTabHnd()?.value || "").trim()) { st.phase = "picked_codtab"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "22", pickFirst: false }, 6000);
      if (picked.ok) { log("✅ Popup CODIGOTABELA selecionado."); st.phase = "picked_codtab"; saveState(st); }
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
      if (picked.ok) { log("✅ Popup GRAU selecionado."); st.phase = "picked_grau"; saveState(st); return; }

      warn("⏳ GRAU: aguardando popup…");
      return;
    }

    // waiting GRAU
    if (st.phase === "waiting_grau_popup") {
      if ((grauHnd()?.value || "").trim()) { st.phase = "picked_grau"; saveState(st); return; }
      const picked = await pickFromPopupMain({ matchDigits: "", pickFirst: true }, 6000);
      if (picked.ok) { log("✅ Popup GRAU selecionado."); st.phase = "picked_grau"; saveState(st); }
      return;
    }

    // picked GRAU -> salvar
    if (st.phase === "picked_grau" && st.lastCode) {
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
    pressEnter(ev);

    st.running = true;
    st.lastCode = code;
    saveState(st);

    if (await waitHiddenFilled(eventoHnd(), 2000)) {
      st.phase = "picked_evento"; saveState(st); return;
    }

    st.phase = "waiting_evento_popup"; saveState(st);

    const digits = String(code).replace(/\D/g, "");
    const picked = await pickFromPopupMain({ matchDigits: digits, pickFirst: false }, 6000);
    if (picked.ok) { log("✅ Popup EVENTO selecionado."); st.phase = "picked_evento"; saveState(st); return; }

    warn("⏳ EVENTO: aguardando popup…");
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
  window.__HP_TRF_PRO_SOCIAL_API__.resume = resume;

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

  log("🛡️ Runner + Watchdog (TRF PRO SOCIAL) ativos", { total: (getCodes() || []).length });
})();
