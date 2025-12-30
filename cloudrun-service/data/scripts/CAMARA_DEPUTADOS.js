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
  // ✅ Se já existe instância na página, reinjetar vira "continuar"
  if (window.__HP_CAMARA_API__?.resume) {
    try { window.__HP_CAMARA_API__.resume("reinjected"); } catch {}
    return;
  }

  // API pública pra reinjeção virar "resume"
  window.__HP_CAMARA_API__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // Compat: remove IDs do GEAP se existirem
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

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

  async function ghostType(el, text, charDelay = 40) {
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

  function pageHasRegistroNaoEncontrado() {
    const t = (document.body?.innerText || "").toLowerCase();
    return t.includes("registro não encontrado") || t.includes("verifique mensagens nos campos");
  }

  // ===== Persistência =====
  const STORE_KEY = "hp_runner_state_camara_v3";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = [];

  function getCodes() {
    if (codesFromPopup.length) return codesFromPopup;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
    return defaultCodes;
  }

  async function runLoop() {
    const st = loadState() || { idx: 0, running: false, phase: "idle", lastCode: null, codes: null };
    const codes = st.codes || getCodes();

    if (!codes.length) {
      warn("Nenhum código carregado.");
      return;
    }

    // garante persistência da lista
    st.codes = codes;

    // ✅ voltou de postback? avança 1
    if (st.phase === "clicked" && st.lastCode) {
      if (pageHasRegistroNaoEncontrado()) {
        warn("⚠️ Registro não encontrado para:", st.lastCode, "→ próximo.");
      } else {
        log("✅ Postback OK para:", st.lastCode, "→ próximo.");
      }
      st.idx = (st.idx ?? 0) + 1;
      st.phase = "idle";
      st.lastCode = null;
      saveState(st);
    }

    // terminou?
    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // âncoras
    const evento = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    const btn = await waitForElement("a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']", { timeoutMs: 60000 });

    if (!evento) { err("Campo EVENTO não encontrado."); return; }
    if (!btn)    { err("Botão Salvar / Novo não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) Digitando:`, code);

    await ghostType(evento, code, 40);

    // ✅ sempre clicar (mesmo se for "registro não encontrado")
    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    saveState(st);

    log("🖱️ Clicando Salvar / Novo…");
    btn.click(); // aqui pode dar postback e matar o JS — por isso salvamos antes
  }

  // ✅ Resume seguro (anti concorrência)
  let inFlight = false;
  window.__HP_CAMARA_API__.resume = async (reason = "resume") => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runLoop();
    } catch (e) {
      err("resume erro:", e);
    } finally {
      inFlight = false;
    }
  };

  // =========================
  // ✅ AUTO-START / AUTO-RESUME
  // =========================
  const st0 = loadState();

  // 1) se já estava rodando, retoma
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => { window.__HP_CAMARA_API__.resume("auto-resume"); }, 50);
  }
  // 2) se veio payload.codes, inicia sozinho
  else if (codesFromPopup.length) {
    const st = st0 || {};
    st.codes = codesFromPopup;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    saveState(st);

    setTimeout(() => { window.__HP_CAMARA_API__.resume("auto-start"); }, 80);
  } else {
    warn("Sem codes no payload e sem estado salvo. (Não iniciou)");
  }

  log("✅ Runner carregado.", { codes: codesFromPopup.length, planId: payload.planId, kitKey: payload.kitKey });
})();
