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
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // mesmos IDs do GEAP
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

  function findEventoField() {
    return document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
  }

  function findBtnSalvarNovo() {
    return (
      document.querySelector("a[title^='Salvar / Novo']") ||
      document.querySelector("a[title*='Salvar / Novo']") ||
      document.querySelector("a[accesskey='N']") ||
      null
    );
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
  const defaultCodes = []; // opcional hardcode

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

    // salva codes (para sobreviver ao reload)
    st.codes = codes;

    // ✅ Só avança se a gente tinha clicado antes (phase === clicked)
    // e portanto voltamos de um postback.
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

    // ✅ IMPORTANTE: MESMO SE JÁ APARECE "Registro não encontrado", AINDA ASSIM CLICA
    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    saveState(st);

    log("🖱️ Clicando Salvar / Novo…");
    btn.click();

    // depois daqui pode recarregar e “matar” o JS — por isso salvamos antes.
  }

  // UI
  const btnUI = (B?.makeFloatingButton)
    ? B.makeFloatingButton({
        id: "hpRunnerFloatingBtn",
        text: "⚡ Inserir Procedimentos",
        onClick: async () => {
          const codes = getCodes();
          if (!codes.length) { hint.textContent = "Nenhum código carregado. Rode pelo popup."; return; }
          const st = loadState() || {};
          st.codes = codes;
          st.running = true;
          if (typeof st.idx !== "number") st.idx = 0;
          if (!st.phase) st.phase = "idle";
          saveState(st);
          hint.textContent = `Executando ${codes.length}…`;
          await runLoop();
        }
      })
    : (() => {
        const b = document.createElement("button");
        b.id = "hpRunnerFloatingBtn";
        b.textContent = "⚡ Inserir Procedimentos";
        b.style.cssText = `
          position: fixed; right: 16px; bottom: 16px;
          z-index: 2147483647; padding: 12px 14px;
          border-radius: 14px; border: none;
          background: #0d6efd; color: #fff;
          font-weight: 800; cursor: pointer;
          box-shadow: 0 10px 24px rgba(0,0,0,.25);
        `;
        document.body.appendChild(b);
        return b;
      })();

  const hint = (B?.makeFloatingHint)
    ? B.makeFloatingHint({ id: "hpRunnerFloatingHint", text: "Clique para iniciar." })
    : (() => {
        const h = document.createElement("div");
        h.id = "hpRunnerFloatingHint";
        h.textContent = "Clique para iniciar.";
        h.style.cssText = `
          position: fixed; right: 16px; bottom: 62px;
          z-index: 2147483647; padding: 8px 10px;
          border-radius: 12px;
          background: rgba(0,0,0,.65);
          color: rgba(255,255,255,.92);
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
        `;
        document.body.appendChild(h);
        return h;
      })();

  if (!B?.makeFloatingButton) {
    btnUI.onclick = async () => {
      const codes = getCodes();
      if (!codes.length) { hint.textContent = "Nenhum código carregado. Rode pelo popup."; return; }
      const st = loadState() || {};
      st.codes = codes;
      st.running = true;
      if (typeof st.idx !== "number") st.idx = 0;
      if (!st.phase) st.phase = "idle";
      saveState(st);
      hint.textContent = `Executando ${codes.length}…`;
      await runLoop();
    };
  }

  // Auto-resume (só funciona se o runner for reinjetado pela extensão após reload)
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    hint.textContent = `Retomando… (${(st0.idx ?? 0) + 1}/${st0.codes.length})`;
    setTimeout(() => { runLoop().catch((e) => err("runLoop erro:", e)); }, 50);
  }

  log("✅ Runner carregado.", { codes: codesFromPopup.length, planId: payload.planId, kitKey: payload.kitKey });
})();
