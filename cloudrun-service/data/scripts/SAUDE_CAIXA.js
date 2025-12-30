/*@maskara{
  "mustUrlIncludes": ["saude.caixa.gov.br", "AutorizadorPRD", "pagemain.aspx"],
  "detectAny": [
    "input[name='EVENTO']",
    "input[name='CODIGOTABELA']",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']",
    "a[accesskey='S']",
    "a[title*='Salvar']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // ✅ TOP frame only (evita duplicação por iframe)
  if (window.top !== window) return;

  // ✅ FRAME FILTER: só roda se tiver alvo
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("input[name='CODIGOTABELA']") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']") ||
    !!document.querySelector("a[accesskey='N']") ||
    !!document.querySelector("a[accesskey='S']") ||
    !!document.querySelector("a[title*='Salvar']");
  if (!HAS_TARGET) return;

  // ✅ Reinjeção vira "continue"
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
  // CONFIG
  // =========================
  const CODIGO_TABELA_FIXO = "22"; // <-- você pediu tabela 22 (se quiser 00, troque aqui)
  const STORE_KEY = "hp_runner_state_saude_caixa_camstyle_v1";

  // =========================
  // Estado persistente
  // =========================
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

  async function ghostType(el, text, charDelay = 35) {
    if (!el) return;
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

  async function clearField(el) {
    if (!el) return;
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    try { el.blur(); } catch {}
    await delay(30);
  }

  async function clearEventoHard() {
    const ev = document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
    if (!ev) return;
    await clearField(ev);

    const evVal = document.querySelector("input[name='EVENTO_val']");
    const evHnd = document.querySelector("input[name='EVENTO_hnd']");
    if (evVal) { evVal.value = ""; fire(evVal, "change"); }
    if (evHnd) { evHnd.value = ""; fire(evHnd, "change"); }
  }

  function eventoField() {
    return document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
  }

  function codTabelaField() {
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

  function btnSalvarFinal() {
    return (
      document.querySelector("a[accesskey='S']") ||
      document.querySelector("a[title^='Salvar']") ||
      document.querySelector("a[title*='Salvar']") ||
      null
    );
  }

  function pressEnter(el) {
    try {
      el.dispatchEvent(new KeyboardEvent("keypress", {
        bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13
      }));
    } catch {}
  }

  // Mensagens comuns (ajuste se quiser)
  function pageHasRegistroNaoEncontrado() {
    const t = (document.body?.innerText || "").toLowerCase();
    return (
      t.includes("registro não encontrado") ||
      t.includes("registro nao encontrado") ||
      t.includes("verifique mensagens nos campos") ||
      t.includes("verifique as mensagens") ||
      t.includes("inconsist") // inconsistência/inconsistente
    );
  }

  // =========================
  // POPUP EVENTO (lookup)
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
  // ✅ Confirma “salvou” (reload real OU sinais “soft”)
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 15000) {
    const startedAt = Date.now();

    // 1) se mudou PAGE_TOKEN (reload real), pronto
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    // 2) sinais “soft”:
    // - EVENTO limpou (muito comum após Salvar/Novo)
    // - apareceu “registro não encontrado” / mensagens
    // - botões reapareceram (DOM pronto)
    while (Date.now() - startedAt < timeoutMs) {
      const ev = eventoField();
      const v = (ev?.value || "").trim();
      if (v === "") return "evento_cleared";
      if (pageHasRegistroNaoEncontrado()) return "mensagem_tela";
      if (btnSalvarNovo() || btnSalvarFinal()) return "buttons_present";
      await delay(250);
    }

    warn("⏳ Não consegui confirmar conclusão do postback (timeout).", { code: st.lastCode });
    return "timeout";
  }

  // =========================
  // Step único
  // =========================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",        // idle | clicked
      lastCode: null,
      codes: null,
      beforeClickToken: null,
      clickedAt: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) {
      warn("Sem codes (payload vazio e sem estado salvo).");
      return;
    }
    st.codes = codes;

    // Se voltamos “depois do clique”, decide se avança
    if (st.phase === "clicked" && st.lastCode) {
      const why = await confirmPostbackDone(st, 15000);

      if (why === "timeout") {
        saveState(st);
        return;
      }

      if (pageHasRegistroNaoEncontrado()) {
        warn(`⚠️ Mensagem/erro na tela: ${st.lastCode} → próximo.`);
      } else {
        log(`✅ Postback OK: ${st.lastCode} (${why}) → próximo.`);
      }

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

    // Anti-duplo-clique (reinjeções rápidas)
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) {
      return;
    }

    // Garante campos/botões
    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    const ct = await waitForElement("input[name='CODIGOTABELA']", { timeoutMs: 90000 });

    if (!ev) { err("Campo EVENTO não encontrado."); return; }
    if (!ct) { err("Campo CODIGOTABELA não encontrado."); return; }

    const isLast = st.idx === codes.length - 1;
    const btn = isLast
      ? (await waitForElement("a[accesskey='S'], a[title^='Salvar'], a[title*='Salvar']", { timeoutMs: 60000 }))
      : (await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 60000 }));

    if (!btn) { err(isLast ? "Botão Salvar (final) não encontrado." : "Botão Salvar / Novo não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    // 1) limpa e digita EVENTO
    await clearEventoHard();
    await ghostType(ev, code, 35);

    // 2) abre lookup (Enter) e seleciona 1ª opção
    pressEnter(ev);
    const picked = await selectFromLookupPopup({ preferIndex: 0, timeoutMs: 25000 });
    log("✅ Popup EVENTO selecionado:", picked);

    // 3) preenche CODIGOTABELA fixo (22)
    await ghostType(ct, CODIGO_TABELA_FIXO, 15);
    log("✅ Código tabela preenchido:", CODIGO_TABELA_FIXO);

    // 4) “se não aparecer campo procedimento, pode avançar” → aqui a gente ignora
    // (opcional: limpar GRAU se existir, mas NÃO BLOQUEIA)
    const grau = document.querySelector("input[name='GRAU']");
    if (grau) {
      await clearField(grau);
      const grauVal = document.querySelector("input[name='GRAU_val']");
      const grauHnd = document.querySelector("input[name='GRAU_hnd']");
      if (grauVal) { grauVal.value = ""; fire(grauVal, "change"); }
      if (grauHnd) { grauHnd.value = ""; fire(grauHnd, "change"); }
      log("ℹ️ Campo GRAU existe: limpei (não bloqueia).");
    }

    // 5) salva estado ANTES do clique
    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    st.clickedAt = Date.now();
    st.beforeClickToken = PAGE_TOKEN; // ✅ token ANTES do clique
    saveState(st);

    log(isLast ? "🖱️ Clicando Salvar (final)..." : "🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  // =========================
  // WATCHDOG “auto-recovery”
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
    st.beforeClickToken = null;
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  // Watchdog periódico (igual Câmara)
  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1500);

  log("🛡️ Runner + Watchdog (SAUDE CAIXA • cam-style) ativos", { total: (getCodes() || []).length });
})();
