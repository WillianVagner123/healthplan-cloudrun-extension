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
  const DROPDOWN_BUFFER_MS = 220;
  const AFTER_SELECT_BUFFER_MS = 280;
  const AFTER_TYPE_BUFFER_MS = 120;
  const AFTER_TABLE_CHANGE_MS = 280;      // 👈 espera após mudar a Tabela
  const RETRY_SELECT_ONCE = true;

  // ============================================================
  // ✅ Estado persistente
  // ============================================================
  const STORE_KEY = "hp_runner_state_proced_jsf_v6_tablefix";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  // ============================================================
  // ✅ DEDUPE + “já existe na tela”
  // ============================================================
  function uniqueKeepOrder(arr) {
    const seen = new Set();
    const out = [];
    for (const x of (arr || [])) {
      const v = String(x || "").trim();
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  function getExistingCodesOnPage() {
    const inputs = Array.from(document.querySelectorAll("input[id$=':procedimento:codigo']"));
    const set = new Set();
    for (const inp of inputs) {
      const v = String(inp.value || "").trim();
      if (v) set.add(v);
    }
    return set;
  }

  // ============================================================
  // ✅ CÓDIGOS do KIT/payload
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
    let codes = [];
    if (codesFromPayloadDirect.length) codes = codesFromPayloadDirect;
    else if (codesFromKit.length) codes = codesFromKit;
    else {
      const st = loadState();
      if (st?.codes?.length) codes = st.codes;
    }
    return uniqueKeepOrder(codes);
  }

  // ============================================================
  // ✅ TABELA desejada (do payload) + AUTO-FALLBACK "22/TUSS"
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
  const WANTED_TABLE_RAW = extractWantedTable(payload); // pode ser ""
  const WANTED_TABLE = (WANTED_TABLE_RAW || "").trim();

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

  // ============================================================
  // ✅ Tabela por linha — FIX: escolher "22/TUSS" por padrão
  // ============================================================
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

  function currentSelectedText(sel) {
    const opt = sel?.options?.[sel.selectedIndex];
    return (opt?.text || "").trim();
  }

  function isWrongOwnTableSelected(sel) {
    const t = currentSelectedText(sel).toLowerCase();
    // “00 - Tabela Própria ...” / “própria” / “operadoras”
    return t.includes("tabela própria") || t.includes("tabela propria") || t.includes("operadoras") || t.startsWith("00");
  }

  function selectTemOpcaoValida(sel) {
    const opts = Array.from(sel.options || []);
    return opts.some(o => {
      const v = String(o.value || "").trim();
      const t = String(o.text || "").trim().toLowerCase();
      return v && !t.includes("selecione");
    });
  }

  function pickOptionForTable(sel, wantedRaw) {
    const opts = Array.from(sel.options || []);
    const wanted = String(wantedRaw || "").trim().toLowerCase();

    const norm = (s) => String(s || "").trim().toLowerCase();

    // 1) Se o payload informou algo: tenta casar por value/text (exato e includes)
    if (wanted) {
      let o =
        opts.find(x => norm(x.value) === wanted) ||
        opts.find(x => norm(x.text) === wanted) ||
        opts.find(x => norm(x.value).includes(wanted)) ||
        opts.find(x => norm(x.text).includes(wanted));
      if (o) return o;
    }

    // 2) AUTO: preferir "22" + "TUSS" (muito mais correto que "00 própria")
    let o22tuss = opts.find(x => {
      const t = norm(x.text);
      const v = norm(x.value);
      return (t.includes("tuss") && (t.includes("22") || v === "22" || v.includes("22")));
    });
    if (o22tuss) return o22tuss;

    let oTuss = opts.find(x => norm(x.text).includes("tuss"));
    if (oTuss) return oTuss;

    let o22 = opts.find(x => {
      const t = norm(x.text);
      const v = norm(x.value);
      return t.startsWith("22") || v === "22" || v.includes("22");
    });
    if (o22) return o22;

    // 3) fallback: primeira opção válida que NÃO seja "própria/operadoras"
    let oNotOwn = opts.find(x => {
      const v = String(x.value || "").trim();
      const t = norm(x.text);
      if (!v) return false;
      if (t.includes("selecione")) return false;
      if (t.includes("tabela própria") || t.includes("tabela propria") || t.includes("operadoras") || t.startsWith("00")) return false;
      return true;
    });
    if (oNotOwn) return oNotOwn;

    // 4) último fallback: primeira válida
    return opts.find(x => {
      const v = String(x.value || "").trim();
      const t = norm(x.text);
      return v && !t.includes("selecione");
    }) || null;
  }

  async function ensureCorrectTableForRow(sel, input) {
    if (!sel) return false;
    if (!selectTemOpcaoValida(sel)) return false;

    // ✅ se já está selecionada e NÃO é “própria”, mantém
    // ✅ se está “própria/00”, troca mesmo assim
    const needForce = isWrongOwnTableSelected(sel);

    if (!needForce && currentSelectedText(sel)) {
      // já tem algo escolhido e não é “00 própria”
      return true;
    }

    const chosen = pickOptionForTable(sel, WANTED_TABLE);
    if (!chosen) return false;

    const before = currentSelectedText(sel);
    sel.value = chosen.value;
    fire(sel, "change");
    fire(sel, "input");

    // espera “assentar” o ajax do JSF
    await delay(AFTER_TABLE_CHANGE_MS);

    // alguns portais limpam/alteram a linha após change, então reforça foco
    try { input?.focus(); } catch {}

    const after = currentSelectedText(sel);
    log("📌 Tabela set", { before, after });

    // se ainda ficou "00 própria", tenta 1 vez mais (às vezes o first change não pega)
    if (isWrongOwnTableSelected(sel)) {
      await delay(200);
      const chosen2 = pickOptionForTable(sel, WANTED_TABLE || "tuss");
      if (chosen2) {
        sel.value = chosen2.value;
        fire(sel, "change");
        fire(sel, "input");
        await delay(AFTER_TABLE_CHANGE_MS);
        log("📌 Tabela retry", { after2: currentSelectedText(sel) });
      }
    }

    return !isWrongOwnTableSelected(sel);
  }

  // ============================================================
  // ✅ Digitação / autocomplete
  // ============================================================
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
    await delay(DROPDOWN_BUFFER_MS);

    const itens = Array.from(dropdown.querySelectorAll("li"));
    if (!itens.length) throw new Error("Dropdown vazio");

    const escolhido =
      itens.find(li => (li.innerText || "").includes(code)) ||
      dropdown.querySelector("li.active") ||
      itens[0];

    const alvo = escolhido.querySelector("a") || escolhido;

    clickDireto(alvo);
    await delay(AFTER_SELECT_BUFFER_MS);

    if (input) {
      input.focus();
      key(input, "keydown", "Enter");
      key(input, "keyup", "Enter");
      await delay(60);
      key(input, "keydown", "Tab");
      key(input, "keyup", "Tab");
    }

    if (RETRY_SELECT_ONCE) {
      await delay(120);
      const desc = getDescricao(input);
      if (desc && !(desc.value || "").trim()) {
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

  // ============================================================
  // ✅ Próxima linha vazia real
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
     await delay(700);
    const inicio = Date.now();
    while (Date.now() - inicio < 25000) {
      found = acharPrimeiraLinhaVazia();
      if (found) return found;
      await delay(500);
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
      await delay(180);
    }
    return "timeout";
  }

  // ============================================================
  // ✅ Step runner: insere só o que falta e nunca duplica
  // ============================================================
  function findNextMissingIndex(codes, startIdx) {
    const existing = getExistingCodesOnPage();
    for (let i = startIdx; i < codes.length; i++) {
      const c = codes[i];
      if (!existing.has(c)) return i;
    }
    return codes.length;
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

    let codes = st.codes || getCodes();
    if (!codes.length) {
      warn("Runner carregou, mas sem codes no KIT/payload e sem estado salvo.");
      return;
    }
    codes = uniqueKeepOrder(codes);
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

    // pula os que já existem
    st.idx = findNextMissingIndex(codes, st.idx);

    if (st.idx >= codes.length) {
      const existingNow = getExistingCodesOnPage();
      log("🎉 Finalizado!", { total_kit_dedupe: codes.length, ja_na_tela: existingNow.size });
      clearState();
      return;
    }

    const btn = await waitForElement(`[id$=":btnAddProcedimento"]`, { timeoutMs: 60000 });
    if (!btn) { err("Botão Add não encontrado."); return; }

    const code = codes[st.idx];

    // dupla segurança
    if (getExistingCodesOnPage().has(code)) {
      log(`⏭️ Já existe na tela, pulando: ${code}`);
      st.idx += 1;
      st.phase = "idle";
      st.lastCode = null;
      st.lastDomPos = null;
      saveState(st);
      return;
    }

    log(`▶️ (${st.idx + 1}/${codes.length}) Inserindo (faltante): ${code}`);

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

    // ✅ FIX CRÍTICO: garantir tabela correta (22/TUSS) ANTES de digitar o código
    const selTabela = acharSelectTabelaNaMesmaLinha(input);
    if (selTabela) {
      const okTable = await ensureCorrectTableForRow(selTabela, input);
      if (!okTable) {
        warn("⚠️ Não consegui setar tabela correta; pode falhar busca. Tabela atual:", currentSelectedText(selTabela));
      }
      await delay(120);
    } else {
      warn("⚠️ Select de Tabela não encontrado na mesma linha do código");
    }

    // working
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
    st.codes = uniqueKeepOrder(codes);
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
    total_kit_dedupe: (getCodes() || []).length,
    wantedTable_payload: WANTED_TABLE || "(vazio → auto 22/TUSS)",
    DROPDOWN_BUFFER_MS,
    AFTER_SELECT_BUFFER_MS,
    AFTER_TABLE_CHANGE_MS
  });
})();
