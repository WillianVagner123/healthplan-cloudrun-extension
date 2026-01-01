/*@maskara{
  "mustUrlIncludes": ["solusweb", "prestador", "tiss", "portal"],
  "detectAny": [
    "#guiaProcedimentos",
    "#incluirProcedimento",
    "#confirmarEdicaoDeProcedimento",
    "#tableProcedimentos",
    "#registroProcedimentos"
  ],
  "actions": { "focus": "#incluirProcedimento" }
}*/

/* TISS_PROCS.js — Runner Inserção Procedimentos (IIFE) ✅
   - Usa window.__HP_PAYLOAD__ (do popup): { codes, kitKey, planId }
   - Botão flutuante: "⚡ Inserir Procedimentos"
   - Fluxo: Inserir -> digitar código -> selecionar 1º sugerido -> Confirmar -> loop
   - Resume: salva índice no localStorage
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TISS_PROCS";

  // ============== FRAME / PAGE FILTER ==============
  const MUST_HAVE = ["#guiaProcedimentos", "#incluirProcedimento", "#tableProcedimentos"];
  const HAS_TARGET = MUST_HAVE.some((s) => { try { return !!document.querySelector(s); } catch { return false; } });
  if (!HAS_TARGET) return;

  // base helpers (se existir)
  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // remove UI antigo
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function fireKey(el, type, key) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  function clickSafe(el) {
    if (!el) return false;
    try { el.click(); return true; } catch {}
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {}
    return false;
  }

  function waitForElement(selector, { timeoutMs = 45000, root = document } = {}) {
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

  async function waitForVisible(selector, timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
      await delay(120);
    }
    return null;
  }

  async function ghostType(el, text, charDelay = 12) {
    el.focus();
    // limpa (compatível com inputs mascarados)
    try {
      el.value = "";
      fire(el, "input");
      fire(el, "change");
    } catch {}

    for (const ch of String(text)) {
      el.value = (el.value || "") + ch;
      fire(el, "input");
      fireKey(el, "keydown", ch);
      fireKey(el, "keyup", ch);
      await delay(charDelay);
    }
    fire(el, "change");
  }

  // tenta “pegar o 1º sugerido” (autocomplete)
  async function pickFirstSuggestion(inputEl) {
    // padrão: seta pra baixo + enter
    try {
      inputEl.focus();
      await delay(120);
      fireKey(inputEl, "keydown", "ArrowDown");
      fireKey(inputEl, "keyup", "ArrowDown");
      await delay(120);
      fireKey(inputEl, "keydown", "Enter");
      fireKey(inputEl, "keyup", "Enter");
      await delay(120);
      return true;
    } catch {}
    return false;
  }

  // ============== SELECTORS DO PORTAL ==============
  const SEL = {
    btnInserir: "#incluirProcedimento",
    btnConfirmar: "#confirmarEdicaoDeProcedimento",
    // o input “nasce” dentro do TD (seu exemplo: #registroProcedimentoCodigo > input)
    // deixei com fallbacks pra quando o portal trocar o markup:
    inputCodigo: [
      "#registroProcedimentoCodigo > input",
      "#registroProcedimentoCodigo input",
      "td#registroProcedimentoCodigo input",
      "input[id*='ProcedimentoCodigo']",
      "input[name*='ProcedimentoCodigo']",
      "input[id*='procedimento'][id*='codigo']",
      "input[name*='procedimento'][name*='codigo']"
    ].join(","),
    // contador (pra confirmar que gravou)
    totalRegistros: "#totalRegistros"
  };

  function getTotalRegistros() {
    const el = document.querySelector(SEL.totalRegistros);
    if (!el) return null;
    const n = parseInt(String(el.textContent || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  async function clickInserirAndWaitInput() {
    const btn = document.querySelector(SEL.btnInserir);
    if (!btn) return null;

    clickSafe(btn);

    // espera o campo existir e ficar visível
    const input = await waitForVisible(SEL.inputCodigo, 45000);
    return input;
  }

  async function clickConfirmar() {
    // o botão pode ficar display:none até entrar em modo edição/inserção
    const btn = await waitForVisible(SEL.btnConfirmar, 45000);
    if (!btn) return false;
    clickSafe(btn);
    return true;
  }

  // ============== RESUME / STATE ==============
  const STORE_KEY = "tiss_procs_state_v1";
  const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; }
  };
  const saveState = (st) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {}
  };
  const clearState = () => {
    try { localStorage.removeItem(STORE_KEY); } catch {}
  };

  // ============== CÓDIGOS ==============
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = []; // se quiser deixar fixo, põe aqui

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia de códigos.");
      return { ok: false, msg: "Lista vazia" };
    }

    const st0 = loadState();
    let startAt = 0;

    // se for o mesmo kit e mesma lista, retoma
    if (st0 && st0.kitKey === payload.kitKey && st0.total === list.length && typeof st0.nextIndex === "number") {
      startAt = Math.max(0, Math.min(list.length, st0.nextIndex));
      log("↩️ Retomando do índice", startAt, "de", list.length);
    } else {
      saveState({ kitKey: payload.kitKey || "manual", total: list.length, nextIndex: 0, startedAt: Date.now() });
    }

    log("▶️ Inserção iniciada", { total: list.length, startAt, kit: payload.kitKey });

    for (let i = startAt; i < list.length; i++) {
      const code = list[i];
      const before = getTotalRegistros();

      saveState({ kitKey: payload.kitKey || "manual", total: list.length, nextIndex: i, lastCode: code, startedAt: st0?.startedAt || Date.now() });

      log(`▶️ (${i + 1}/${list.length})`, code);

      // 1) Inserir -> esperar input
      const input = await clickInserirAndWaitInput();
      if (!input) {
        err("❌ Não apareceu o campo do código após clicar Inserir.");
        return { ok: false, msg: "Campo do código não apareceu" };
      }

      // 2) digitar código
      await ghostType(input, code, 10);

      // 3) selecionar primeiro sugerido
      await delay(220);
      await pickFirstSuggestion(input);

      // 4) confirmar
      const ok = await clickConfirmar();
      if (!ok) {
        warn("⚠️ Não consegui clicar Confirmar (talvez não ficou visível). Tentando 2ª vez…");
        await delay(600);
        const ok2 = await clickConfirmar();
        if (!ok2) {
          err("❌ Confirmar não ficou disponível.");
          return { ok: false, msg: "Confirmar não disponível" };
        }
      }

      // 5) aguarda “gravar”: totalRegistros mudar OU input sumir/ficar invisível
      const tStart = Date.now();
      while (Date.now() - tStart < 20000) {
        const now = getTotalRegistros();
        const stillInputVisible = (() => {
          const el = document.querySelector(SEL.inputCodigo);
          return el && isVisible(el);
        })();

        // Se o contador mudou, ótimo
        if (before != null && now != null && now !== before) break;

        // Ou se saiu do modo edição (input some), também vale
        if (!stillInputVisible) break;

        await delay(150);
      }

      saveState({ kitKey: payload.kitKey || "manual", total: list.length, nextIndex: i + 1, lastCode: code, startedAt: st0?.startedAt || Date.now() });

      log("✅ OK", code);
      await delay(450);
    }

    clearState();
    log("🎉 Finalizado!");
    return { ok: true, msg: "Finalizado" };
  }

  // ============== UI BOTÃO FLUTUANTE ==============
  const btn = (() => {
    if (B?.makeFloatingButton) {
      return B.makeFloatingButton({
        id: "hpRunnerFloatingBtn",
        text: "⚡ Inserir Procedimentos",
        onClick: async () => {
          const list = codesFromPopup.length ? codesFromPopup : defaultCodes;
          if (!list.length) return;
          await runInsercao(list);
        }
      });
    }

    const b = document.createElement("button");
    b.id = "hpRunnerFloatingBtn";
    b.type = "button";
    b.textContent = "⚡ Inserir Procedimentos";
    b.style.cssText = `
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      padding: 12px 14px; border-radius: 14px; border: none;
      background: #0d6efd; color: #fff; font-weight: 800; cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,.25); user-select: none;
    `;
    document.body.appendChild(b);
    return b;
  })();

  const hint = (() => {
    if (B?.makeFloatingHint) {
      return B.makeFloatingHint({
        id: "hpRunnerFloatingHint",
        text: "Abra a aba Procedimentos e clique em Inserir Procedimentos.",
      });
    }

    const h = document.createElement("div");
    h.id = "hpRunnerFloatingHint";
    h.textContent = "Abra a aba Procedimentos e clique em Inserir Procedimentos.";
    h.style.cssText = `
      position: fixed; right: 16px; bottom: 62px; z-index: 2147483647;
      padding: 8px 10px; border-radius: 12px;
      background: rgba(0,0,0,.65); color: rgba(255,255,255,.92);
      font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
      box-shadow: 0 10px 24px rgba(0,0,0,.20);
    `;
    document.body.appendChild(h);
    return h;
  })();

  if (!B?.makeFloatingButton) {
    btn.onclick = async () => {
      const list = codesFromPopup.length ? codesFromPopup : defaultCodes;
      if (!list.length) {
        hint.textContent = "Nenhum código carregado. Rode pelo popup.";
        return;
      }
      hint.textContent = `Executando ${list.length}…`;
      const r = await runInsercao(list);
      hint.textContent = r?.ok ? "Finalizado ✅" : "Falhou ❌ (veja o console)";
    };
  }

  log("✅ Runner carregado.", {
    href: location.href,
    planId: payload.planId,
    kitKey: payload.kitKey,
    codes: codesFromPopup.length
  });
})();
