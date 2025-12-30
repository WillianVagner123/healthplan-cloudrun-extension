/*@maskara{
  "mustUrlIncludes": ["planassiste", "mpu.mp.br", "autorizadorweb"],
  "detectAny": [
    "input[name='EVENTO']",
    "img#EVENTO_btn",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']",
    "a[onclick*='lkp_ok']",
    "form#FormMain"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // =========================
  // ✅ FRAME FILTER
  // roda se estiver no FORM (main) OU no POPUP (lista lkp_ok)
  // =========================
  const IS_POPUP = !!document.querySelector("a[onclick*='lkp_ok']");
  const IS_FORM =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("img#EVENTO_btn") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']") ||
    !!document.querySelector("a[accesskey='N']");

  if (!IS_POPUP && !IS_FORM) return;

  // Reinjeção: vira continue
  if (window.__HP_PLAN_ASSIST_API__?.resume) {
    try { window.__HP_PLAN_ASSIST_API__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_PLAN_ASSIST_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "PLAN_ASSIST";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // ✅ Estado persistente (COMPARTILHADO ENTRE FRAMES)
  // localStorage evita reset quando reinjeta em outro frame
  // =========================
  const STORE_KEY = "hp_runner_state_plan_assist_v4";

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
  // Helpers de Form (MAIN)
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

  function btnSalvarNovo() {
    return (
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']") ||
      null
    );
  }

  function formIsReady() {
    const ev = eventoField();
    const btn = btnSalvarNovo();
    return !!ev && !!btn;
  }

  // “registro não encontrado” / mensagens genéricas
  function pageHasErrorHint() {
    const t = (document.body?.innerText || "").toLowerCase();
    return (
      t.includes("registro não encontrado") ||
      t.includes("verifique mensagens nos campos") ||
      t.includes("mensagens nos campos")
    );
  }

  // =========================
  // ✅ POPUP: escolher item e voltar
  // =========================
  function popupRows() {
    // Âncoras da lista
    return Array.from(document.querySelectorAll("a[onclick*='lkp_ok']"));
  }

  function tryPickPopupRow(codeDigitsOnly) {
    const rows = popupRows();
    if (!rows.length) return { ok: false, reason: "no_rows" };

    // tenta bater pelo texto da linha (na mesma TR existe TD com código 4.03.01.087)
    const best =
      rows.find((a) => {
        const tr = a.closest("tr");
        const txt = (tr?.innerText || "").replace(/\s+/g, " ").trim();
        // remove pontos do código do grid e compara com digitsOnly
        const digits = txt.replace(/\D/g, "");
        return digits.includes(codeDigitsOnly);
      }) || rows[0];

    const pickedText = best.getAttribute("text") || best.textContent?.trim() || "";
    const handle = best.getAttribute("handle") || "";

    best.click(); // dispara lkp_ok(this)

    return { ok: true, pickedText, handle, total: rows.length };
  }

  // =========================
  // ✅ Confirmar "postback done"
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 20000) {
    const startedAt = Date.now();

    // 1) reload real (token mudou)
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    // 2) sinais de que o formulário voltou pronto
    while (Date.now() - startedAt < timeoutMs) {
      if (formIsReady()) {
        // extra: normalmente EVENTO vem vazio no novo
        const ev = eventoField();
        const v = (ev?.value || "").trim();
        // se já tem botões + campo, consideramos pronto mesmo se v não for vazio (site às vezes mantém)
        return v === "" ? "ready_evento_empty" : "buttons_present";
      }
      await delay(250);
    }

    warn("⏳ Não consegui confirmar conclusão do postback (timeout).", { code: st.lastCode });
    return "timeout";
  }

  // =========================
  // Passo principal
  // =========================
  async function stepOnce() {
    // Se estamos no POPUP, precisamos escolher e sair
    if (IS_POPUP) {
      const st = loadState();
      if (!st?.running || !st?.lastCode) {
        // não sabemos o que selecionar, mas seleciona o primeiro pra destravar
        const rows = popupRows();
        if (rows[0]) rows[0].click();
        return;
      }

      const codeDigits = String(st.lastCode || "").replace(/\D/g, "");
      const picked = tryPickPopupRow(codeDigits);
      if (picked.ok) {
        log("✅ Popup selecionado:", picked);
        // marca fase pra continuar no form
        st.phase = "picked_popup";
        saveState(st);
      }
      return; // após click, o próprio sistema navega de volta
    }

    // ---------- FORM (MAIN) ----------
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",          // idle | entered | picked_popup | clicked
      lastCode: null,
      codes: null,
      beforeClickToken: null,
      clickedAt: null,
      clickedUrl: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes (payload vazio e sem estado salvo)."); return; }
    st.codes = codes;

    // Se voltamos depois do clique (ou depois do popup), confirma e avança
    if ((st.phase === "clicked" || st.phase === "picked_popup") && st.lastCode) {
      // se foi picked_popup, ainda falta CODIGOTABELA + salvar/novo
      if (st.phase === "picked_popup") {
        // espera o formulário estar pronto e EVENTO_hnd preenchido
        await waitForElement("input[name='EVENTO_hnd']", { timeoutMs: 20000 });
        const hnd = (eventoHnd()?.value || "").trim();
        const evv = (eventoField()?.value || "").trim();
        if (hnd || evv) {
          // preenche CODIGOTABELA=00 e clica salvar/novo (sem abrir lookup)
          const ct = await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 15000 });
          if (ct) {
            await ghostType(ct, "00", 20);
            log("✅ Código tabela preenchido: 00");
          } else {
            warn("⚠️ CODIGOTABELA não encontrado (seguindo mesmo assim).");
          }

          const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 15000 });
          if (!btn) { err("Botão Salvar / Novo não encontrado."); return; }

          st.phase = "clicked";
          st.clickedAt = Date.now();
          st.clickedUrl = location.href;
          st.beforeClickToken = PAGE_TOKEN; // token antes do clique
          saveState(st);

          log("🖱️ Clicando Salvar / Novo…");
          btn.click();
          return;
        }

        // se ainda não veio preenchido, aguarda um pouco e tenta de novo via watchdog
        saveState(st);
        return;
      }

      // se foi clicked, confirma postback
      const why = await confirmPostbackDone(st, 20000);

      if (why === "timeout") { saveState(st); return; }

      if (pageHasErrorHint()) warn(`⚠️ Possível erro após salvar: ${st.lastCode} (seguindo).`);
      else log(`✅ Postback confirmado (${why}) → próximo.`);

      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.clickedAt = null;
      st.clickedUrl = null;
      st.beforeClickToken = null;
      saveState(st);
    }

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // Evita “dobrar clique” em reinjeções rápidas
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    // garante form pronto
    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    // limpa EVENTO e hidden (pra não ficar “preso”)
    try {
      ev.focus();
      ev.value = "";
      fire(ev, "input"); fire(ev, "change");
      const hv = eventoValHidden(); if (hv) hv.value = "";
      const hh = eventoHnd(); if (hh) hh.value = "";
    } catch {}

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    // digita no EVENTO e dá Enter (isso dispara lookup / popup)
    await ghostType(ev, code, 30);

    // Enter (alguns benner só respondem com keypress)
    ev.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    ev.dispatchEvent(new KeyboardEvent("keydown",  { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    ev.dispatchEvent(new KeyboardEvent("keyup",    { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));

    st.running = true;
    st.phase = "entered";
    st.lastCode = code;
    st.beforeClickToken = null;
    saveState(st);

    // Agora pode acontecer 2 coisas:
    // A) abre popup (PagePopup com lkp_ok)
    // B) volta preenchido direto (sem popup visível)
    // Vamos esperar um pouco pra ver se o EVENTO_hnd preenche
    const okFilled = await (async () => {
      const started = Date.now();
      while (Date.now() - started < 6000) {
        if (document.querySelector("a[onclick*='lkp_ok']")) return false; // virou popup
        const hnd = (eventoHnd()?.value || "").trim();
        const evv = (eventoField()?.value || "").trim();
        if (hnd || (evv && evv !== code)) return true; // selecionado/preenchido
        await delay(200);
      }
      return false;
    })();

    if (okFilled) {
      // já está preenchido: vai direto CODIGOTABELA + salvar/novo
      const ct = await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 15000 });
      if (ct) {
        await ghostType(ct, "00", 20);
        log("✅ Código tabela preenchido: 00");
      } else {
        warn("⚠️ CODIGOTABELA não encontrado (seguindo mesmo assim).");
      }

      const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 15000 });
      if (!btn) { err("Botão Salvar / Novo não encontrado."); return; }

      st.phase = "clicked";
      st.clickedAt = Date.now();
      st.clickedUrl = location.href;
      st.beforeClickToken = PAGE_TOKEN;
      saveState(st);

      log("🖱️ Clicando Salvar / Novo…");
      btn.click();
      return;
    }

    // Se não preencheu ainda, provavelmente abriu popup (ou vai abrir)
    // O watchdog vai pegar o frame do popup e selecionar automaticamente.
    st.phase = "entered"; // aguardando popup
    saveState(st);
  }

  // =========================
  // WATCHDOG
  // =========================
  let inFlight = false;

  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try {
      await stepOnce();
    } catch (e) {
      err("resume erro:", e);
    } finally {
      inFlight = false;
    }
  }

  window.__HP_PLAN_ASSIST_API__.resume = resume;

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
  }, 1200);

  log("🛡️ Runner + Watchdog (PLAN ASSIST) ativos", { total: (getCodes() || []).length, popup: IS_POPUP, form: IS_FORM });
})();
