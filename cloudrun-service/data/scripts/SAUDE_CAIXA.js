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
  // ✅ Só TOP frame
  if (window.top !== window) return;

  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("input[name='CODIGOTABELA']") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']") ||
    !!document.querySelector("a[title*='Salvar']");
  if (!HAS_TARGET) return;

  const scope = "SAUDE_CAIXA";
  const payload = window.__HP_PAYLOAD__ || {};
  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // SINGLETON (não cria 2 runners)
  // =========================
  if (!window.__HP_SAUDE_CAIXA_SINGLETON__) {
    window.__HP_SAUDE_CAIXA_SINGLETON__ = {
      startedAt: Date.now(),
      intervalId: null,
      inFlight: false
    };
  }
  const SINGLE = window.__HP_SAUDE_CAIXA_SINGLETON__;

  // =========================
  // Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_saude_caixa_v12";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // =========================
  // LOCK cross-injection (evita múltiplas instâncias)
  // =========================
  const LOCK_KEY = "hp_saude_caixa_lock";
  const LOCK_TTL_MS = 8000; // tempo suficiente p/ 1 passo

  function tryAcquireLock() {
    const now = Date.now();
    try {
      const raw = sessionStorage.getItem(LOCK_KEY);
      if (raw) {
        const lock = JSON.parse(raw);
        if (lock?.until && lock.until > now) return false; // lock ativo
      }
      sessionStorage.setItem(LOCK_KEY, JSON.stringify({ until: now + LOCK_TTL_MS }));
      return true;
    } catch {
      return true;
    }
  }

  function releaseLock() {
    try { sessionStorage.removeItem(LOCK_KEY); } catch {}
  }

  // =========================
  // Log “Acessou” só 1x por URL (debug)
  // =========================
  const ACCESS_KEY = "hp_saude_caixa_last_access_url";
  function logAccessOnce() {
    const url = location.href;
    try {
      const last = sessionStorage.getItem(ACCESS_KEY) || "";
      if (last === url) return;
      sessionStorage.setItem(ACCESS_KEY, url);
    } catch {}
    console.log("Acessou", url);
  }

  // =========================
  // Códigos: payload.codes OU estado salvo
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
    return [];
  }

  // token por carga
  const PAGE_TOKEN = String(Date.now()) + "_" + Math.random().toString(16).slice(2);

  // =========================
  // Helpers DOM
  // =========================
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
    if (!el) return;
    if (B?.fire) return B.fire(el, type);
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function typeSlow(el, text, charDelay = 25) {
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
        bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13
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
  // Confirma postback
  // =========================
  function snapshotMarkers() {
    const guid = document.querySelector("#formpost_guid")?.value || "";
    const href = location.href;
    const evHnd = document.querySelector("input[name='EVENTO_hnd']")?.value || "";
    const ctVal = document.querySelector("input[name='CODIGOTABELA']")?.value || "";
    return { guid, href, evHnd, ctVal };
  }

  async function confirmPostbackDone(st, timeoutMs = 25000) {
    const start = Date.now();
    const before = st.postbackBefore || null;

    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    while (Date.now() - start < timeoutMs) {
      const now = snapshotMarkers();

      if (before?.href && now.href !== before.href) return "href_changed";
      if (before?.guid && now.guid && before.guid && now.guid !== before.guid) return "guid_changed";

      const evText = (document.querySelector("input[name='EVENTO']")?.value || "").trim();
      if (!evText) return "evento_empty";

      if (before?.evHnd && now.evHnd !== before.evHnd && now.evHnd === "") return "evento_handle_cleared";

      if (btnSalvarNovo() || btnSalvarFinal()) return "buttons_present";

      await delay(250);
    }
    return "timeout";
  }

  // =========================
  // CONFIG
  // =========================
  const CODIGO_TABELA_FIXO = "22"; // <-- se quiser 00, troque aqui

  // =========================
  // Fases
  // =========================
  async function phaseIdle(st) {
    logAccessOnce();

    const codes = st.codes || getCodes();
    if (!codes.length) { warn("Sem codes."); return; }
    st.codes = codes;

    await clearEventoHard();

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!ev) { err("Campo EVENTO não encontrado."); return; }

    await typeSlow(ev, code, 35);

    // ✅ salva estado antes do popup (portal pode postback)
    st.phase = "after_popup";
    st.lastCode = code;
    st.afterPopupAt = Date.now();
    saveState(st);

    pressEnter(ev);
    const picked = await selectFromLookupPopup({ preferIndex: 0, timeoutMs: 25000 });
    log("✅ Popup EVENTO selecionado:", picked);
  }

  async function phaseAfterPopup(st) {
    logAccessOnce();

    const ok = await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 90000 });
    if (!ok) { err("Não voltou CODIGOTABELA após popup."); return; }

    const ct = document.querySelector("input[name='CODIGOTABELA']");
    if (!ct) { err("Não achei CODIGOTABELA."); return; }
    await typeSlow(ct, CODIGO_TABELA_FIXO, 15);
    log("✅ Código tabela preenchido:", CODIGO_TABELA_FIXO);

    const grau = document.querySelector("input[name='GRAU']");
    if (grau) {
      await clearField(grau);
      const grauVal = document.querySelector("input[name='GRAU_val']");
      const grauHnd = document.querySelector("input[name='GRAU_hnd']");
      if (grauVal) { grauVal.value = ""; fire(grauVal, "change"); }
      if (grauHnd) { grauHnd.value = ""; fire(grauHnd, "change"); }
      log("ℹ️ Campo GRAU existe: limpei (não bloqueia).");
    }

    const isLast = st.idx === st.codes.length - 1;
    const btn = isLast ? btnSalvarFinal() : btnSalvarNovo();
    if (!btn) { err("Botão Salvar/Novo não encontrado."); return; }

    st.phase = "clicked_save";
    st.postbackBefore = snapshotMarkers();
    st.beforeClickToken = PAGE_TOKEN;
    saveState(st);

    btn.click();
    log(isLast ? "🖱️ Salvar (final) clicado" : "🖱️ Salvar / Novo clicado");
  }

  async function phaseClickedSave(st) {
    logAccessOnce();

    const why = await confirmPostbackDone(st, 25000);
    if (why === "timeout") {
      warn("⏳ Postback não confirmou ainda. Próximo tick.");
      saveState(st);
      return;
    }

    log(`✅ Postback confirmado (${why}) → próximo código.`);

    st.idx += 1;
    st.phase = "idle";
    st.lastCode = null;
    st.beforeClickToken = null;
    st.postbackBefore = null;
    saveState(st);
  }

  async function stepOnce() {
    const st = loadState() || { idx: 0, running: false, phase: "idle", codes: null, lastCode: null };
    const codes = st.codes || getCodes();

    if (!codes.length) { warn("Runner sem codes."); return; }

    st.codes = codes;
    st.running = true;

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    saveState(st);

    if (st.phase === "after_popup" && document.querySelector("input[name='CODIGOTABELA']")) {
      return phaseAfterPopup(st);
    }

    if (st.phase === "idle") return phaseIdle(st);
    if (st.phase === "after_popup") return phaseAfterPopup(st);
    if (st.phase === "clicked_save") return phaseClickedSave(st);

    st.phase = "idle";
    saveState(st);
  }

  // =========================
  // Resume (único, com lock)
  // =========================
  async function resume(reason = "watchdog") {
    if (SINGLE.inFlight) return;
    if (!tryAcquireLock()) return; // ✅ impede 2 injeções concorrendo

    SINGLE.inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally {
      SINGLE.inFlight = false;
      releaseLock();
    }
  }

  window.__HP_SAUDE_CAIXA_API__ = { resume };

  // =========================
  // Start / resume (sem criar interval duplicado)
  // =========================
  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 150);
  } else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  } else {
    // não para o portal (pode ser só reinjeção)
    setTimeout(() => resume("soft-resume"), 250);
  }

  // ✅ Watchdog único
  if (!SINGLE.intervalId) {
    SINGLE.intervalId = setInterval(() => {
      const st = loadState();
      if (!st?.running) return;
      resume("watchdog-tick");
    }, 1200);
  }

  log("🛡️ Runner + Watchdog (SAUDE CAIXA) ativos", { total: (getCodes() || []).length });
})();
