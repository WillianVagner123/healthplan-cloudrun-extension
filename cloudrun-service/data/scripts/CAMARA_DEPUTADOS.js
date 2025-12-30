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
   - Mesma estrutura do GEAP + MESMOS IDs globais
   - Valida erro ("Registro não encontrado") antes de clicar
   - Persiste progresso no sessionStorage para sobreviver ao refresh/postback
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  // ======== Base helpers ========
  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // ======== Remove UI antigo (mesmos IDs) ========
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  // ======== Utils ========
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

  // ======== Detecta erros de validação na tela ========
  function hasErrorMessage() {
    const t = (document.body?.innerText || "").toLowerCase();
    // mensagens comuns vistas no seu print
    if (t.includes("registro não encontrado")) return true;
    if (t.includes("verifique mensagens nos campos")) return true;
    // se quiser, adicione mais gatilhos aqui:
    // if (t.includes("código inválido")) return true;
    return false;
  }

  async function waitValidationWindow(ms = 450) {
    // espera curtinho para a UI renderizar a mensagem após digitar
    await delay(ms);
    return hasErrorMessage();
  }

  // ======== Persistência (sobrevive refresh) ========
  const STORE_KEY = "hp_runner_state_camara_v1";

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function saveState(state) {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  function clearState() {
    sessionStorage.removeItem(STORE_KEY);
  }

  // ======== Codes: prefer payload, senão state ========
  const codesFromPopup = Array.isArray(payload.codes) ?
