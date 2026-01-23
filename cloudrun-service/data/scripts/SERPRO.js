/*@maskara{
  "mustUrlIncludes": ["solicitacoes", "sp-sadt", "procedimentos"],
  "detectAny": [
    "[id$=':btnAddProcedimento']",
    "input[id$=':procedimento:codigo']"
  ],
  "actions": { "focus": "input[id$=':procedimento:codigo']" }
}*/

(() => {
  // ✅ FRAME FILTER
  const HAS_TARGET =
    !!document.querySelector("[id$=':btnAddProcedimento']") ||
    !!document.querySelector("input[id$=':procedimento:codigo']") ||
    !!document.querySelector("input[id*='tabelaProcedimentos'][id$=':procedimento:codigo']");
  if (!HAS_TARGET) return;

  // ✅ reinjeção = continue
  if (window.__HP_PROCED_RUNNER__?.resume) {
    try { window.__HP_PROCED_RUNNER__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_PROCED_RUNNER__ = { resume: async () => {} };

  // ============================================================
  // 🔌 PADRÃO MASKARA (igual seu exemplo CAMARA)
  // ============================================================
  const payload = window.__HP_PAYLOAD__ || {};    // <- aqui vem o KIT
  const scope = "PROCEDIMENTOS_JSF";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope  ? B.logScope(scope, ...a)  : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope  ? B.errScope(scope, ...a)  : console.error(scope + ":", ...a));

  // ============================================================
  // ✅ Estado persistente
  // ============================================================
  const STORE_KEY = "hp_runner_state_proced_jsf_v2";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // token de página (muda em reload real)
  const PAGE_TOKEN = String(performance.timeOrigin || Date.now());

  // ============================================================
  // ✅ CÓDIGOS: puxar do KIT / payload (SEM fallback local)
  // - aceita payload.codes OU payload.kit.* (várias formas)
  // ============================================================
  function normalizeCodes(arr) {
    return (arr || [])
      .map(x => (typeof x === "string" ? x : (x?.codigo || x?.code || x?.id)))
      .filter(Boolean)
      .map(x => String(x).trim())
      .filter(Boolean);
  }

  function extractCodesFromKit(p) {
    const kit =
      p?.kit || p?.KIT ||
      p?.data?.kit || p?.data?.KIT ||
      p?.context?.kit || p?.context?.KIT ||
      null;

    if (!kit) return [];

    // 1) kit.codes
    if (Array.isArray(kit.codes)) return normalizeCodes(kit.codes);

    // 2) kit.procedimentos
    if (Array.isArray(kit.procedimentos)) return normalizeCodes(kit.procedimentos);

    // 3) kit.items / kit.itens
    if (Array.isArray(kit.items)) return normalizeCodes(kit.items);
    if (Array.isArray(kit.itens)) return normalizeCodes(kit.itens);

    // 4) kit.data.codes
    if (Array.isArray(kit?.data?.codes)) return normalizeCodes(kit.data.codes);

    return [];
  }

  const codesFromPayloadDirect = Array.isArray(payload.codes) ? normalizeCodes(payload.codes) : [];
  const codesFromKit = extractCodesFromKit(payload);

  function getCodes() {
    if (codesFromPayloadDirect.length) return codesFromPayloadDirect;
    if (codesFromKit.length) return codesFromKit;
    const st = loadState();
    if (st?.codes?.length) return st.codes;
    return []; // ✅ sem fallback
  }

  // ============================================================
  // ✅ Helpers DOM / eventos
  // ============================================================
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
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }

  function key(el, type, k) {
    el.dispatchEvent(new KeyboardEvent(type, {
      key: k,
      code: k.length === 1 ? `Key${k.toUpperCase()}` : k,
      bubbles: true,
      cancelable: true,
    }));
  }

  function clickHumano(el) {
    ["mousedown", "mouseup", "click"].forEach((ev) =>
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }))
    );
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const set = desc?.set;
    if (set) set.call(el, value);
    else el.value = value;
  }

  // ============================================================
  // ✅ Seletores JSF
  // ============================================================
  const ADD_BTN_ID = "form-principal:procedimentos-solicitados-list:btnAddProcedimento";

  function btnAddProcedimento() {
    return document.getElementById(ADD_BTN_ID) || document.querySelector(`[id$=":btnAddProcedimento"]`);
  }

  function codigoInputByIndex(i) {
    const id = `form-principal:procedimentos-solicitados-list:tabelaProcedimentos:${i}:procedimento:codigo`;
    return document.getElementById(id) || null;
  }

  function getDescricao(input) {
    return document.getElementById(input.id.replace(":codigo", ":descricao"));
  }

  function getDropdown(input) {
    return input.parentElement?.querySelector("ul.typeahead.dropdown-menu") || null;
  }

  function getSpinner(input) {
    return input.parentElement?.querySelector(".fa-spinner") || null;
  }

  function spinnerVisivel(input) {
    const sp = getSpinner(input);
    if (!sp) return false;
    const box = sp.closest("span.form-control-feedback");
    if (!box) return false;
    return box.style.display !== "none" && box.offsetParent !== null;
  }

  async function esperarSpinnerSumir(input, timeout = 20000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      if (!spinnerVisivel(input)) return true;
      await delay(60);
    }
    throw new Error("Timeout spinner");
  }

  async function esperarDropdownVisivel(input, timeout = 20000) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      const ul = getDropdown(input);
      const ok = ul && ul.style.display !== "none" && ul.offsetParent !== null && ul.querySelector("li");
      if (ok) return ul;
      await delay(80);
    }
    throw new Error("Timeout dropdown");
  }

  async function esperarDescricaoPreencher(input, timeout = 20000) {
    const desc = getDescricao(input);
    if (!desc) throw new Error("Descrição não encontrada");
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      if ((desc.value || "").trim() !== "") return true;
      await delay(80);
    }
    throw new Error("Timeout descrição");
  }

  async function digitarComoHumano(input, texto) {
    input.scrollIntoView({ block: "center" });
    input.focus();
    input.click();
    await delay(80);

    setNativeValue(input, "");
    fire(input, "input");
    fire(input, "change");
    await delay(80);

    for (const c of String(texto)) {
      key(input, "keydown", c);
      key(input, "keypress", c);
      setNativeValue(input, (input.value || "") + c);
      fire(input, "input");
      key(input, "keyup", c);
      await delay(35);
    }
    fire(input, "change");
  }

  async function estimularAutocomplete(input) {
    input.focus();
    input.click();
    await delay(120);
    fire(input, "input");
    await delay(160);
    key(input, "keydown", "ArrowDown");
    key(input, "keyup", "ArrowDown");
    await delay(60);
  }

  function clicarOpcaoExata(dropdown, code) {
    const itens = Array.from(dropdown.querySelectorAll("li"));
    if (!itens.length) throw new Error("Dropdown vazio");

    const escolhido =
      itens.find(li => (li.innerText || "").includes(code)) ||
      dropdown.querySelector("li.active") ||
      itens[0];

    const alvo = escolhido.querySelector("a") || escolhido;

    ["mousedown", "mouseup", "click"].forEach((ev) =>
      alvo.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }))
    );
  }

  async function garantirNovaLinha(i) {
    let input = codigoInputByIndex(i);
    if (input) return input;

    const btn = btnAddProcedimento();
    if (!btn) throw new Error("Botão Add não encontrado: " + ADD_BTN_ID);

    clickHumano(btn);

    const inicio = Date.now();
    while (Date.now() - inicio < 25000) {
      input = codigoInputByIndex(i);
      if (input) return input;
      await delay(120);
    }
    return null;
  }

  async function confirmActionDone(st, timeoutMs = 12000) {
    const startedAt = Date.now();
    const input = codigoInputByIndex(st.lastIndex);
    if (!input) return "input_missing";

    while (Date.now() - startedAt < timeoutMs) {
      const desc = getDescricao(input);
      const okDesc = (desc?.value || "").trim() !== "";
      if (!spinnerVisivel(input) && okDesc) return "desc_ok";
      await delay(200);
    }
    return "timeout";
  }

  // ============================================================
  // ✅ Step runner (1 por vez) + resume/watchdog
  // ============================================================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle", // idle | working
      codes: null,
      lastCode: null,
      lastIndex: null,
      beforeClickToken: null
    };

    const codes = st.codes || getCodes();

    if (!codes.length) {
      warn("Runner carregou, mas sem codes no KIT/payload e sem estado salvo.");
      return;
    }
    st.codes = codes;

    // retomada (reinjeção)
    if (st.phase === "working" && st.lastIndex != null) {
      const why = await confirmActionDone(st, 12000);
      if (why !== "timeout") {
        log(`✅ Confirmado (${why}): ${st.lastCode} → próximo`);
        st.idx = (st.idx ?? 0) + 1;
        st.phase = "idle";
        st.lastCode = null;
        st.lastIndex = null;
        st.beforeClickToken = null;
        saveState(st);
      } else {
        saveState(st);
        return;
      }
    }

    if (st.idx >= codes.length) {
      log("🎉 Finalizado! Total:", codes.length);
      clearState();
      return;
    }

    // garante que a tela está pronta
    const btn = await waitForElement(`[id$=":btnAddProcedimento"]`, { timeoutMs: 60000 });
    if (!btn) { err("Botão Add não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) Inserindo: ${code}`);

    const input = await garantirNovaLinha(st.idx);
    if (!input) {
      warn("❌ Campo não encontrado na linha", st.idx, "para:", code);
      st.idx = st.idx + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastIndex = null;
      saveState(st);
      return;
    }

    // marca “working” antes da sequência (pra reinjeção retomar)
    st.running = true;
    st.phase = "working";
    st.lastCode = code;
    st.lastIndex = st.idx;
    st.beforeClickToken = PAGE_TOKEN;
    saveState(st);

    try {
      await digitarComoHumano(input, code);

      await delay(120);
      if (spinnerVisivel(input)) await esperarSpinnerSumir(input, 20000);

      await estimularAutocomplete(input);

      const dropdown = await esperarDropdownVisivel(input, 20000);
      clicarOpcaoExata(dropdown, code);

      await esperarDescricaoPreencher(input, 20000);

      log("✅ Selecionado com sucesso:", code);

      // avança
      st.idx = st.idx + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastIndex = null;
      st.beforeClickToken = null;
      saveState(st);

      await delay(250);
    } catch (e) {
      warn("⚠️ Falhou:", code, e);

      // pula pra não travar
      st.idx = st.idx + 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastIndex = null;
      st.beforeClickToken = null;
      saveState(st);
    }
  }

  // ============================================================
  // ✅ Watchdog / resume
  // ============================================================
  let inFlight = false;

  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }

  window.__HP_PROCED_RUNNER__.resume = resume;

  // Auto-start / auto-resume (mesmo padrão do seu exemplo)
  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 120);
  } else {
    const codes = getCodes(); // ✅ vem do KIT/payload
    if (!codes.length) {
      warn("Runner carregou, mas o KIT/payload não trouxe codes.");
      return;
    }
    const st = st0 || {};
    st.codes = codes;
    st.running = true;
    if (typeof st.idx !== "number") st.idx = 0;
    if (!st.phase) st.phase = "idle";
    st.lastCode = null;
    st.lastIndex = null;
    st.beforeClickToken = null;
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1500);

  log("🛡️ Runner + Watchdog ativos", { total: (getCodes() || []).length });
})();
