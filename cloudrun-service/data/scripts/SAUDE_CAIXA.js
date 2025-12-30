/*@maskara{
  "mustUrlIncludes": ["saude.caixa.gov.br", "AutorizadorPRD", "pagemain.aspx"],
  "detectAny": [
    "input[name='EVENTO']",
    "input[name='CODIGOTABELA']",
    "a[accesskey='N']",
    "a[accesskey='S']",
    "a[title*='Salvar']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // ✅ FRAME FILTER: só roda no frame que realmente tem os elementos
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("input[name='CODIGOTABELA']") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']") ||
    !!document.querySelector("a[title*='Salvar']");
  if (!HAS_TARGET) return;

  // Reinjeção na mesma página = continue
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
  // Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_saude_caixa_v1";
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

  async function typeSlow(el, text, charDelay = 25) {
    if (!el) return;
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

  async function clearField(el) {
    if (!el) return;
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    try { el.blur(); } catch {}
    await delay(40);
  }

  async function clearEventoHard() {
    const ev = document.querySelector("input[name='EVENTO']");
    if (!ev) return;
    await clearField(ev);

    const evVal = document.querySelector("input[name='EVENTO_val']");
    const evHnd = document.querySelector("input[name='EVENTO_hnd']");
    if (evVal) { evVal.value = ""; fire(evVal, "change"); }
    if (evHnd) { evHnd.value = ""; fire(evHnd, "change"); }
  }

  function pressEnter(el) {
    try {
      el.dispatchEvent(new KeyboardEvent("keypress", {
        bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
      }));
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
  // POPUP EVENTO
  // =========================
  async function selectFromLookupPopup({ popupName = "popupMain", preferIndex = 0, timeoutMs = 25000 } = {}) {
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

    const chosen = arr[Math.max(0, Math.min(preferIndex, arr.length - 1))];
    const picked = {
      pickedText: (chosen.getAttribute("text") || chosen.textContent || "").trim(),
      handle: chosen.getAttribute("handle") || "",
      total: arr.length
    };
    chosen.click();
    return picked;
  }

  // =========================
  // ✅ Confirma reload/postback
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 20000) {
    const start = Date.now();

    // ✅ 1) reload real (novo PAGE_TOKEN) => ok
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    // ✅ 2) fallback: sinais na mesma página
    while (Date.now() - start < timeoutMs) {
      if (btnSalvarNovo() || btnSalvarFinal()) return "buttons_present";
      const evText = (document.querySelector("input[name='EVENTO']")?.value || "").trim();
      if (!evText) return "evento_empty";
      await delay(250);
    }
    return "timeout";
  }

  async function waitMainReady(timeoutMs = 25000) {
    const ok = await waitForElement("input[name='EVENTO']", { timeoutMs });
    return !!ok;
  }

  // =========================
  // Fases
  // =========================
  async function phaseIdle(st) {
    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes."); return; }
    st.codes = codes;

    await waitMainReady(90000);

    // garante EVENTO limpo
    await clearEventoHard();

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    await typeSlow(ev, code, 35);

    st.phase = "after_popup";
    st.lastCode = code;
    st.beforePopupToken = PAGE_TOKEN;
    saveState(st);

    // abre popup
    pressEnter(ev);
    const picked = await selectFromLookupPopup({ preferIndex: 0, timeoutMs: 25000 });
    log("✅ Popup EVENTO selecionado:", picked);
  }

  async function phaseAfterPopup(st) {
    await waitMainReady(25000);

    // CODIGOTABELA = 22 (fixo)
    const ct = document.querySelector("input[name='CODIGOTABELA']");
    if (!ct) { err("Não achei CODIGOTABELA."); return; }
    await typeSlow(ct, "22", 15);
    log("✅ Código tabela preenchido: 22");

    // Se existir GRAU, limpa e segue (não bloqueia)
    const grau = document.querySelector("input[name='GRAU']");
    if (grau) {
      await clearField(grau);
      log("ℹ️ Campo GRAU existe: limpei (não bloqueia).");
    }

    const isLast = st.idx === st.codes.length - 1;
    const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();
    if (!btn) {
      err(isLast ? "Botão Salvar (final) não encontrado." : "Botão Salvar / Novo não encontrado.");
      return;
    }

    st.phase = "clicked_save";
    st.beforeClickToken = PAGE_TOKEN; // token ANTES do clique (pra detectar reload)
    st.clickedAt = Date.now();
    saveState(st);

    log(isLast ? "🖱️ Clicando Salvar (final)…" : "🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  async function phaseClickedSave(st) {
    const why = await confirmPostbackDone(st, 20000);

    if (why === "timeout") {
      warn("⏳ Postback ainda não confirmou. Vou tentar no próximo tick.");
      saveState(st);
      return;
    }

    log(`✅ Postback OK: ${st.lastCode} (${why}) → próximo.`);

    st.idx += 1;
    st.phase = "idle";
    st.lastCode = null;
    st.beforePopupToken = null;
    st.beforeClickToken = null;
    st.clickedAt = null;
    saveState(st);
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
  }, 1200);

  log("🛡️ Runner + Watchdog (SAUDE CAIXA • cam-style) ativos", { total: (getCodes() || []).length });
})();
