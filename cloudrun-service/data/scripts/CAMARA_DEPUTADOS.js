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

/* CAMARA_DEPUTADOS.js — Runner do plano (IIFE) ✅
   - MESMA ESTRUTURA do GEAP + MESMOS IDs globais
   - Sempre clica em "Salvar / Novo"
   - Se voltar com "Registro não encontrado", segue para o próximo
   - Persiste estado no sessionStorage para sobreviver ao refresh/postback
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // Mantém os MESMOS IDs do GEAP
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  function isVisible(el) {
    if (B?.isVisible) return B.isVisible(el);
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

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

  // Detecta o erro que aparece depois do postback
  function pageHasRegistroNaoEncontrado() {
    const t = (document.body?.innerText || "").toLowerCase();
    return t.includes("registro não encontrado") || t.includes("verifique mensagens nos campos");
  }

  // ===== Persistência de estado =====
  const STORE_KEY = "hp_runner_state_camara_v2";
  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function saveState(state) {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function clearState() {
    sessionStorage.removeItem(STORE_KEY);
  }

  // Codes vêm do popup (ideal)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = [
    // Se quiser hardcode como fallback, cole aqui.
  ];

  function getCodes() {
    // 1) popup
    if (codesFromPopup.length) return codesFromPopup;

    // 2) state salvo (após refresh)
    const st = loadState();
    if (st?.codes?.length) return st.codes;

    // 3) fallback local
    return defaultCodes;
  }

  // ===== Motor com "resume" =====
  async function runLoop() {
    const st = loadState() || {
      idx: 0,
      running: false,
      // fase: "idle" | "clicked"
      phase: "idle",
      lastCode: null,
      codes: null,
      startedAt: new Date().toISOString(),
    };

    const codes = st.codes || getCodes();
    if (!Array.isArray(codes) || !codes.length) {
      warn("Nenhum código carregado.");
      return;
    }

    // salva codes no state pra sobreviver postback
    st.codes = codes;

    // Se voltamos de um postback, podemos estar em phase="clicked"
    // Se nessa volta tem "Registro não encontrado", apenas avança o índice.
    if (st.phase === "clicked") {
      if (pageHasRegistroNaoEncontrado()) {
        warn("⚠️ Registro não encontrado para:", st.lastCode, "→ avançando para o próximo.");
        st.idx = (st.idx ?? 0) + 1;
      }
      // em qualquer caso, voltamos para idle e continuamos
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

    // garante âncoras
    const evento = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    const btnSalvarNovo = await waitForElement(
      "a[title^='Salvar / Novo'], a[title*='Salvar / Novo'], a[accesskey='N']",
      { timeoutMs: 60000 }
    );

    if (!evento || !isVisible(evento)) {
      err("❌ Campo EVENTO não encontrado/visível.");
      return;
    }
    if (!btnSalvarNovo) {
      err("❌ Botão Salvar / Novo não encontrado.");
      return;
    }

    // roda uma iteração por vez (pq depois do click a página pode recarregar)
    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) Inserindo:`, code);

    await ghostType(evento, code, 40);

    // ANTES de clicar: já salva estado como "clicked" (sobrevive refresh)
    st.running = true;
    st.phase = "clicked";
    st.lastCode = code;
    saveState(st);

    // clique que provoca form_dopost + refresh/postback
    btnSalvarNovo.click();

    // Se NÃO recarregar por algum motivo, damos um tempinho e checamos:
    await delay(2000);

    // Se continuou na mesma página e já apareceu erro, avança manualmente
    // (isso cobre caso o sistema mostre erro sem refresh real)
    if (pageHasRegistroNaoEncontrado()) {
      warn("⚠️ Erro apareceu sem matar a página → avançando sem travar.");
      const st2 = loadState() || st;
      st2.idx = (st2.idx ?? st.idx) + 1;
      st2.phase = "idle";
      st2.lastCode = null;
      saveState(st2);
      // continua o loop
      await delay(300);
      return runLoop();
    }

    // Caso tenha recarregado, o script será reinjetado e continuará sozinho via auto-resume
  }

  // ===== UI botão flutuante (mesmos IDs do GEAP) =====
  const btn = (B?.makeFloatingButton)
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
        b.type = "button";
        b.textContent = "⚡ Inserir Procedimentos";
        b.style.cssText = `
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483647;
          padding: 12px 14px;
          border-radius: 14px;
          border: none;
          background: #0d6efd;
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 24px rgba(0,0,0,.25);
          user-select: none;
        `;
        document.body.appendChild(b);
        return b;
      })();

  const hint = (B?.makeFloatingHint)
    ? B.makeFloatingHint({
        id: "hpRunnerFloatingHint",
        text: "Clique para iniciar. O postback não vai parar o runner.",
      })
    : (() => {
        const h = document.createElement("div");
        h.id = "hpRunnerFloatingHint";
        h.textContent = "Clique para iniciar. O postback não vai parar o runner.";
        h.style.cssText = `
          position: fixed;
          right: 16px;
          bottom: 62px;
          z-index: 2147483647;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(0,0,0,.65);
          color: rgba(255,255,255,.92);
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
          box-shadow: 0 10px 24px rgba(0,0,0,.20);
        `;
        document.body.appendChild(h);
        return h;
      })();

  if (!B?.makeFloatingButton) {
    btn.onclick = async () => {
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

  // ===== Auto-resume: se já estava rodando, continua sozinho após refresh =====
  const st0 = loadState();
  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    hint.textContent = `Retomando… (${(st0.idx ?? 0) + 1}/${st0.codes.length})`;
    // não bloqueia a UI
    setTimeout(() => { runLoop().catch((e) => err("runLoop erro:", e)); }, 50);
  }

  log("✅ Runner carregado. Payload:", { planId: payload.planId, kitKey: payload.kitKey, codes: codesFromPopup.length });
})();
