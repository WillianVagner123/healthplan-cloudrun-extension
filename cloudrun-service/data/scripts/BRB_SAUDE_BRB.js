/*@maskara{
  "mustUrlIncludes": ["facilinformatica", "GuiasTISS", "tiss", "portal", "solusweb", "prestador"],
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
   - Fluxo: Inserir -> digitar código (visível/“stick”) -> delay/autocomplete -> selecionar 1º -> Confirmar -> loop
   - Usa window.__HP_PAYLOAD__ (do popup): { codes, kitKey, planId }
   - Resume: salva índice no localStorage
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TISS_PROCS";

  // ============== PAGE FILTER ==============
  const MUST_HAVE = ["#guiaProcedimentos", "#incluirProcedimento", "#tableProcedimentos"];
  const HAS_TARGET = MUST_HAVE.some((s) => {
    try { return !!document.querySelector(s); } catch { return false; }
  });
  if (!HAS_TARGET) return;

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

  async function waitForVisible(selector, timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) return el;
      await delay(120);
    }
    return null;
  }

  // ============== DIGITAÇÃO “VISÍVEL” + GARANTIA (STICK) ==============
  function getVal(el) {
    try { return String(el.value ?? ""); } catch { return ""; }
  }

  function setVal(el, v) {
    try { el.value = v; } catch {}
    try { fire(el, "input"); } catch {}
    try { fire(el, "change"); } catch {}
  }

  // tenta escrever e garantir que o valor NÃO some
  async function typeAndStick(el, text, {
    charDelay = 35,
    preClear = true,
    settleMs = 220,
    retries = 3
  } = {}) {
    const target = String(text);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        el.focus();
        await delay(80);

        // limpar leve (alguns portais não gostam de value="")
        if (preClear) {
          // Ctrl+A + Backspace (mais “humano”)
          fireKey(el, "keydown", "Control"); // best-effort
          fireKey(el, "keydown", "a");
          fireKey(el, "keyup", "a");
          fireKey(el, "keyup", "Control");
          await delay(40);
          fireKey(el, "keydown", "Backspace");
          fireKey(el, "keyup", "Backspace");
          await delay(80);
          setVal(el, ""); // fallback
        }

        // digita devagar para aparecer
        let cur = "";
        for (const ch of target) {
          cur += ch;
          setVal(el, cur);
          fireKey(el, "keydown", ch);
          fireKey(el, "keyup", ch);
          await delay(charDelay);
        }

        await delay(settleMs);

        // Se o portal “zerou” o campo, tenta de novo
        const got = getVal(el).trim();
        if (got === target) return true;

        warn("⌛ Campo não segurou o valor (tentativa " + attempt + "/" + retries + ")", { got, want: target });

        // alguns autocompletes re-renderizam o input: refaz query do elemento
        // (o caller pode repassar o elemento, mas aqui tentamos manter foco e reescrever)
        await delay(250);
      } catch (e) {
        warn("⚠️ typeAndStick erro (tentativa " + attempt + ")", e);
        await delay(250);
      }
    }

    // último fallback: set direto e segue
    try { setVal(el, target); } catch {}
    await delay(150);
    return getVal(el).trim() === target;
  }

  // ⬇️ seleciona o 1º sugerido (autocomplete)
  async function pickFirstSuggestion(inputEl) {
    try {
      inputEl.focus();
      await delay(120);
      fireKey(inputEl, "keydown", "ArrowDown");
      fireKey(inputEl, "keyup", "ArrowDown");
      await delay(120);
      fireKey(inputEl, "keydown", "Enter");
      fireKey(inputEl, "keyup", "Enter");
      await delay(140);
      return true;
    } catch {}
    return false;
  }

  // ⏳ espera o autocomplete "carregar"
  async function waitAutocomplete(inputEl, minMs = 800, maxMs = 6000) {
    const start = Date.now();
    await delay(minMs);

    while (Date.now() - start < maxMs) {
      const candidates = [
        ".ui-autocomplete",
        ".ui-menu",
        "ul[role='listbox']",
        ".p-autocomplete-panel",
        ".p-dropdown-panel",
        ".autocomplete-items",
      ];

      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return true;
      }

      try {
        const expanded = inputEl.getAttribute("aria-expanded");
        if (expanded === "true") return true;
      } catch {}

      await delay(140);
    }
    return false;
  }

  // ============== SELECTORS DO PORTAL ==============
  const SEL = {
    btnInserir: "#incluirProcedimento",
    btnConfirmar: "#confirmarEdicaoDeProcedimento",
    inputCodigo: [
      "#registroProcedimentoCodigo > input",
      "#registroProcedimentoCodigo input",
      "td#registroProcedimentoCodigo input",
      "input[id*='ProcedimentoCodigo']",
      "input[name*='ProcedimentoCodigo']",
      "input[id*='procedimento'][id*='codigo']",
      "input[name*='procedimento'][name*='codigo']"
    ].join(","),
    totalRegistros: "#totalRegistros",
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
    return await waitForVisible(SEL.inputCodigo, 45000);
  }

  async function clickConfirmar() {
    const btn = await waitForVisible(SEL.btnConfirmar, 45000);
    if (!btn) return false;
    return clickSafe(btn);
  }

  // ============== RESUME / STATE ==============
  const STORE_KEY = "tiss_procs_state_v2";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

  // ============== CÓDIGOS ==============
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = [];

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia de códigos.");
      return { ok: false, msg: "Lista vazia" };
    }

    const st0 = loadState();
    let startAt = 0;
    const kitKey = payload.kitKey || "manual";

    if (st0 && st0.kitKey === kitKey && st0.total === list.length && typeof st0.nextIndex === "number") {
      startAt = Math.max(0, Math.min(list.length, st0.nextIndex));
      log("↩️ Retomando do índice", startAt, "de", list.length);
    } else {
      saveState({ kitKey, total: list.length, nextIndex: 0, startedAt: Date.now() });
    }

    log("▶️ Inserção iniciada", { total: list.length, startAt, kit: kitKey });

    for (let i = startAt; i < list.length; i++) {
      const code = String(list[i]).trim();
      const before = getTotalRegistros();

      saveState({ kitKey, total: list.length, nextIndex: i, lastCode: code, startedAt: st0?.startedAt || Date.now() });
      log(`▶️ (${i + 1}/${list.length})`, code);

      // 1) Inserir -> input
      let input = await clickInserirAndWaitInput();
      if (!input) {
        err("❌ Não apareceu o campo do código após clicar Inserir.");
        return { ok: false, msg: "Campo do código não apareceu" };
      }

      // 2) Digitar “visível” e garantir que fica
      const okType = await typeAndStick(input, code, { charDelay: 45, settleMs: 260, retries: 3 });
      if (!okType) warn("⚠️ Não consegui garantir o valor, seguindo mesmo assim…");

      // (se o portal recriou o input, reaponta)
      input = document.querySelector(SEL.inputCodigo) || input;

      // 3) esperar autocomplete
      await waitAutocomplete(input, 900, 7000);

      // 4) selecionar 1º sugerido
      await pickFirstSuggestion(input);

      // 5) confirmar
      let ok = await clickConfirmar();
      if (!ok) {
        warn("⚠️ Confirmar não clicou/visível. Tentando de novo…");
        await delay(850);
        ok = await clickConfirmar();
      }
      if (!ok) {
        err("❌ Confirmar não ficou disponível.");
        return { ok: false, msg: "Confirmar não disponível" };
      }

      // 6) aguardar gravar
      const tStart = Date.now();
      while (Date.now() - tStart < 30000) {
        const now = getTotalRegistros();
        const stillInputVisible = (() => {
          const el = document.querySelector(SEL.inputCodigo);
          return el && isVisible(el);
        })();

        if (before != null && now != null && now !== before) break;
        if (!stillInputVisible) break;

        await delay(160);
      }

      saveState({ kitKey, total: list.length, nextIndex: i + 1, lastCode: code, startedAt: st0?.startedAt || Date.now() });

      log("✅ OK", code);
      await delay(550);
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
    const h = document.createElement("div");
    h.id = "hpRunnerFloatingHint";
    h.textContent = "Abra a aba Procedimentos e clique no botão.";
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
