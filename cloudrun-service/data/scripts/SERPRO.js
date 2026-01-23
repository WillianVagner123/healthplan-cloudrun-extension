/*@maskara{
  "mustUrlIncludes": ["solicitacoes", "sp-sadt", "procedimentos"],
  "detectAny": [
    "[id$=':btnAddProcedimento']",
    "input[id$=':procedimento:codigo']"
  ],
  "actions": { "focus": "input[id$=':procedimento:codigo']" }
}*/

(() => {
  const HAS_TARGET =
    !!document.querySelector("[id$=':btnAddProcedimento']") ||
    !!document.querySelector("input[id$=':procedimento:codigo']") ||
    !!document.querySelector("input[id*='tabelaProcedimentos'][id$=':procedimento:codigo']");
  if (!HAS_TARGET) return;

  if (window.__HP_PROCED_RUNNER__?.resume) {
    try { window.__HP_PROCED_RUNNER__.resume("reinjected"); } catch {}
    return;
  }
  window.__HP_PROCED_RUNNER__ = { resume: async () => {} };

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "PROCEDIMENTOS_JSF";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope  ? B.logScope(scope, ...a)  : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope  ? B.errScope(scope, ...a)  : console.error(scope + ":", ...a));

  // =======================
  // 🧠 TIMING BUFFERS
  // =======================
  const DROPDOWN_BUFFER_MS = 200;        // espera extra depois que dropdown aparece
  const AFTER_SELECT_BUFFER_MS = 260;    // espera extra depois de selecionar item
  const AFTER_TYPE_BUFFER_MS = 120;      // espera extra depois de digitar o código
  const RETRY_SELECT_ONCE = true;

  const STORE_KEY = "hp_runner_state_proced_jsf_v4";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

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
    if (Array.isArray(kit.codes)) return normalizeCodes(kit.codes);
    if (Array.isArray(kit.procedimentos)) return normalizeCodes(kit.procedimentos);
    if (Array.isArray(kit.items)) return normalizeCodes(kit.items);
    if (Array.isArray(kit.itens)) return normalizeCodes(kit.itens);
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
    return [];
  }

  function extractWantedTable(p) {
    const direct = p?.table ?? p?.tabela ?? p?.procedTable ?? p?.procedTabela;
    if (direct) return String(direct).trim();

    const kit =
      p?.kit || p?.KIT ||
      p?.data?.kit || p?.data?.KIT ||
      p?.context?.kit || p?.context?.KIT ||
      null;

    const k = kit?.table ?? kit?.tabela ?? kit?.procedTable ?? kit?.procedTabela;
    return k ? String(k).trim() : "";
  }
  const WANTED_TABLE = extractWantedTable(payload);

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

  function clickDireto(el) {
    if (!el) return;
    try { el.focus?.(); } catch {}
    el.click();
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const set = desc?.set;
    if (set) set.call(el, value);
    else el.value = value;
  }

  const ADD_BTN_ID = "form-principal:procedimentos-solicitados-list:btnAddProcedimento";

  function btnAddProcedimento() {
    return document.getElementById(ADD_BTN_ID) || document.querySelector(`[id$=":btnAddProcedimento"]`);
  }

  function allCodigoInputs() {
    return Array.from(document.querySelectorAll("input[id$=':procedimento:codigo']"));
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
      await delay(60);
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

  function acharSelectTabelaNaMesmaLinha(input) {
    const row =
      input.closest("tr") ||
      input.closest(".row") ||
      input.closest("div[class*='row']") ||
      input.closest("div");

    if (!row) return null;

    const selects = Array.from(row.querySelectorAll("select"))
      .filter(s => s && s.offsetParent !== null);

    if (selects.length === 1) return selects[0];

    const byHint = selects.find(s => {
      const txt = (s.innerText || "").toLowerCase();
      return txt.includes("selecione") || txt.includes("tabela");
    });

    return byHint || selects[0] || null;
  }

  function selectTemOpcaoValida(sel) {
    const opts = Array.from(sel.options || []);
    return opts.some(o => {
      const v = String(o.value || "").trim();
      const t = String(o.text || "").trim().toLowerCase();
      return v && !t.includes("selecione");
    });
  }

  function selectJaEscolhido(sel) {
    const opt = sel.options?.[sel.selectedIndex];
    if (!opt) return false;
    const v = String(opt.value || "").trim();
    const t = String(opt.text || "").trim().toLowerCase();
    return !!v && !t.includes("selecione");
  }

  function escolherTabela(sel, wanted) {
    if (!sel) return false;
    if (!selectTemOpcaoValida(sel)) return false;
    if (selectJaEscolhido(sel)) return true;

    const wantedNorm = String(wanted || "").trim().toLowerCase();
    const opts = Array.from(sel.options || []);
    let chosen = null;

    if (wantedNorm) {
      chosen =
        opts.find(o => String(o.value || "").trim().toLowerCase() === wantedNorm) ||
        opts.find(o => String(o.text || "").trim().toLowerCase().includes(wantedNorm));
    }

    if (!chosen) {
      chosen = opts.find(o => {
        const v = String(o.value || "").trim();
        const t = String(o.text || "").trim().toLowerCase();
        return v && !t.includes("selecione");
      });
    }

    if (!chosen) return false;

    sel.value = chosen.value;
    fire(sel, "change");
    fire(sel, "input");
    return true;
  }

  async function digitarComoHumano(input, texto) {
    input.scrollIntoView({ block: "center" });
    input.focus();
    await delay(50);

    setNativeValue(input, "");
    fire(input, "input");
    fire(input, "change");
    await delay(70);

    for (const c of String(texto)) {
      key(input, "keydown", c);
      key(input, "keypress", c);
      setNativeValue(input, (input.value || "") + c);
      fire(input, "input");
      key(input, "keyup", c);
      await delay(22);
    }
    fire(input, "change");
    await delay(AFTER_TYPE_BUFFER_MS);
  }

  async function estimularAutocomplete(input) {
    input.focus();
    await delay(90);
    fire(input, "input");
    await delay(140);
    key(input, "keydown", "ArrowDown");
    key(input, "keyup", "ArrowDown");
    await delay(70);
  }

  async function selecionarComBuffer(dropdown, code, input) {
    // ✅ buffer extra depois que o dropdown apareceu
    await delay(DROPDOWN_BUFFER_MS);

    const itens = Array.from(dropdown.querySelectorAll("li"));
    if (!itens.length) throw new Error("Dropdown vazio");

    const escolhido =
      itens.find(li => (li.innerText || "").includes(code)) ||
      dropdown.querySelector("li.active") ||
      itens[0];

    const alvo = escolhido.querySelector("a") || escolhido;

    clickDireto(alvo);

    // ✅ buffer extra depois de selecionar
    await delay(AFTER_SELECT_BUFFER_MS);

    // reforço: Enter + Tab (ajuda o JSF a “comitar”)
    if (input) {
      input.focus();
      key(input, "keydown", "Enter");
      key(input, "keyup", "Enter");
      await delay(60);
      key(input, "keydown", "Tab");
      key(input, "keyup", "Tab");
    }

    // se ainda ficou instável, tenta mais 1x (só se habilitado)
    if (RETRY_SELECT_ONCE) {
      await delay(90);
      const desc = getDescricao(input);
      if (desc && !(desc.value || "").trim()) {
        // tenta “selecionar pelo teclado”
        input.focus();
        key(input, "keydown", "ArrowDown");
        key(input, "keyup", "ArrowDown");
        await delay(60);
        key(input, "keydown", "Enter");
        key(input, "keyup", "Enter");
        await delay(AFTER_SELECT_BUFFER_MS);
      }
    }
  }

  function acharPrimeiraLinhaVazia() {
    const inputs = allCodigoInputs();
    for (let i = 0; i < inputs.length; i++) {
      const v = String(inputs[i].value || "").trim();
      if (!v) return { input: inputs[i], pos: i };
    }
    return null;
  }

  async function garantirLinhaVazia() {
    let found = acharPrimeiraLinhaVazia();
    if (found) return found;

    const btn = btnAddProcedimento();
    if (!btn) throw new Error("Botão Add não encontrado: " + ADD_BTN_ID);

    clickDireto(btn);

    const inicio = Date.now();
    while (Date.now() - inicio < 25000) {
      found = acharPrimeiraLinhaVazia();
      if (found) return found;
      await delay(120);
    }
    throw new Error("Timeout aguardando nova linha vazia");
  }

  async function confirmActionDone(st, timeoutMs = 12000) {
    const startedAt = Date.now();
    const inputs = allCodigoInputs();
    const input = inputs[st.lastDomPos] || null;
    if (!input) return "input_missing";

    while (Date.now() - startedAt < timeoutMs) {
      const desc = getDescricao(input);
      const okDesc = (desc?.value || "").trim() !== "";
      if (!spinnerVisivel(input) && okDesc) return "desc_ok";
      await delay(180);
    }
    return "timeout";
  }

  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle",
      codes: null,
      lastCode: null,
      lastDomPos: null
    };

    const codes = st.codes || getCodes();
    if (!codes.length) {
      warn("Runner carregou, mas sem codes no KIT/payload e sem estado salvo.");
      return;
    }
    st.codes = codes;

    if (st.phase === "working" && st.lastDomPos != null) {
      const why = await confirmActionDone(st, 12000);
      if (why !== "timeout") {
        log(`✅ Confirmado (${why}): ${st.lastCode} → próximo`);
        st.idx = (st.idx ?? 0) + 1;
        st.phase = "idle";
        st.lastCode = null;
        st.lastDomPos = null;
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

    const btn = await waitForElement(`[id$=":btnAddProcedimento"]`, { timeoutMs: 60000 });
    if (!btn) { err("Botão Add não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) Inserindo: ${code}`);

    let slot;
    try {
      slot = await garantirLinhaVazia();
    } catch (e) {
      warn("❌ Não consegui garantir linha vazia:", e);
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
      saveState(st);
      return;
    }

    const input = slot.input;

    // garante Tabela da linha
    const selTabela = acharSelectTabelaNaMesmaLinha(input);
    if (selTabela) {
      const ok = escolherTabela(selTabela, WANTED_TABLE);
      if (!ok) warn("⚠️ Não consegui selecionar Tabela (sem opções?)");
      // dá um tempinho pro JSF/Ajax acoplar isso
      await delay(140);
    } else {
      warn("⚠️ Select de Tabela não encontrado na mesma linha do código");
    }

    st.running = true;
    st.phase = "working";
    st.lastCode = code;
    st.lastDomPos = slot.pos;
    saveState(st);

    try {
      await digitarComoHumano(input, code);

      await delay(100);
      if (spinnerVisivel(input)) await esperarSpinnerSumir(input, 20000);

      await estimularAutocomplete(input);

      const dropdown = await esperarDropdownVisivel(input, 20000);

      // ✅ aqui está o que você pediu: viu dropdown → espera + tempo → avança
      await selecionarComBuffer(dropdown, code, input);

      await esperarDescricaoPreencher(input, 20000);

      log("✅ Selecionado com sucesso:", code);

      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
      saveState(st);

      await delay(150);
    } catch (e) {
      warn("⚠️ Falhou:", code, e);

      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
      saveState(st);
    }
  }

  let inFlight = false;

  async function resume(reason = "watchdog") {
    if (inFlight) return;
    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("resume erro:", e); }
    finally { inFlight = false; }
  }

  window.__HP_PROCED_RUNNER__.resume = resume;

  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    setTimeout(() => resume("auto-resume"), 120);
  } else {
    const codes = getCodes();
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
    st.lastDomPos = null;
    saveState(st);
    setTimeout(() => resume("auto-start"), 200);
  }

  setInterval(() => {
    const st = loadState();
    if (!st?.running) return;
    resume("watchdog-tick");
  }, 1500);

  log("🛡️ Runner + Watchdog ativos", {
    total: (getCodes() || []).length,
    wantedTable: WANTED_TABLE || "(auto)",
    DROPDOWN_BUFFER_MS,
    AFTER_SELECT_BUFFER_MS
  });
})();
