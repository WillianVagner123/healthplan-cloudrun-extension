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

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TISS_PROCS";

  const MUST_HAVE = ["#guiaProcedimentos", "#incluirProcedimento", "#tableProcedimentos"];
  const HAS_TARGET = MUST_HAVE.some((s) => { try { return !!document.querySelector(s); } catch { return false; } });
  if (!HAS_TARGET) return;

  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  function fireKey(el, type, key, extra = {}) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key, ...extra }));
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

  // ============== DIGITAÇÃO “ANTIGA” (NÚMERO POR NÚMERO) ==============
  // Não usa el.value = "..." (isso o site rejeita).
  // Digita dígito por dígito como humano. Se o site usar mask/plugin, isso costuma “pegar”.
  async function typeDigitsLikeHuman(el, text, {
    keyDelay = 70,
    afterEachMs = 0,
    retries = 3
  } = {}) {
    const target = String(text);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        el.focus();
        await delay(60);

        // campo vem vazio — não limpa
        for (let i = 0; i < target.length; i++) {
          const ch = target[i];

          // keydown/keypress
          fireKey(el, "keydown", ch);
          fireKey(el, "keypress", ch);

          // tenta “inserir” de forma compatível: execCommand quando disponível (simula digitação)
          let inserted = false;
          try {
            // alguns navegadores ainda aceitam
            inserted = document.execCommand && document.execCommand("insertText", false, ch);
          } catch {}

          if (!inserted) {
            // fallback: se o site atualizar via evento, ao menos disparamos input
            // (não setamos o value inteiro, só deixamos o browser completar se possível)
            try {
              // em inputs normais, o execCommand já resolve; aqui só garante eventos
              // alguns componentes leem "beforeinput"
              el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, data: ch, inputType: "insertText" }));
            } catch {}
          }

          // input event (muitos plugins escutam isso)
          try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" })); }
          catch { fire(el, "input"); }

          // keyup
          fireKey(el, "keyup", ch);

          if (afterEachMs) await delay(afterEachMs);
          await delay(keyDelay);
        }

        await delay(200);

        const got = String(el.value || "").trim();
        if (got === target) return true;

        warn(`⌛ Campo não segurou o valor (tentativa ${attempt}/${retries})`, { got, want: target });

        // se não segurou, tenta novamente (sem limpar agressivo)
        await delay(300);
      } catch (e) {
        warn(`⚠️ typeDigitsLikeHuman erro (tentativa ${attempt}/${retries})`, e);
        await delay(300);
      }
    }

    return String(el.value || "").trim() === String(text);
  }

  // ⏳ espera autocomplete (igual antes)
  async function waitAutocomplete(inputEl, minMs = 900, maxMs = 7000) {
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

  async function pickFirstSuggestion(inputEl) {
    try {
      inputEl.focus();
      await delay(120);
      fireKey(inputEl, "keydown", "ArrowDown");
      fireKey(inputEl, "keyup", "ArrowDown");
      await delay(120);
      fireKey(inputEl, "keydown", "Enter");
      fireKey(inputEl, "keyup", "Enter");
      await delay(160);
      return true;
    } catch {}
    return false;
  }

  // ============== SELECTORS ==============
  const SEL = {
    btnInserir: "#incluirProcedimento",
    btnConfirmar: "#confirmarEdicaoDeProcedimento",
    inputCodigo: [
      "#registroProcedimentoCodigo > input",
      "#registroProcedimentoCodigo input",
      "td#registroProcedimentoCodigo input"
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

  // ============== RESUME ==============
  const STORE_KEY = "tiss_procs_state_v3";
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(STORE_KEY); } catch {} };

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
      const input = await clickInserirAndWaitInput();
      if (!input) {
        err("❌ Não apareceu o campo do código após clicar Inserir.");
        return { ok: false, msg: "Campo do código não apareceu" };
      }

      // 2) Digitar “igual antigo” (número por número)
      const okType = await typeDigitsLikeHuman(input, code, { keyDelay: 85, retries: 3 });
      if (!okType) {
        warn("⚠️ Ainda não segurou. Seguindo mesmo assim…", { got: String(input.value || "").trim(), want: code });
      }

      // 3) esperar autocomplete
      await waitAutocomplete(input, 1000, 8000);

      // 4) selecionar 1º sugerido
      await pickFirstSuggestion(input);

      // 5) confirmar
      let ok = await clickConfirmar();
      if (!ok) {
        warn("⚠️ Confirmar não clicou/visível. Tentando de novo…");
        await delay(900);
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

        await delay(170);
      }

      saveState({ kitKey, total: list.length, nextIndex: i + 1, lastCode: code, startedAt: st0?.startedAt || Date.now() });

      log("✅ OK", code);
      await delay(600);
    }

    clearState();
    log("🎉 Finalizado!");
    return { ok: true, msg: "Finalizado" };
  }

  // ============== UI ==============
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

  log("✅ Runner carregado.", { href: location.href, planId: payload.planId, kitKey: payload.kitKey, codes: codesFromPopup.length });
})();
