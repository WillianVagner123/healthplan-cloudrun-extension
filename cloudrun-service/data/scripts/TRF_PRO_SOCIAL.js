/*@maskara{
  "mustUrlIncludes": ["planassiste", "mpu.mp.br", "autorizadorweb"],
  "detectAny": [
    "input[name='EVENTO']",
    "img#EVENTO_btn",
    "input[name='CODIGOTABELA']",
    "#CODIGOTABELA_btn",
    "input[name='GRAU']",
    "#GRAU_btn",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']",
    "a[accesskey='S']",
    "a[onclick*='lkp_ok']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

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
    !!document.querySelector("a[accesskey='S']") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']");

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
  const STORE_KEY = "hp_runner_state_trf_pro_social_v1";

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
    return (
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']") ||
      null
    );
  }
  function btnSalvar() {
    return document.querySelector("a[accesskey='S']") || null;
  }

  function formIsReady() {
    return !!eventoField() && (!!btnSalvarNovo() || !!btnSalvar());
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

  // fallback: se o runner foi injetado dentro do documento popup
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

    // reload real
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

  // =========================
  // ✅ Helpers: limpar + preencher via lookup
  // =========================
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
  // ✅ Passo principal (state machine)
  // =========================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,

      // fases:
      // idle
      // waiting_evento_popup
      // picked_evento
      // waiting_codtab_popup
      // picked_codtab
      // waiting_grau_popup
      // picked_grau
      // clicked
      phase: "idle",

      lastCode: null,
      codes: null,

      beforeClickToken: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes (payload vazio e sem estado salvo)."); return; }
    st.codes = codes;

    // =========================
    // Se estamos no POPUP DOCUMENT (raramente)
    // =========================
    if (IS_POPUP_DOC) {
      // decide o que selecionar conforme phase
      if (st.phase === "waiting_evento_popup" && st.lastCode) {
        const digits = String(st.lastCode).replace(/\D/g, "");
        const picked = tryPickFromThisDocPopup({ matchDigits: digits, pickFirst: false });
        if (picked.ok) log("✅ Popup EVENTO selecionado (doc):", picked);
        st.phase = "picked_evento";
        saveState(st);
        return;
      }

      if (st.phase === "waiting_codtab_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "22", pickFirst: false });
        if (picked.ok) log("✅ Popup CODIGOTABELA selecionado (doc):", picked);
        st.phase = "picked_codtab";
        saveState(st);
        return;
      }

      if (st.phase === "waiting_grau_popup") {
        const picked = tryPickFromThisDocPopup({ matchDigits: "", pickFirst: true }); // 1ª opção
        if (picked.ok) log("✅ Popup GRAU selecionado (doc):", picked);
        st.phase = "picked_grau";
        saveState(st);
        return;
      }

      // fallback
      const picked = tryPickFromThisDocPopup({ matchDigits: "", pickFirst: true });
      if (picked.ok) log("✅ Popup selecionado (doc fallback):", picked);
      return;
    }

    // =========================
    // Finalização
    // =========================
    if (st.running && st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // Evita clique duplicado
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // =========================
    // 1) Esperando popup EVENTO → NÃO redigita, só tenta clicar popupMain
    // =========================
    if (st.phase === "waiting_evento_popup" && st.lastCode) {
      // se já veio preenchido (sem popup)
      if ((eventoHnd()?.value || "").trim()) {
        st.phase = "picked_evento";
        saveState(st);
        return;
      }

      const digits = String(st.lastCode).replace(/\D/g, "");
      const picked = await pickFromPopupMain({ matchDigits: digits, pickFirst: false }, 6000);
      if (picked.ok) {
        log("✅ Popup EVENTO selecionado (popupMain):", picked);
        st.phase = "picked_evento";
        saveState(st);
      }
      return;
    }

    // =========================
    // 2) Depois do EVENTO: CODIGOTABELA = 22 + lookup + selecionar
    // =========================
    if (st.phase === "picked_evento" && st.lastCode) {
      await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 20000 });
      const ct = codTabField();
      if (!ct) { err("Campo CODIGOTABELA não encontrado."); return; }

      clearLookupPair(ct, codTabValHidden(), codTabHnd());
      await ghostType(ct, "22", 20);

      const btn = codTabBtn();
      if (btn) btn.click(); else pressEnter(ct);

      st.phase = "waiting_codtab_popup";
      saveState(st);

      // se veio sem popup (preencheu hidden)
      if (await waitHiddenFilled(codTabHnd(), 2000)) {
        st.phase = "picked_codtab";
        saveState(st);
        return;
      }

      // tenta popupMain
      const picked = await pickFromPopupMain({ matchDigits: "22", pickFirst: false }, 8000);
      if (picked.ok) {
        log("✅ Popup CODIGOTABELA selecionado (popupMain):", picked);
        st.phase = "picked_codtab";
        saveState(st);
        return;
      }

      warn("⏳ CODIGOTABELA: aguardando popup no próximo tick…");
      saveState(st);
      return;
    }

    // =========================
    // 2b) Esperando popup CODIGOTABELA
    // =========================
    if (st.phase === "waiting_codtab_popup") {
      if ((codTabHnd()?.value || "").trim()) {
        st.phase = "picked_codtab";
        saveState(st);
        return;
      }

      const picked = await pickFromPopupMain({ matchDigits: "22", pickFirst: false }, 6000);
      if (picked.ok) {
        log("✅ Popup CODIGOTABELA selecionado (popupMain):", picked);
        st.phase = "picked_codtab";
        saveState(st);
      }
      return;
    }

    // =========================
    // 3) Depois do CODIGOTABELA: GRAU lookup e selecionar 1ª opção
    // =========================
    if (st.phase === "picked_codtab" && st.lastCode) {
      await waitForElement("input[name='GRAU']", { timeoutMs: 20000 });
      const g = grauField();
      if (!g) { err("Campo GRAU não encontrado."); return; }

      clearLookupPair(g, grauValHidden(), grauHnd());

      // não precisa digitar nada; só abre o lookup
      const btn = grauBtn();
      if (btn) btn.click(); else pressEnter(g);

      st.phase = "waiting_grau_popup";
      saveState(st);

      // se veio sem popup (preencheu hidden)
      if (await waitHiddenFilled(grauHnd(), 2000)) {
        st.phase = "picked_grau";
        saveState(st);
        return;
      }

      const picked = await pickFromPopupMain({ matchDigits: "", pickFirst: true }, 8000);
      if (picked.ok) {
        log("✅ Popup GRAU selecionado (popupMain):", picked);
        st.phase = "picked_grau";
        saveState(st);
        return;
      }

      warn("⏳ GRAU: aguardando popup no próximo tick…");
      saveState(st);
      return;
    }

    // =========================
    // 3b) Esperando popup GRAU
    // =========================
    if (st.phase === "waiting_grau_popup") {
      if ((grauHnd()?.value || "").trim()) {
        st.phase = "picked_grau";
        saveState(st);
        return;
      }

      const picked = await pickFromPopupMain({ matchDigits: "", pickFirst: true }, 6000);
      if (picked.ok) {
        log("✅ Popup GRAU selecionado (popupMain):", picked);
        st.phase = "picked_grau";
        saveState(st);
      }
      return;
    }

    // =========================
    // 4) Depois do GRAU: clicar Salvar/Novo (ou Salvar no último)
    // =========================
    if (st.phase === "picked_grau" && st.lastCode) {
      const isLast = (st.idx === codes.length - 1);

      const btn = isLast ? btnSalvar() : btnSalvarNovo();
      if (!btn) { err("Botão Salvar / Novo (N) ou Salvar (S) não encontrado."); return; }

      st.phase = "clicked";
      st.clickedAt = Date.now();
      st.beforeClickToken = PAGE_TOKEN;
      saveState(st);

      log(`🖱️ Clicando ${isLast ? "Salvar" : "Salvar / Novo"}…`);
      btn.click();
      return;
    }

    // =========================
    // 5) Após clicar, confirmar postback, avançar idx
    // =========================
    if (st.phase === "clicked" && st.lastCode) {
      const why = await confirmPostbackDone(st, 25000);
      if (why === "timeout") {
        warn("⏳ Postback ainda não confirmou, tentando no próximo tick…", { code: st.lastCode });
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

    // =========================
    // 6) idle → iniciar próximo código (EVENTO)
    // =========================
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    // limpa EVENTO + hidden
    clearLookupPair(ev, eventoValHidden(), eventoHnd());

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await ghostType(ev, code, 30);

    // Enter (dispara lookup/popup)
    pressEnter(ev);

    st.running = true;
    st.lastCode = code;
    saveState(st);

    // se preencheu rápido sem popup
    const filledFast = await waitHiddenFilled(eventoHnd(), 2000);
    if (filledFast) {
      st.phase = "picked_evento";
      saveState(st);
      return;
    }

    // senão: waiting_evento_popup
    st.phase = "waiting_evento_popup";
    saveState(st);

    // tentativa imediata popupMain
    const digits = String(code).replace(/\D/g, "");
    const picked = await pickFromPopupMain({ matchDigits: digits, pickFirst: false }, 6000);
    if (picked.ok) {
      log("✅ Popup EVENTO selecionado (popupMain):", picked);
      st.phase = "picked_evento";
      saveState(st);
      return;
    }

    warn("⏳ EVENTO: popup abriu/abrirá, vou tentar clicar no próximo tick…");
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
  window.__HP_TRF_PRO_SOCIAL_API__.resume = resume;

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

  log("🛡️ Runner + Watchdog (TRF PRO SOCIAL) ativos", { total: (getCodes() || []).length });
})();
