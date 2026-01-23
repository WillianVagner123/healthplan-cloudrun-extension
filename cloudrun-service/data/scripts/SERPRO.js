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
  // 🔌 PADRÃO MASKARA
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
  const STORE_KEY = "hp_runner_state_proced_jsf_v3";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // ============================================================
  // ✅ CÓDIGOS do KIT
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

  // ============================================================
  // ✅ TABELA (select "Tabela" da linha)
  // - Aceita payload.table / payload.tabela / payload.kit.table / payload.kit.tabela
  // - Pode ser VALUE ou TEXTO
  // ============================================================
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
  const WANTED_TABLE = extractWantedTable(payload); // pode ser ""

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

  // ✅ você NÃO quer clique humano:
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

  // ============================================================
  // ✅ Seletores / JSF helpers
  // ============================================================
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

  // ============================================================
  // ✅ Linha / Tabela por linha
  // - pega o <select> "Tabela" na mesma linha do input de código
  // ============================================================
  function acharSelectTabelaNaMesmaLinha(input) {
    // tenta encontrar a "linha" mais provável do JSF (row)
    const row =
      input.closest("tr") ||
      input.closest(".row") ||
      input.closest("div[class*='row']") ||
      input.closest("div");

    if (!row) return null;

    // normalmente o select fica perto do input
    // tenta priorizar selects visíveis e com opção "Selecione"
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
    // existe ao menos 1 opção que não seja vazia e não seja "Selecione"
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
      chosen = opts.find(o => String(o.value || "").trim().toLowerCase() === wantedNorm) ||
               opts.find(o => String(o.text || "").trim().toLowerCase().includes(wantedNorm));
    }

    // fallback: primeira opção válida
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

  // ============================================================
  // ✅ Digitação / autocomplete (sem clique humano)
  // ============================================================
  async function digitarComoHumano(input, texto) {
    input.scrollIntoView({ block: "center" });
    input.focus();
    await delay(60);

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
      await delay(25);
    }
    fire(input, "change");
  }

  async function estimularAutocomplete(input) {
    input.focus();
    await delay(120);
    fire(input, "input");
    await delay(160);
    key(input, "keydown", "ArrowDown");
    key(input, "keyup", "ArrowDown");
    await delay(80);
  }

  function selecionarOpcaoExataSemHumano(dropdown, code, input) {
    const itens = Array.from(dropdown.querySelectorAll("li"));
    if (!itens.length) throw new Error("Dropdown vazio");

    const escolhido =
      itens.find(li => (li.innerText || "").includes(code)) ||
      dropdown.querySelector("li.active") ||
      itens[0];

    const alvo = escolhido.querySelector("a") || escolhido;

    // clique direto + reforço de enter (muito JSF curte isso)
    clickDireto(alvo);
    if (input) {
      input.focus();
      key(input, "keydown", "Enter");
      key(input, "keyup", "Enter");
    }
  }

  // ============================================================
  // ✅ Escolha da próxima linha (evita criar mil linhas vazias)
  // - usa a primeira linha cujo código está vazio
  // - se não existir, clica Add e espera aparecer uma vazia
  // ============================================================
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

  // ============================================================
  // ✅ Confirmação pós-reinjeção
  // ============================================================
  async function confirmActionDone(st, timeoutMs = 12000) {
    const startedAt = Date.now();
    const inputs = allCodigoInputs();
    const input = inputs[st.lastDomPos] || null;
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
  // ✅ Step runner
  // ============================================================
  async function stepOnce() {
    const st = loadState() || {
      idx: 0,
      running: false,
      phase: "idle", // idle | working
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

    // retomada
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

    // tela pronta
    const btn = await waitForElement(`[id$=":btnAddProcedimento"]`, { timeoutMs: 60000 });
    if (!btn) { err("Botão Add não encontrado."); return; }

    const code = codes[st.idx];
    log(`▶️ (${st.idx + 1}/${codes.length}) Inserindo: ${code}`);

    // pega/garante uma linha vazia real
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

    // antes de digitar: garante "Tabela" dessa linha
    const selTabela = acharSelectTabelaNaMesmaLinha(input);
    if (selTabela) {
      const ok = escolherTabela(selTabela, WANTED_TABLE);
      if (!ok) warn("⚠️ Não consegui selecionar Tabela (sem opções?)");
      await delay(80);
    } else {
      warn("⚠️ Select de Tabela não encontrado na mesma linha do código");
    }

    // marca working (pra reinjeção)
    st.running = true;
    st.phase = "working";
    st.lastCode = code;
    st.lastDomPos = slot.pos;
    saveState(st);

    try {
      await digitarComoHumano(input, code);

      await delay(120);
      if (spinnerVisivel(input)) await esperarSpinnerSumir(input, 20000);

      await estimularAutocomplete(input);

      const dropdown = await esperarDropdownVisivel(input, 20000);
      selecionarOpcaoExataSemHumano(dropdown, code, input);

      // reforço: tab pra JSF aplicar e preencher descrição
      await delay(80);
      key(input, "keydown", "Tab");
      key(input, "keyup", "Tab");

      await esperarDescricaoPreencher(input, 20000);

      log("✅ Selecionado com sucesso:", code);

      // avança
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
      saveState(st);

      await delay(200);
    } catch (e) {
      warn("⚠️ Falhou:", code, e);

      // pula pra não travar
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
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

  // Auto-start / auto-resume
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

  log("🛡️ Runner + Watchdog ativos", { total: (getCodes() || []).length, wantedTable: WANTED_TABLE || "(auto)" });
})();
