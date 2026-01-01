/*@maskara{
  "mustUrlIncludes": ["facilinformatica", "GuiasTISS", "tiss", "portal"],
  "detectAny": [
    "#guiaProcedimentos",
    "#incluirProcedimento",
    "#confirmarEdicaoDeProcedimento",
    "#registroProcedimentos"
  ],
  "actions": { "focus": "#incluirProcedimento" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "TISS_PROCS";

  /* ===================== GUARD ===================== */
  const MUST_HAVE = ["#guiaProcedimentos", "#incluirProcedimento"];
  if (!MUST_HAVE.some(s => document.querySelector(s))) return;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  /* ===================== HELPERS ===================== */
  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && el.offsetParent !== null;
  }

  function fireKey(el, type, key) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  function clickSafe(el) {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  async function waitForVisible(sel, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
      await delay(120);
    }
    return null;
  }

  /* ===================== DIGITAÇÃO HUMANA ===================== */
  async function typeDigits(el, text, keyDelay = 80) {
    el.focus();
    await delay(120);

    for (const ch of String(text)) {
      fireKey(el, "keydown", ch);
      fireKey(el, "keypress", ch);

      // deixa o browser inserir
      try {
        document.execCommand("insertText", false, ch);
      } catch {}

      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: ch,
        inputType: "insertText"
      }));

      fireKey(el, "keyup", ch);
      await delay(keyDelay);
    }

    return true;
  }

  /* ===================== AUTOCOMPLETE JQUERY UI ===================== */
  async function waitJQAutocomplete(timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ul = document.querySelector("ul.ui-autocomplete");
      if (ul && ul.children.length && isVisible(ul)) return ul;
      await delay(120);
    }
    return null;
  }

  function clickFirstAutocompleteItem(ul) {
    const item =
      ul.querySelector("li.ui-menu-item div") ||
      ul.querySelector("li.ui-menu-item");
    if (!item) return false;

    // jQuery UI seleciona no mousedown
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }

  /* ===================== SELECTORS ===================== */
  const SEL = {
    inserir: "#incluirProcedimento",
    confirmar: "#confirmarEdicaoDeProcedimento",
    inputCodigo: "#registroProcedimentoCodigo input",
    total: "#totalRegistros"
  };

  function getTotal() {
    const el = document.querySelector(SEL.total);
    return el ? Number(el.textContent.trim()) : null;
  }

  /* ===================== RESUME ===================== */
  const STORE = "tiss_procs_resume_v1";
  const load = () => JSON.parse(localStorage.getItem(STORE) || "null");
  const save = (o) => localStorage.setItem(STORE, JSON.stringify(o));
  const clear = () => localStorage.removeItem(STORE);

  /* ===================== LOOP PRINCIPAL ===================== */
  async function run(codes) {
    if (!codes.length) return;

    const st = load();
    let start = st?.next || 0;

    for (let i = start; i < codes.length; i++) {
      const code = codes[i];
      const before = getTotal();

      save({ next: i, code });

      log(`▶️ (${i + 1}/${codes.length})`, code);

      // Inserir
      clickSafe(document.querySelector(SEL.inserir));
      const input = await waitForVisible(SEL.inputCodigo);
      if (!input) return err("Campo código não apareceu");

      // Digitar
      await typeDigits(input, code);

      // Autocomplete
      const ul = await waitJQAutocomplete();
      if (!ul) return err("Autocomplete não abriu");

      if (!clickFirstAutocompleteItem(ul)) {
        return err("Falha ao clicar no item");
      }

      await delay(300);

      // Confirmar
      const btn = await waitForVisible(SEL.confirmar);
      if (!btn) return err("Confirmar não apareceu");
      clickSafe(btn);

      // Aguarda gravar
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) {
        const now = getTotal();
        if (before !== null && now !== before) break;
        await delay(200);
      }

      log("✅ OK", code);
      save({ next: i + 1 });
      await delay(600);
    }

    clear();
    log("🎉 FINALIZADO");
  }

  /* ===================== BOTÃO ===================== */
  const btn = document.createElement("button");
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText = `
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    padding: 12px 14px; border-radius: 14px;
    background: #0d6efd; color: #fff; font-weight: 800;
    border: none; cursor: pointer;
    box-shadow: 0 10px 24px rgba(0,0,0,.25);
  `;
  document.body.appendChild(btn);

  btn.onclick = async () => {
    const list = payload.codes || [];
    if (!list.length) return warn("Nenhum código");
    await run(list);
  };

  log("✅ Runner TISS_PROCS carregado");
})();
