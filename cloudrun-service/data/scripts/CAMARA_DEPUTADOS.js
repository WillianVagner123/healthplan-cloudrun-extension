/*@maskara{
  "mustUrlIncludes": ["camara", "camara.leg.br", "deputados"],
  "detectAny": [
    "input[name='EVENTO']",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // Se reinjetou na mesma página: vira "continue"
  if (window.__HP_CAMARA_API__?.resume) {
    try { window.__HP_CAMARA_API__.resume("reinjected"); } catch {}
    return;
  }

  window.__HP_CAMARA_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =========================
  // Estado persistente
  // =========================
  const STORE_KEY = "hp_runner_state_camara_v3";

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

  function pageHasRegistroNaoEncontrado() {
    const t = (document.body?.innerText || "").toLowerCase();
    return t.includes("registro não encontrado") || t.includes("verifique mensagens nos campos");
  }

  function eventoField() {
    return document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
  }

  function btnSalvarNovo() {
    return (
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']") ||
      null
    );
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
  // ✅ Confirma “salvou” (postback real OU postback “soft”)
  // =========================
  async function confirmPostbackDone(st, timeoutMs = 12000) {
    const startedAt = Date.now();
    const targetCode = st.lastCode;

    // 1) se mudou PAGE_TOKEN (reload real), pronto
    if (st.lastPageToken && st.lastPageToken !== PAGE_TOKEN) return "nav";

    // 2) senão, aguarda sinais de conclusão nesta mesma página:
    // - campo EVENTO limpou
    // - apareceu mensagem de erro/sucesso na tela (registro não encontrado / verifique mensagens)
    while (Date.now() - startedAt < timeoutMs) {
      const ev = eventoField();
      const v = (ev?.value || "").trim();
      if (v === "") return "evento_cleared";
      if (pageHasRegistroNaoEncontrado()) return "registro_nao_encontrado";
      await delay(250);
    }

    // 3) se não deu pra confirmar, não avança agressivo — apenas registra
    warn("⏳ Não consegui confirmar conclusão do postback (timeout).", { code: targetCode });
    return "timeout";
  }

  async function stepOnce() {
    const st = loadState() || { idx: 0, running: false, phase: "idle", lastCode: null, codes: null };
    const codes = st.codes || getCodes();

    if (!codes.length) {
      warn("Sem codes (payload vazio e sem estado salvo).");
      return;
    }

    st.codes = codes;

    // Se voltamos “depois do clique”, decide se avança
    if (st.phase === "clicked" && st.lastCode) {
      // se mudou de página (reinject), PAGE_TOKEN será novo; mas em postback “soft” pode ser o mesmo.
      const why = await confirmPostbackDone(st, 12000);

      if (why === "timeout") {
        // não avança pra não pular sem salvar; tenta de novo no watchdog
        saveState(st);
        return;
      }

      if (pageHasRegistroNaoEncontrado()) {
        warn(`⚠️ Registro não encontrado: ${st.lastCode} → próximo.`);
      } else {
        log(`✅ Postback OK: ${st.lastCode} (${why}) → próximo.`);
      }

      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.clickedAt = null;
      st.clickedUrl = null;
      st.lastPageToken = PAGE_TOKEN;
      saveState(st);
    }

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // Evita “dobrar clique” em reinjeções muito rápidas
    if (st.phase === "clicked" && st.clickedAt && (Date.now() - st.clickedAt) < 1200) {
      return;
    }

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 60000 });

    if (!ev) { err("Campo EVENTO não encontrado."); return; }
    if (!btn) { err("Botão Salvar / Novo não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await ghostType(ev, code, 35);

    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    st.clickedAt = Date.now();
    st.clickedUrl = location.href;
    st.lastPageToken = PAGE_TOKEN;
    saveState(st);

    log("🖱️ Clicando Salvar / Novo…");
    btn.click();
  }

  // =========================
  // ✅ WATCHDOG “auto-recovery”
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

  window.__HP_CAMARA_API__.resume = resume;

  // Auto-start / auto-resume
  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    // retoma
    setTimeout(() => resume("auto-resume"), 120);
  } else if (codesFromPopup.length) {
    // inicia
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    st.lastPageToken = PAGE_TOKEN;
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  // Watchdog periódico: se BG falhar 1 reinjeção, ele se “puxa”
  // (não acelera: só tenta se estiver rodando)
  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1500);

  log("🛡️ Runner + Watchdog v3 ativos", { total: (getCodes() || []).length });
})();
