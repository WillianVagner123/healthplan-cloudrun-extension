/*@maskara{
  "mustUrlIncludes": ["facilinformatica", "GuiasTISS", "tiss", "evida"],
  "detectAny": [
    "#guiaProcedimentos",
    "#incluirProcedimento",
    "#confirmarEdicaoDeProcedimento",
    "#registroProcedimentos",
    "ul.ui-autocomplete"
  ],
  "actions": { "focus": "#incluirProcedimento" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TISS_PROCS";

  const MUST_HAVE = ["#guiaProcedimentos", "#incluirProcedimento"];
  if (!MUST_HAVE.some(s => document.querySelector(s))) return;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  // Remove botões antigos
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  function isVisibleCss(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function keyInfo(ch) {
    const code = ch.charCodeAt(0);
    return { key: ch, keyCode: code, which: code, charCode: code };
  }

  function fireKey(el, type, ch) {
    const info = keyInfo(ch);
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...info }));
  }

  function fireSpecial(el, type, key, keyCode, which) {
    el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key,
      keyCode,
      which
    }));
  }

  function clickSafe(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  async function waitForVisible(sel, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(sel);
      if (el && isVisibleCss(el)) return el;
      await delay(120);
    }
    return null;
  }

  // ===== Digitação “número por número” (sem setar value inteiro) =====
  async function typeDigits(el, text, keyDelay = 90) {
    el.focus();
    await delay(80);

    for (const ch of String(text)) {
      fireKey(el, "keydown", ch);
      fireKey(el, "keypress", ch);

      // Inserção real (quando permitido)
      let inserted = false;
      try { inserted = document.execCommand && document.execCommand("insertText", false, ch); } catch {}

      // Garante eventos que jQuery UI costuma ouvir
      try {
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: ch, inputType: "insertText" }));
      } catch {}
      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
      } catch {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      fireKey(el, "keyup", ch);

      // se execCommand não inseriu (alguns browsers bloqueiam), não forçamos value aqui
      // porque seu portal é sensível; seguimos só com eventos e tempo
      await delay(keyDelay);
    }
    return true;
  }

  // ===== jQuery UI Autocomplete: esperar VISÍVEL =====
  function getActiveAutocompleteUL() {
    // O jQuery UI cria vários; geralmente o “ativo” tem z-index maior / está próximo do input
    const uls = Array.from(document.querySelectorAll("ul.ui-autocomplete"));
    if (!uls.length) return null;

    // prioriza o que tem itens
    const withItems = uls.filter(ul => ul.querySelector("li.ui-menu-item"));
    const pool = withItems.length ? withItems : uls;

    // pega o de maior z-index (costuma ser o aberto)
    let best = pool[0];
    let bestZ = -1;
    for (const ul of pool) {
      const z = parseInt(getComputedStyle(ul).zIndex || "0", 10);
      if (z >= bestZ) { bestZ = z; best = ul; }
    }
    return best;
  }

  async function waitJQAutocompleteVisible(timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ul = getActiveAutocompleteUL();
      if (ul && ul.querySelector("li.ui-menu-item")) {
        // aqui é o pulo do gato: não basta existir, precisa ficar visível (display != none)
        if (isVisibleCss(ul)) return ul;
      }
      await delay(120);
    }
    return null;
  }

  function clickFirstAutocompleteItem(ul) {
    if (!ul) return false;
    const item =
      ul.querySelector("li.ui-menu-item .ui-menu-item-wrapper") ||
      ul.querySelector("li.ui-menu-item a") ||
      ul.querySelector("li.ui-menu-item div") ||
      ul.querySelector("li.ui-menu-item");
    if (!item) return false;

    // jQuery UI seleciona no mousedown
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  // “empurrão” para abrir menu se ele montou e ficou escondido
  async function nudgeOpenAutocomplete(input) {
    try {
      input.focus();
      await delay(80);
      // ArrowDown (keyCode 40)
      fireSpecial(input, "keydown", "ArrowDown", 40, 40);
      fireSpecial(input, "keyup", "ArrowDown", 40, 40);
      await delay(120);
    } catch {}
  }

  // ===== Selectors =====
  const SEL = {
    inserir: "#incluirProcedimento",
    confirmar: "#confirmarEdicaoDeProcedimento",
    inputCodigo: "#registroProcedimentoCodigo input.procedimentoColumnProcedimento, #registroProcedimentoCodigo input.ui-autocomplete-input",
    total: "#totalRegistros"
  };

  function getTotal() {
    const el = document.querySelector(SEL.total);
    return el ? Number(String(el.textContent || "").trim()) : null;
  }

  // ===== Resume =====
  const STORE = "tiss_procs_resume_v2";
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; } };
  const save = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} };
  const clear = () => { try { localStorage.removeItem(STORE); } catch {} };

  // ===== Runner =====
  async function run(codes) {
    if (!codes || !codes.length) return;

    const st = load();
    let start = st?.next || 0;

    for (let i = start; i < codes.length; i++) {
      const code = String(codes[i]).trim();
      const before = getTotal();

      save({ next: i, code });
      log(`▶️ (${i + 1}/${codes.length})`, code);

      // 1) Inserir
      const btnIns = document.querySelector(SEL.inserir);
      if (!btnIns) { err("Botão Inserir não encontrado"); return; }
      clickSafe(btnIns);

      // 2) Input código
      const input = await waitForVisible(SEL.inputCodigo, 45000);
      if (!input) { err("Campo código não apareceu"); return; }

      // 3) Digitar número por número
      await typeDigits(input, code, 95);

      // 4) Esperar autocomplete visível
      let ul = await waitJQAutocompleteVisible(6000);

      // Se existe mas está escondido, dá “nudge” e tenta de novo
      if (!ul) {
        const maybe = getActiveAutocompleteUL();
        if (maybe && maybe.querySelector("li.ui-menu-item")) {
          await nudgeOpenAutocomplete(input);
          ul = await waitJQAutocompleteVisible(4000);
        }
      }

      if (!ul) {
        err("Autocomplete não abriu (ul existe/itens podem estar hidden).");
        // debug útil:
        try {
          const dbg = getActiveAutocompleteUL();
          if (dbg) console.log("DEBUG ul:", dbg, "display:", getComputedStyle(dbg).display, "z:", getComputedStyle(dbg).zIndex);
        } catch {}
        return;
      }

      // 5) Clicar no primeiro item
      if (!clickFirstAutocompleteItem(ul)) {
        err("Falha ao clicar no item do autocomplete");
        return;
      }

      await delay(250);

      // 6) Confirmar
      const btnConf = await waitForVisible(SEL.confirmar, 30000);
      if (!btnConf) { err("Confirmar não apareceu"); return; }
      clickSafe(btnConf);

      // 7) Esperar gravar (contador mudar)
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const now = getTotal();
        if (before !== null && now !== before) break;
        await delay(200);
      }

      log("✅ OK", code);
      save({ next: i + 1 });
      await delay(550);
    }

    clear();
    log("🎉 FINALIZADO");
  }

  // ===== Botão flutuante =====
  const btn = document.createElement("button");
  btn.id = "hpRunnerFloatingBtn";
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    padding: 12px 14px; border-radius: 14px;
    background: #0d6efd; color: #fff; font-weight: 800;
    border: none; cursor: pointer;
    box-shadow: 0 10px 24px rgba(0,0,0,.25);
  `;
  document.body.appendChild(btn);

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Abra a aba Procedimentos e clique no botão.";
  hint.style.cssText = `
    position: fixed; right: 16px; bottom: 62px; z-index: 2147483647;
    padding: 8px 10px; border-radius: 12px;
    background: rgba(0,0,0,.65); color: rgba(255,255,255,.92);
    font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
    box-shadow: 0 10px 24px rgba(0,0,0,.20);
  `;
  document.body.appendChild(hint);

  btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      warn("Nenhum código no payload. Rode pelo popup.");
      hint.textContent = "Nenhum código carregado.";
      return;
    }
    hint.textContent = `Executando ${list.length}…`;
    await run(list);
    hint.textContent = "Finalizado ✅";
  };

  log("✅ Runner TISS_PROCS carregado", { codes: (payload.codes || []).length });
})();
