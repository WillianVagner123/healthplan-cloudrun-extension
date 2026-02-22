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
  // ✅ FRAME FILTER: só roda no frame que realmente tem os elementos
  const HAS_TARGET =
    !!document.querySelector("input[name='EVENTO']") ||
    !!document.querySelector("a[title^='Salvar / Novo']") ||
    !!document.querySelector("a[title*='Salvar / Novo']") ||
    !!document.querySelector("a[accesskey='N']");
  if (!HAS_TARGET) return;

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
  // ✅ CADÊNCIA (AJUSTE AQUI)
  // =========================
  const CADENCE_MS = 2500;            // pausa entre registros (2.5s)
  const POST_CLICK_SETTLE_MS = 900;   // espera pós-clique antes de checar (0.9s)
  const CHECK_EVERY_MS = 400;         // frequência de checagem de postback
  const POSTBACK_TIMEOUT_MS = 16000;  // timeout do postback

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
  // ✅ Confirma “salvou”
  // =========================
  async function confirmPostbackDone(st, timeoutMs = POSTBACK_TIMEOUT_MS) {
    const startedAt = Date.now();

    // 1) se mudou PAGE_TOKEN (reload real), pronto
    if (st.beforeClickToken && st.beforeClickToken !== PAGE_TOKEN) return "nav";

    // 2) aguarda sinais nesta mesma página:
    // - campo EVENTO limpou
    // - apareceu mensagem na tela
    while (Date.now() - startedAt < timeoutMs) {
      const ev = eventoField();
      const v = (ev?.value || "").trim();
      if (v === "") return "evento_cleared";
      if (pageHasRegistroNaoEncontrado()) return "registro_nao_encontrado";
      await delay(CHECK_EVERY_MS);
    }

    warn("⏳ Não confirmei conclusão do postback (timeout).", { code: st.lastCode });
    return "timeout";
  }

  // =========================
  // ✅ Scheduler cadenciado (sem setInterval)
  // =========================
  let timer = null;
  function scheduleNext(ms, reason = "") {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => resume(`scheduled:${reason}`), ms);
  }

  async function stepOnce() {
    const st = loadState() || {
      idx: 0, running: false, phase: "idle",
      lastCode: null, codes: null,
      beforeClickToken: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) {
      warn("Sem codes (payload vazio e sem estado salvo).");
      return { done: true };
    }
    st.codes = codes;

    // ✅ Se voltamos “depois do clique”, decide se avança
    if (st.phase === "clicked" && st.lastCode) {
      // dá uma respirada após clique antes de checar
      if (!st._settledAfterClick) {
        st._settledAfterClick = true;
        saveState(st);
        await delay(POST_CLICK_SETTLE_MS);
      }

      const why = await confirmPostbackDone(st);

      if (why === "timeout") {
        saveState(st);
        // tenta de novo, mas cadenciado
        scheduleNext(1200, "postback-timeout-retry");
        return { done: false };
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
      st.beforeClickToken = null;
      st._settledAfterClick = false;
      saveState(st);

      // ✅ pausa entre um registro e outro (cadência principal)
      scheduleNext(CADENCE_MS, "cadence-after-advance");
      return { done: false };
    }

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return { done: true };
    }

    const ev = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 60000 });

    if (!ev) { err("Campo EVENTO não encontrado."); return { done: false }; }
    if (!btn) { err("Botão Salvar / Novo não encontrado."); return { done: false }; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) ${code}`);

    await ghostType(ev, code, 35);

    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    st.clickedAt = Date.now();
    st.clickedUrl = location.href;
    st.beforeClickToken = PAGE_TOKEN;
    st._settledAfterClick = false;

    saveState(st);

    log("🖱️ Clicando Salvar / Novo…");
    btn.click();

    // ✅ depois do clique: agenda checagem (em vez de rodar “tick”)
    scheduleNext(POST_CLICK_SETTLE_MS, "after-click-check");
    return { done: false };
  }

  // =========================
  // ✅ Runner
  // =========================
  let inFlight = false;

  async function resume(reason = "manual") {
    if (inFlight) return;
    inFlight = true;
    try {
      const out = await stepOnce();
      // Se por algum motivo não agendou nada e ainda está rodando, garante continuidade cadenciada
      const st = loadState();
      if (st?.running && !out?.done && !timer) scheduleNext(1200, "fallback");
    } catch (e) {
      err("resume erro:", e);
      scheduleNext(1500, "error-retry");
    } finally {
      inFlight = false;
    }
  }

  window.__HP_CAMARA_API__.resume = resume;

  // Auto-start / auto-resume
  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    scheduleNext(200, "auto-resume");
  } else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    st.beforeClickToken = null;
    st._settledAfterClick = false;
    saveState(st);
    scheduleNext(250, "auto-start");
  } else {
    warn("Runner carregou, mas sem codes e sem estado salvo.");
  }

  log("🛡️ Runner v3 (cadenciado) ativo", {
    total: (getCodes() || []).length,
    cadenceMs: CADENCE_MS,
    postClickSettleMs: POST_CLICK_SETTLE_MS
  });
})();
