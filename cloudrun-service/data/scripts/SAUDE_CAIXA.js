/*@maskara{
  "mustUrlIncludes": ["saude.caixa.gov.br", "AutorizadorPRD", "pagemain.aspx"],
  "detectAny": [
    "input[name='EVENTO']",
    "img#EVENTO_btn",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']",
    "a[onclick*='lkp_ok']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // =========================
  // ✅ FRAME FILTER
  // roda no FORM principal (main) OU no POPUP (se estiver no mesmo doc)
  // =========================
  const IS_POPUP_DOC = !!document.querySelector("a[onclick*='lkp_ok']");
  const IS_FORM_DOC =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("img#EVENTO_btn") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']") ||
    !!document.querySelector("a[accesskey='N']");

  if (!IS_POPUP_DOC && !IS_FORM_DOC) return;

  // Reinjeção: vira "continue"
  if (window.__HP_SAUDE_CAIXA_API__?.resume) {
    try { window.__HP_SAUDE_CAIXA_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_SAUDE_CAIXA_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "SAUDE_CAIXA";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // ✅ Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_saude_caixa_v1";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => localStorage.removeItem(STORE_KEY);

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
  function eventoField() {
    return document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
  }
  function eventoHnd() {
    return document.querySelector("input[name='EVENTO_hnd']") || document.getElementsByName("EVENTO_hnd")[0] || null;
  }
  function eventoValHidden() {
    return document.querySelector("input[name='EVENTO_val']") || document.getElementsByName("EVENTO_val")[0] || null;
  }
  function codigoTabelaField() {
    return document.querySelector("input[name='CODIGOTABELA']") || document.getElementsByName("CODIGOTABELA")[0] || null;
  }
  function grauField() {
    return document.querySelector("input[name='GRAU']") || document.getElementsByName("GRAU")[0] || null;
  }
  function btnSalvarNovo() {
    return (
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']") ||
      null
    );
  }
  function btnSalvarFinal() {
    return (
      document.querySelector("a[accesskey='S']") ||
      document.querySelector("a[title^='Salvar']") ||
      document.querySelector("a[title*='Salvar']") ||
      null
    );
  }
  function formIsReady() {
    return !!eventoField() && (!!btnSalvarNovo() || !!btnSalvarFinal());
  }

  function pageHasErrorHint() {
    const t = (document.body?.innerText || "").toLowerCase();
    return (
      t.includes("registro não encontrado") ||
      t.includes("verifique mensagens nos campos") ||
      t.includes("mensagens nos campos")
    );
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

  async function tryPickFromPopupMain(codeDigitsOnly, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const pop = getPopupMain();
      if (pop && pop.document) {
        const rows = popupRowsFromDoc(pop.document);
        if (rows.length) {
          const picked =
            rows.find((a) => {
              const tr = a.closest("tr");
              const txt = (tr?.innerText || "").replace(/\s+/g, " ").trim();
              const digits = txt.replace(/\D/g, "");
              return digits.includes(codeDigitsOnly);
            }) || rows[0];

          const pickedText = (picked.getAttribute("text") || picked.textContent || "").trim();
          const handle = picked.getAttribute("handle") || "";
          picked.click(); // lkp_ok(this)
          return { ok: true, pickedText, handle, total: rows.length };
        }
      }
      await delay(200);
    }
    return { ok: false, reason: "popup_timeout" };
  }

  function tryPickFromThisDocPopup(codeDigitsOnly) {
    const rows = popupRowsFromDoc(document);
    if (!rows.length) return { ok: false, reason: "no_rows" };

    const picked =
      rows.find((a) => {
        const tr = a.closest("tr");
        const txt = (tr?.innerText || "").replace(/\s+/g, " ").trim();
        const digits = txt.replace(/\D/g, "");
        return digits.includes(codeDigitsOnly);
      }) || rows[0];

    const pickedText = (picked.getAttribute("text") || picked.textContent || "").trim();
    const handle = picked.getAttribute("handle") || "";
    picked.click();
    return { ok: true, pickedText, handle, total: rows.length };
  }

  // =========================
  // ✅ Confirmar postback / página pronta
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 25000) {
    const startedAt = Date.now();

    // 1) reload real
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    // 2) sinais de que formulário está pronto novamente
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

  // =========================
  // ✅ Passo principal (state machine)
  // =========================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle", // idle | waiting_popup | picked_popup | clicked
      lastCode: null,
      codes: null,
      beforeClickToken: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes (payload vazio e sem estado salvo)."); return; }
    st.codes = codes;

    // POPUP DOC (raro)
    if (IS_POPUP_DOC) {
      const digits = String(st.lastCode || "").replace(/\D/g, "");
      const picked = tryPickFromThisDocPopup(digits);
      if (picked.ok) {
        log("✅ Popup selecionado (doc):", picked);
        st.phase = "picked_popup";
        saveState(st);
      }
      return;
    }

    // terminou
    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // anti-duplo clique
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // 1) esperando popup
    if (st.phase === "waiting_popup" && st.lastCode) {
      const hnd = (eventoHnd()?.value || "").trim();
      if (hnd) {
        st.phase = "picked_popup";
        saveState(st);
        return;
      }

      const digits = String(st.lastCode).replace(/\D/g, "");
      const picked = await tryPickFromPopupMain(digits, 6000);
      if (picked.ok) {
        log("✅ Popup selecionado (popupMain):", picked);
        st.phase = "picked_popup";
        saveState(st);
      }
      return;
    }

    // 2) escolheu popup -> tabela 22 -> limpar GRAU -> salvar/novo
    if (st.phase === "picked_popup" && st.lastCode) {
      await waitForElement("input[name='EVENTO']", { timeoutMs: 20000 });
      await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 20000 });

      const ct = codigoTabelaField();
      if (ct) {
        await ghostType(ct, "22", 20);
        log("✅ Código tabela preenchido: 22");
      } else {
        warn("⚠️ CODIGOTABELA não encontrado (seguindo).");
      }

      const grau = grauField();
      if (grau) {
        try {
          grau.focus();
          grau.value = "";
          fire(grau, "input"); fire(grau, "change");
          log("ℹ️ Campo GRAU existe: limpei (não bloqueia).");
        } catch {}
      }

      const isLast = st.idx === codes.length - 1;
      const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();
      if (!btn) { err(isLast ? "Botão Salvar (final) não encontrado." : "Botão Salvar / Novo não encontrado."); return; }

      st.phase = "clicked";
      st.clickedAt = Date.now();
      st.beforeClickToken = PAGE_TOKEN; // token ANTES do clique
      saveState(st);

      log(isLast ? "🖱️ Clicando Salvar (final)..." : "🖱️ Clicando Salvar / Novo…");
      btn.click();
      return;
    }

    // 3) clicou salvar -> confirmar -> próximo
    if (st.phase === "clicked" && st.lastCode) {
      const why = await confirmPostbackDone(st, 25000);
      if (why === "timeout") {
        warn("⏳ Postback não confirmou ainda, tentando no próximo tick…", { code: st.lastCode });
        saveState(st);
        return;
      }

      if (pageHasErrorHint()) warn(`⚠️ Possível erro após salvar: ${st.lastCode} (seguindo).`);
      else log(`✅ Postback confirmado (${why}) → próximo.`);

      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.beforeClickToken = null;
      st.clickedAt = null;
      saveState(st);
      return;
    }

    // 4) idle -> iniciar próximo código
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    // limpa EVENTO + hidden
    try {
      ev.focus();
      ev.value = "";
      fire(ev, "input"); fire(ev, "change");
      const hv = eventoValHidden(); if (hv) hv.value = "";
      const hh = eventoHnd(); if (hh) hh.value = "";
    } catch {}

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await ghostType(ev, code, 30);

    // Enter (dispara lookup/popup)
    ev.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    ev.dispatchEvent(new KeyboardEvent("keydown",  { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    ev.dispatchEvent(new KeyboardEvent("keyup",    { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));

    st.running = true;
    st.lastCode = code;
    saveState(st);

    // se já preencheu rápido, pula popup
    const filledFast = await (async () => {
      const start = Date.now();
      while (Date.now() - start < 2000) {
        const hnd = (eventoHnd()?.value || "").trim();
        if (hnd) return true;
        await delay(150);
      }
      return false;
    })();

    if (filledFast) {
      st.phase = "picked_popup";
      saveState(st);
      return;
    }

    // senão, waiting_popup
    st.phase = "waiting_popup";
    saveState(st);

    const digits = String(code).replace(/\D/g, "");
    const picked = await tryPickFromPopupMain(digits, 6000);
    if (picked.ok) {
      log("✅ Popup selecionado (popupMain):", picked);
      st.phase = "picked_popup";
      saveState(st);
      return;
    }

    warn("⏳ Popup abriu/abrirá, vou tentar clicar no próximo tick…");
    saveState(st);
  }

  // =========================
  // ✅ Resume + Watchdog
  // =========================
  let inFlight = false;
  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }
  window.__HP_SAUDE_CAIXA_API__.resume = resume;

  // Auto-start / auto-resume
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 120);
  } else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1100);

  log("🛡️ Runner + Watchdog (SAUDE CAIXA) ativos", { total: (getCodes() || []).length });
})();
