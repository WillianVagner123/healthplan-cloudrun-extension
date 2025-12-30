/*@maskara{
  "mustUrlIncludes": ["casembrapa", "plan", "assist"], 
  "detectAny": [
    "input[name='EVENTO']",
    "input[name='CODIGOTABELA']",
    "#CODIGOTABELA_btn",
    "#GRAU_btn",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']",
    "a[accesskey='S']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']");
  if (!HAS_TARGET) return;

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
  // Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_plan_assist_v2";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
    return [];
  }

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

  function pressEnter(el) {
    try {
      el.dispatchEvent(new KeyboardEvent("keypress", {
        bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13
      }));
    } catch {}
    try {
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter" }));
      el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles:true, key:"Enter", code:"Enter" }));
    } catch {}
  }

  // =========================
  // ✅ Espera “carregamento” terminar
  // =========================
  function isBusy() {
    const bodyText = (document.body?.innerText || "").toLowerCase();

    // Heurísticas comuns (ajuste se você souber o seletor exato do overlay do Plan Assist)
    const overlay =
      document.querySelector(".loading, .loader, .spinner, .blockUI, .ui-blockui, .modal-backdrop") ||
      document.querySelector("[aria-busy='true']") ||
      document.querySelector("[data-loading='true']");

    // texto tipo “aguarde / carregando”
    const aguarde = bodyText.includes("aguarde") || bodyText.includes("carregando");

    return !!overlay || aguarde;
  }

  async function waitNotBusy({ timeoutMs = 25000, stableMs = 450 } = {}) {
    const t0 = Date.now();
    let stableStart = 0;

    while (Date.now() - t0 < timeoutMs) {
      const busy = isBusy();
      if (!busy) {
        if (!stableStart) stableStart = Date.now();
        if (Date.now() - stableStart >= stableMs) return true; // ficou “livre” por um tempo contínuo
      } else {
        stableStart = 0;
      }
      await delay(120);
    }
    return false;
  }

  // =========================
  // Seletores do pipeline antigo
  // =========================
  const sel = {
    evento: "input[name='EVENTO']",
    codTabela: "input[name='CODIGOTABELA']",
    codTabelaBtn: "#CODIGOTABELA_btn",
    grauBtn: "#GRAU_btn",
    salvarNovo: "a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']",
    salvarFinal: "a[accesskey='S']"
  };

  function eventoField() {
    return document.querySelector(sel.evento) || document.getElementsByName("EVENTO")[0] || null;
  }

  function btnSalvarNovo() { return document.querySelector(sel.salvarNovo) || null; }
  function btnSalvarFinal() { return document.querySelector(sel.salvarFinal) || null; }

  async function runOldPlanAssistSteps(code) {
    const ev = await waitForElement(sel.evento, { timeoutMs: 90000 });
    if (!ev) throw new Error("Campo EVENTO não encontrado.");

    await ghostType(ev, code, 40);

    pressEnter(ev);

    // ✅ espera o “carregamento do Enter” (em vez de delay fixo)
    await waitNotBusy({ timeoutMs: 25000 });

    // CODIGOTABELA = 00
    const ct = document.querySelector(sel.codTabela) || document.getElementsByName("CODIGOTABELA")[0] || null;
    if (ct) {
      ct.value = "00";
      fire(ct, "input"); fire(ct, "change");
    }

    // CODIGOTABELA_btn
    const ctb = document.querySelector(sel.codTabelaBtn);
    if (ctb) ctb.click();

    // ✅ espera terminar (em vez de 1200ms seco)
    await waitNotBusy({ timeoutMs: 25000 });

    // GRAU_btn
    const gb = document.querySelector(sel.grauBtn);
    if (gb) gb.click();

    // ✅ espera terminar (isso é o que faltou antes de “gravar”)
    await waitNotBusy({ timeoutMs: 25000 });
  }

  async function confirmPostbackDone(st, timeoutMs = 12000) {
    const startedAt = Date.now();

    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    while (Date.now() - startedAt < timeoutMs) {
      const ev = eventoField();
      const v = (ev?.value || "").trim();
      if (v === "") return "evento_cleared";
      await delay(250);
    }
    return "timeout";
  }

  async function stepOnce() {
    const st = loadState() || {
      idx: 0, running: false, phase: "idle",
      lastCode: null, codes: null,
      beforeClickToken: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes (payload vazio e sem estado salvo)."); return; }
    st.codes = codes;

    // pós-clique: confirma e avança
    if (st.phase === "clicked" && st.lastCode) {
      const why = await confirmPostbackDone(st, 12000);
      if (why === "timeout") { saveState(st); return; }

      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.clickedAt = null;
      st.beforeClickToken = null;
      saveState(st);
    }

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    // ✅ etapas do antigo + waits reais
    await runOldPlanAssistSteps(code);

    // ✅ antes de salvar, garante “não busy”
    await waitNotBusy({ timeoutMs: 25000 });

    const isLast = st.idx === codes.length - 1;
    const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();
    if (!btn) { err(isLast ? "Botão Salvar (S) não encontrado." : "Botão Salvar / Novo não encontrado."); return; }

    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    st.clickedAt = Date.now();
    st.beforeClickToken = PAGE_TOKEN;
    saveState(st);

    log(isLast ? "🖱️ Clicando Salvar (final)…" : "🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  // WATCHDOG
  let inFlight = false;
  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }

  window.__HP_PLAN_ASSIST_API__.resume = resume;

  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 120);
  } else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    st.beforeClickToken = null;
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1500);

  log("🛡️ Runner + Watchdog (PLAN ASSIST) ativos", { total: (getCodes() || []).length });
})();
