/*@maskara{
  "mustUrlIncludes": ["planassiste", "sistema.planassiste.mpu.mp.br", "autorizadoweb"],
  "detectAny": [
    "input[name='EVENTO']",
    "input[name='CODIGOTABELA']",
    "#CODIGOTABELA_btn",
    "a[accesskey='N']",
    "a[accesskey='S']",
    "a[title*='Salvar']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // ✅ só roda no frame certo
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("input[name='CODIGOTABELA']") ||
    !!document.querySelector("#CODIGOTABELA_btn") ||
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
  // Estado persistente (igual Casembrapa)
  // =========================
  const STORE_KEY = "hp_runner_state_plan_assist_v6";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // codes vêm do popup (Maskara)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
    return [];
  }

  // token por load real
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

  async function typeSlow(el, text, charDelay = 30) {
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    for (const ch of String(text)) {
      el.value += ch;
      fire(el, "input");
      await delay(charDelay);
    }
    fire(el, "change");
    try { el.blur(); } catch {}
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

  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

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
      findLinkByText(["salvar / novo", "salvar/novo"]) ||
      null
    );
  }

  function btnSalvarFinal() {
    return (
      document.querySelector("a[accesskey='S']") ||
      findLinkByText(["salvar"]) ||
      null
    );
  }

  // =========================
  // POPUP: seleciona e pode disparar postback/reload
  // =========================
  async function selectFromLookupPopup({
    popupName = "popupMain",
    preferIndex = 0,
    preferTextIncludes = null,
    timeoutMs = 25000
  } = {}) {
    const t0 = Date.now();
    const getPopupRef = () => { try { return window.open("", popupName); } catch { return null; } };

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

    const links = pop.document.querySelectorAll("a[onclick*='lkp_ok']");
    const arr = Array.from(links);
    if (!arr.length) throw new Error("Popup abriu, mas sem opções.");

    const getText = (a) => ((a.getAttribute("text") || a.textContent || "").trim());

    let chosen = null;
    if (preferTextIncludes) {
      const needle = String(preferTextIncludes).toLowerCase();
      chosen = arr.find(a => getText(a).toLowerCase().includes(needle));
    }
    if (!chosen) chosen = arr[Math.max(0, Math.min(preferIndex, arr.length - 1))];

    const picked = { pickedText: getText(chosen), handle: chosen.getAttribute("handle") || "", total: arr.length };
    chosen.click();
    return picked;
  }

  // =========================
  // ✅ Confirma que o “after_popup” já pode rodar
  // - espera CODIGOTABELA existir (é garantia que voltou e já renderizou)
  // =========================
  async function waitMainReady(timeoutMs = 25000) {
    const ok = await waitForElement("input[name='CODIGOTABELA']", { timeoutMs });
    return !!ok;
  }

  // =========================
  // Fases (máquina de estados)
  // =========================
  async function phaseIdle(st) {
    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes."); return; }
    st.codes = codes;

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    await typeSlow(ev, code, 40);

    // marca estado ANTES de abrir popup
    st.phase = "after_popup";
    st.lastCode = code;
    st.beforePopupToken = PAGE_TOKEN; // token deste load
    saveState(st);

    // Enter abre popup
    pressEnter(ev);

    const picked = await selectFromLookupPopup({ preferIndex: 0, preferTextIncludes: null, timeoutMs: 25000 });
    log("✅ Popup selecionado:", picked);

    // ⚠️ não faz mais nada aqui (a página pode navegar)
  }

  async function phaseAfterPopup(st) {
    // ✅ Se navegou (token mudou), ótimo. Se não mudou, ainda assim esperamos os campos estarem prontos.
    await waitMainReady(25000);

    // 1) CODIGOTABELA = 00
    const ct = document.querySelector("input[name='CODIGOTABELA']");
    if (ct) {
      await typeSlow(ct, "00", 20);
      log("✅ Código tabela preenchido: 00");
    } else {
      err("Não achei input CODIGOTABELA (mas deveria).");
      return;
    }

    // 2) Clique no botão do lookup do código tabela (se quiser manter a lógica do antigo)
    const ctb = document.querySelector("#CODIGOTABELA_btn");
    if (ctb?.click) {
      ctb.click();
      // isso também pode abrir popup; mas no seu baseline você fazia e seguia.
      // Se abrir popup e exigir seleção, me diga que eu automatizo também.
      log("✅ Cliquei CODIGOTABELA_btn");
    }

    // 3) Clique no GRAU_btn (no HTML seu, GRAU_btn é o lookup do Item de custo)
    const gb = document.querySelector("#GRAU_btn");
    if (gb?.click) {
      gb.click();
      log("✅ Cliquei GRAU_btn");
    }

    // 4) Salvar / Novo
    const isLast = st.idx === st.codes.length - 1;
    const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();
    if (!btn) {
      err(isLast ? "Botão Salvar (final) não encontrado." : "Botão Salvar / Novo não encontrado.");
      return;
    }

    st.phase = "clicked_save";
    st.beforeSaveToken = PAGE_TOKEN; // token deste load (após retorno do popup)
    st.clickedAt = Date.now();
    saveState(st);

    log(isLast ? "🖱️ Clicando Salvar (final)…" : "🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  async function phaseClickedSave(st) {
    // se houve reload, avança
    if (st.beforeSaveToken && st.beforeSaveToken !== PAGE_TOKEN) {
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.beforePopupToken = null;
      st.beforeSaveToken = null;
      saveState(st);
      return;
    }

    // sem reload: tenta detectar que limpou EVENTO (novo registro)
    const ev = document.querySelector("input[name='EVENTO']");
    const v = (ev?.value || "").trim();
    if (v === "") {
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.beforePopupToken = null;
      st.beforeSaveToken = null;
      saveState(st);
      return;
    }

    // evita ficar preso
    if (Date.now() - (st.clickedAt || Date.now()) > 25000) {
      warn("⏳ Não confirmei o save, tentando novamente no próximo tick.");
    }
  }

  async function stepOnce() {
    const st = loadState() || { idx: 0, running: false, phase: "idle", codes: null, lastCode: null };

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Runner carregou sem codes."); return; }

    st.codes = codes;
    st.running = true;

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    saveState(st);

    if (st.phase === "idle") return phaseIdle(st);
    if (st.phase === "after_popup") return phaseAfterPopup(st);
    if (st.phase === "clicked_save") return phaseClickedSave(st);

    st.phase = "idle";
    saveState(st);
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

  log("🛡️ Runner + Watchdog (PLAN ASSIST) ativos", { total: (getCodes() || []).length });
})();
