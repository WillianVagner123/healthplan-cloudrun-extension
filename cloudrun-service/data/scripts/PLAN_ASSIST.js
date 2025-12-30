/*@maskara{
  "mustUrlIncludes": ["planassiste", "sistema.planassiste.mpu.mp.br", "autorizadoweb"],
  "detectAny": [
    "input[name='EVENTO']",
    "a[accesskey='N']",
    "a[accesskey='S']",
    "a[title*='Salvar']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // ✅ FRAME FILTER
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']") ||
    !!document.querySelector("a[title*='Salvar']");
  if (!HAS_TARGET) return;

  // reinjeção = continue
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
  const STORE_KEY = "hp_runner_state_plan_assist_v4";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // codes só do popup (SEM lista fixa)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
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

  async function typeSlow(el, text, charDelay = 35) {
    el.focus();
    try { el.value = ""; } catch {}
    fire(el, "input"); fire(el, "change");
    for (const ch of String(text)) {
      try { el.value += ch; } catch {}
      fire(el, "input");
      await delay(charDelay);
    }
    fire(el, "change");
    try { el.blur(); } catch {}
  }

  async function ghostType(el, text, charDelay = 35) {
    if (B?.ghostType) return B.ghostType(el, text, charDelay);
    return typeSlow(el, text, charDelay);
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
  // Busy wait (genérico)
  // =========================
  function isBusy(doc = document) {
    const bodyText = (doc.body?.innerText || "").toLowerCase();
    const overlay =
      doc.querySelector(".loading, .loader, .spinner, .blockUI, .ui-blockui, .modal-backdrop") ||
      doc.querySelector("[aria-busy='true']") ||
      doc.querySelector("[data-loading='true']");
    const aguarde = bodyText.includes("aguarde") || bodyText.includes("carregando");
    return !!overlay || aguarde;
  }

  async function waitNotBusy({ timeoutMs = 25000, stableMs = 450, doc = document } = {}) {
    const t0 = Date.now();
    let stableStart = 0;
    while (Date.now() - t0 < timeoutMs) {
      const busy = isBusy(doc);
      if (!busy) {
        if (!stableStart) stableStart = Date.now();
        if (Date.now() - stableStart >= stableMs) return true;
      } else {
        stableStart = 0;
      }
      await delay(120);
    }
    return false;
  }

  // =========================
  // ✅ Finder por texto (links)
  // =========================
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function findLinkByText(needles = []) {
    const aTags = Array.from(document.querySelectorAll("a"));
    const nNeedles = needles.map(norm);
    for (const a of aTags) {
      const t = norm(a.textContent || a.innerText || "");
      if (!t) continue;
      if (nNeedles.some(n => t.includes(n))) return a;
    }
    return null;
  }

  function btnSalvarNovo() {
    return (
      document.querySelector("a[accesskey='N']") ||
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      findLinkByText(["salvar / novo", "salvar/novo", "salvar  /  novo"]) ||
      null
    );
  }

  function btnSalvarFinal() {
    return (
      document.querySelector("a[accesskey='S']") ||
      findLinkByText(["salvar"]) || // fallback (último caso)
      null
    );
  }

  // =========================
  // ✅ Achar input pelo rótulo "Código tabela"
  // =========================
  function findInputNearLabelText(labelText) {
    const wanted = norm(labelText);
    const candidates = Array.from(document.querySelectorAll("td, label, span, div")).filter(el => {
      const t = norm(el.textContent);
      return t.includes(wanted);
    });

    // tenta achar input dentro do mesmo "td" (ou td seguinte)
    for (const el of candidates) {
      // 1) input dentro do mesmo nó
      let inp = el.querySelector?.("input[type='text'], input:not([type]), textarea");
      if (inp) return inp;

      // 2) se for td: tenta próximo td
      const td = el.closest?.("td");
      if (td && td.nextElementSibling) {
        inp = td.nextElementSibling.querySelector?.("input[type='text'], input:not([type]), textarea");
        if (inp) return inp;
      }

      // 3) tenta buscar no pai imediato
      const p = el.parentElement;
      if (p) {
        inp = p.querySelector?.("input[type='text'], input:not([type]), textarea");
        if (inp) return inp;
      }
    }
    return null;
  }

  function getCodTabelaInput() {
    return (
      document.querySelector("input[name='CODIGOTABELA']") ||
      document.querySelector("input[id*='CODIGOTABELA']") ||
      document.querySelector("input[name*='CODIGOTABELA']") ||
      findInputNearLabelText("Código tabela") ||
      findInputNearLabelText("Codigo tabela") ||
      null
    );
  }

  // botão ao lado do código tabela (lupinha)
  function getCodTabelaBtn() {
    return (
      document.querySelector("#CODIGOTABELA_btn") ||
      document.querySelector("[id*='CODIGOTABELA_btn']") ||
      // tenta achar “botão” perto do campo
      (() => {
        const ct = getCodTabelaInput();
        if (!ct) return null;
        const td = ct.closest?.("td");
        if (!td) return null;
        // geralmente a lupinha é um <a> ou <img> no mesmo td ou td seguinte
        return (
          td.querySelector("a, img, button") ||
          td.nextElementSibling?.querySelector("a, img, button") ||
          null
        );
      })()
    );
  }

  function getGrauBtn() {
    return (
      document.querySelector("#GRAU_btn") ||
      document.querySelector("[id*='GRAU_btn']") ||
      null
    );
  }

  // =========================
  // Lookup Popup (PagePopup.aspx)
  // =========================
  async function selectFromLookupPopup({
    popupName = "popupMain",
    preferExactText = null,
    preferTextIncludes = null,
    preferHandle = null,
    preferIndex = 0,
    timeoutMs = 25000
  } = {}) {
    const t0 = Date.now();

    function getPopupRef() {
      try { return window.open("", popupName); } catch { return null; }
    }

    let pop = null;

    while (Date.now() - t0 < timeoutMs) {
      pop = getPopupRef();
      if (pop && pop.document) break;
      await delay(150);
    }
    if (!pop || !pop.document) throw new Error("Popup não encontrado (popupMain).");

    while (Date.now() - t0 < timeoutMs) {
      try {
        const links = pop.document.querySelectorAll("a[onclick*='lkp_ok']");
        if (links && links.length) break;
      } catch {}
      await delay(150);
    }

    await waitNotBusy({ timeoutMs: 20000, doc: pop.document });

    const links = pop.document.querySelectorAll("a[onclick*='lkp_ok']");
    if (!links.length) throw new Error("Popup abriu, mas não achei opções lkp_ok().");

    const arr = Array.from(links);

    const getText = (a) => ((a.getAttribute("text") || a.textContent || "").trim());
    const getHandle = (a) => (a.getAttribute("handle") || "");

    let chosen = null;

    if (preferHandle) chosen = arr.find(a => getHandle(a) === String(preferHandle));
    if (!chosen && preferExactText) chosen = arr.find(a => getText(a) === preferExactText);
    if (!chosen && preferTextIncludes) {
      const needle = String(preferTextIncludes).toLowerCase();
      chosen = arr.find(a => getText(a).toLowerCase().includes(needle));
    }
    if (!chosen) chosen = arr[Math.max(0, Math.min(preferIndex, arr.length - 1))];

    chosen.click();
    return { pickedText: getText(chosen), handle: getHandle(chosen), total: arr.length };
  }

  // =========================
  // ✅ Pipeline completo: Evento -> popup -> 00 -> botões -> salvar/novo
  // =========================
  async function runPlanAssistSteps(code) {
    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) throw new Error("Campo EVENTO não encontrado.");

    await ghostType(ev, code, 40);
    pressEnter(ev);

    // popup: pega 1ª opção por padrão
    const picked = await selectFromLookupPopup({
      preferTextIncludes: null, // ex: "dosagem"
      preferIndex: 0,
      timeoutMs: 25000
    });
    log("✅ Popup selecionado:", picked);

    // espera a página “assentar”
    await waitNotBusy({ timeoutMs: 25000 });

    // ✅ CODIGOTABELA = 00 (AGORA MAIS ROBUSTO)
    const ct = getCodTabelaInput();
    if (!ct) {
      warn("⚠️ Não achei o input do Código tabela. Vou tentar salvar mesmo assim.");
    } else {
      await typeSlow(ct, "00", 20);
      log("✅ Código tabela preenchido: 00");
    }

    // clicar botão de código tabela (se existir)
    const ctb = getCodTabelaBtn();
    if (ctb && typeof ctb.click === "function") {
      ctb.click();
      await waitNotBusy({ timeoutMs: 25000 });
      log("✅ Cliquei no botão do Código tabela");
    } else {
      warn("⚠️ Não achei o botão do Código tabela (lupa). Seguindo...");
    }

    // GRAU
    const gb = getGrauBtn();
    if (gb && typeof gb.click === "function") {
      gb.click();
      await waitNotBusy({ timeoutMs: 25000 });
      log("✅ Cliquei no GRAU");
    } else {
      warn("⚠️ Não achei o botão GRAU. Seguindo...");
    }
  }

  // =========================
  // Confirma pós-salvar
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 20000) {
    const startedAt = Date.now();

    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    while (Date.now() - startedAt < timeoutMs) {
      const v = (document.querySelector("input[name='EVENTO']")?.value || "").trim();
      if (v === "") return "evento_cleared";
      if (isBusy(document)) { await delay(200); continue; }
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
      const why = await confirmPostbackDone(st, 20000);
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

    // evita dobrar clique
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) return;

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await runPlanAssistSteps(code);
    await waitNotBusy({ timeoutMs: 25000 });

    const isLast = st.idx === codes.length - 1;
    const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();

    if (!btn) {
      err(isLast ? "Botão Salvar (final) não encontrado." : "Botão Salvar / Novo não encontrado.");
      return;
    }

    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    st.clickedAt = Date.now();
    st.beforeClickToken = PAGE_TOKEN;
    saveState(st);

    log(isLast ? "🖱️ Clicando Salvar (final)…" : "🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  // =========================
  // WATCHDOG
  // =========================
  let inFlight = false;
  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
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
