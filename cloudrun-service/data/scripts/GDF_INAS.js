/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V9__) return;
  window.__GDF_INAS_V9__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v9";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm  = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
  const normL = (s) => norm(s).toLowerCase();

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = Object.getPrototypeOf(el);
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    const set = desc && desc.set;
    if (set) set.call(el, value);
    else el.value = value;
  }

  function fireInput(el) {
    if (!el) return;
    try { el.dispatchEvent(new InputEvent("input", { bubbles: true })); }
    catch { el.dispatchEvent(new Event("input", { bubbles: true })); }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function waitFor(getter, timeoutMs = 25000, stepMs = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = (typeof getter === "string") ? document.querySelector(getter) : getter();
      if (el) return el;
      await delay(stepMs);
    }
    return null;
  }

  function baseIdFromInputId(id) {
    const m = String(id || "").match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  async function waitOptions(baseId, timeoutMs = 20000) {
    return await waitFor(() => {
      const opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
        .filter(o => o && o.offsetParent !== null);
      return opts.length ? opts : null;
    }, timeoutMs, 80);
  }

  // ✅ fallback: espera “fim de processamento”
  async function waitNotBusy(scope = document, timeoutMs = 9000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hasBusy =
        !!scope.querySelector("[aria-busy='true']") ||
        !!scope.querySelector("[data-loading='true']") ||
        Array.from(scope.querySelectorAll("button")).some(b => {
          const txt = (b.textContent || "").toLowerCase();
          return b.disabled && txt.includes("adicionar");
        });
      if (!hasBusy) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // ✅ React-Select filler
  // =========================
  async function fillReactSelect({
    id,
    text,
    mode = "wait",
    waitBeforeEnterMs = 0,
    waitOptionsMs = 40000,
    typeDelay = 10,

    clickOption = false,
    optionExact = null,
    optionStartsWith = null,
    optionContains = null,
    postWaitAfterPickMs = 250
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 50000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(80);

    // abrir dropdown
    input.focus();
    input.click();
    await delay(60);

    // limpar e digitar
    setNativeValue(input, "");
    fireInput(input);
    await delay(40);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      if (typeDelay) await delay(typeDelay);
    }

    if (waitBeforeEnterMs > 0) await delay(waitBeforeEnterMs);

    let opts = null;
    let baseId = null;

    if (mode === "wait") {
      baseId = baseIdFromInputId(id);
      if (baseId) opts = await waitOptions(baseId, waitOptionsMs);
    }

    if (clickOption) {
      if (!opts?.length) {
        input.focus(); input.click();
        await delay(120);
        baseId = baseId || baseIdFromInputId(id);
        opts = baseId ? await waitOptions(baseId, waitOptionsMs) : null;
      }
      if (!opts?.length) throw new Error(`Sem opções visíveis para ${id} (clickOption)`);

      const exact = optionExact ? normL(optionExact) : null;
      const starts = optionStartsWith ? normL(optionStartsWith) : null;
      const contains = optionContains ? normL(optionContains) : null;

      const pick =
        (exact ? opts.find(o => normL(o.textContent) === exact) : null) ||
        (starts ? opts.find(o => normL(o.textContent).startsWith(starts)) : null) ||
        (contains ? opts.find(o => normL(o.textContent).includes(contains)) : null) ||
        opts[0];

      if (!pick || !norm(pick.textContent)) {
        console.log("GDF_INAS: opções disponíveis:", opts.map(o => norm(o.textContent)));
        throw new Error(`Não achei opção alvo no dropdown (${id}) ou veio vazio.`);
      }

      pick.scrollIntoView?.({ block: "center" });
      await delay(50);
      pick.click();
      await delay(postWaitAfterPickMs);
      return true;
    }

    await delay(20);
    pressEnter(input);
    await delay(postWaitAfterPickMs);
    return true;
  }

  // =========================
  // ✅ CAMPOS OBRIGATÓRIOS
  // =========================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  text: "22416",  mode: "wait", waitBeforeEnterMs: 1600 },
    cbo_solicitante:  { id: "react-select-21-input", text: "999999", mode: "wait", waitBeforeEnterMs: 700  },

    regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial", mode: "wait", waitBeforeEnterMs: 650  },
    especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA",     mode: "wait", waitBeforeEnterMs: 1600 },
    carater:          { id: "react-select-7-input",  text: "1 – Eletivo",        mode: "wait", waitBeforeEnterMs: 650  },

    tipo_consulta: {
      id: "react-select-9-input",
      text: "04",
      mode: "wait",
      waitBeforeEnterMs: 250,
      clickOption: true,
      optionExact: "04 - Consulta",
      postWaitAfterPickMs: 350
    },

    cid:              { id: "react-select-11-input", text: "E88",               mode: "wait", waitBeforeEnterMs: 1600 },

    prof_exec:        { id: "react-select-16-input", text: "22416",  mode: "wait", waitBeforeEnterMs: 1600 },
    cbo_exec:         { id: "react-select-22-input", text: "999999", mode: "wait", waitBeforeEnterMs: 700  },
  };

  // =========================
  // ✅ PROCEDIMENTOS
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_INPUT_ID  = "react-select-23-input"; // Procedimento*
  const QTY_DEFAULT = "1";

  const ADD_BUTTON_SELECTOR =
    "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-eNLTQs.dVUnNT > div.sc-JQDoe.eETcDf > button.sc-eQaGpr.byRRCL.button-add";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

  function findQtyInputNearProcedures() {
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']"));
    return nums.find(n => n.offsetParent !== null) || nums[0] || null;
  }

  function findAddButton() {
    const btn = document.querySelector(ADD_BUTTON_SELECTOR);
    if (btn) return btn;

    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;
    const buttons = Array.from(scope.querySelectorAll("button"));
    const t = (s) => (s || "").toString().trim().toLowerCase();
    return buttons.find(b => t(b.textContent) === "adicionar") ||
           buttons.find(b => t(b.textContent).includes("adicionar")) ||
           null;
  }

  function tabelaSingleValueText() {
    const input = document.getElementById(TABLE_INPUT_ID);
    if (!input) return "";
    const root =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;
    const single = root ? root.querySelector("[class*='singleValue']") : null;
    return norm(single?.textContent || "");
  }

  function getSingleValueTextByInputId(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return "";
    const root =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;
    const single = root ? root.querySelector("[class*='singleValue']") : null;
    return norm(single?.textContent || "");
  }

  function procSingleValueText() {
    return getSingleValueTextByInputId(PROC_INPUT_ID);
  }

  // =========================
  // ✅ FAST MODE: TABELA 22 cacheada
  // =========================
  let __TABELA_22_OK__ = false;

  function getProcedureRowsCount() {
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;

    const trs = scope.querySelectorAll("table tbody tr");
    if (trs?.length) return trs.length;

    const roleRows = scope.querySelectorAll("[role='row']");
    if (roleRows?.length) return roleRows.length;

    const items = scope.querySelectorAll("[class*='row'], [class*='item'], li");
    const visibleItems = Array.from(items).filter(x => x.offsetParent !== null && norm(x.textContent));
    return visibleItems.length || 0;
  }

  async function waitRowAdded(prevCount, timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const now = getProcedureRowsCount();
      if (now > prevCount) return true;
      await delay(90);
    }
    return false;
  }

  async function ensureTabela22_fast() {
    if (__TABELA_22_OK__) {
      const already = tabelaSingleValueText();
      if (already.startsWith("22 -")) return true;
      __TABELA_22_OK__ = false;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const already = tabelaSingleValueText();
        if (already.startsWith("22 -")) {
          __TABELA_22_OK__ = true;
          return true;
        }

        await fillReactSelect({
          id: TABLE_INPUT_ID,
          text: "22",
          mode: "wait",
          waitBeforeEnterMs: 220,
          waitOptionsMs: 12000,
          typeDelay: 0,

          clickOption: true,
          optionStartsWith: "22 -",
          postWaitAfterPickMs: 180
        });

        await delay(180);

        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          __TABELA_22_OK__ = true;
          log("✅ Tabela selecionada:", picked);
          return true;
        }

        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/2 falhou ao selecionar Tabela 22 (fast):`, e?.message || e);
        await delay(220);
      }
    }

    throw new Error("Não consegui selecionar a Tabela 22 (fast).");
  }

  // =========================
  // ✅ PROCEDIMENTO: retry/cadência até opções aparecerem
  // - se opções vierem vazias/brancas => código não existe no convênio => pular
  // =========================
  async function pickProcedureWithRetry(code, {
    cycles = 7,
    perCycleWaitMs = 2600,
    betweenCyclesMs = 280,
    typeDelay = 0,
    minOptions = 1
  } = {}) {
    const id = PROC_INPUT_ID;
    const input = await waitFor(() => document.getElementById(id), 50000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    // se já está selecionado com esse código, ok
    const already = procSingleValueText();
    if (already && normL(already).includes(String(code).toLowerCase())) {
      return { ok: true };
    }

    for (let attempt = 1; attempt <= cycles; attempt++) {
      // abrir dropdown
      input.scrollIntoView?.({ block: "center" });
      input.focus();
      input.click();
      await delay(90);

      // limpar e digitar
      setNativeValue(input, "");
      fireInput(input);
      await delay(60);

      let cur = "";
      for (const ch of String(code)) {
        cur += ch;
        setNativeValue(input, cur);
        fireInput(input);
        if (typeDelay) await delay(typeDelay);
      }

      // esperar opções
      const baseId = baseIdFromInputId(id);
      let opts = null;

      const t0 = Date.now();
      while (Date.now() - t0 < perCycleWaitMs) {
        if (baseId) {
          opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
            .filter(o => o && o.offsetParent !== null);
        } else {
          opts = null;
        }

        if (opts && opts.length >= minOptions) break;
        await delay(110);
      }

      if (!opts || !opts.length) {
        warn(`PROC: sem opções ainda (${attempt}/${cycles}) para code=${code}`);
        await delay(betweenCyclesMs);
        continue;
      }

      // remove opções em branco
      const cleanOpts = opts.filter(o => norm(o.textContent));
      if (!cleanOpts.length) {
        warn(`PROC: opções vazias/brancas para code=${code} -> pulando`);
        return { ok: false, reason: "not_found_blank" };
      }

      // tenta achar opção que começa com o código; senão pega a primeira
      const codeL = String(code).toLowerCase();
      const target =
        cleanOpts.find(o => normL(o.textContent).startsWith(codeL)) ||
        cleanOpts.find(o => normL(o.textContent).includes(codeL)) ||
        cleanOpts[0];

      if (!target || !norm(target.textContent)) {
        warn(`PROC: opção alvo vazia para code=${code} -> pulando`);
        return { ok: false, reason: "not_found_blank_target" };
      }

      // clicar
      target.scrollIntoView?.({ block: "center" });
      await delay(70);
      target.click();
      await delay(220);

      // confirmar singleValue
      const picked = procSingleValueText();
      if (picked && normL(picked).includes(codeL)) {
        log(`✅ PROC selecionado: ${picked}`);
        return { ok: true };
      }

      warn(`PROC: clique não assentou (${attempt}/${cycles}) code=${code} | single="${picked}"`);
      await delay(betweenCyclesMs);
    }

    return { ok: false, reason: "not_found_after_retries" };
  }

  // =========================
  // ✅ INSERÇÃO DO PROCEDIMENTO (cadenciada)
  // - só preenche quantidade e clica Adicionar depois de confirmar PROC selecionado
  // - se não houver opção (ou vier em branco): pula o código
  // =========================
  async function insertOneProcedure_fast(code) {
    await ensureTabela22_fast();

    const pick = await pickProcedureWithRetry(code, {
      cycles: 7,
      perCycleWaitMs: 2800,
      betweenCyclesMs: 300,
      typeDelay: 0,
      minOptions: 1
    });

    if (!pick.ok) {
      warn(`⏭️ Código ${code} não disponível no convênio. Pulando... (${pick.reason})`);
      return { skipped: true, code, reason: pick.reason };
    }

    const qty = findQtyInputNearProcedures();
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(70);

    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);
    await delay(120);

    const addBtn = findAddButton();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    const before = getProcedureRowsCount();
    addBtn.click();

    const ok = await waitRowAdded(before, 14000);
    if (!ok) {
      const proc = document.getElementById(PROC_INPUT_ID);
      const scope = proc?.closest("form") || document;
      await waitNotBusy(scope, 8000);

      const after = getProcedureRowsCount();
      if (after <= before) {
        throw new Error("Não confirmou inclusão após clicar Adicionar.");
      }
    }

    await delay(90);
    return { skipped: false, code };
  }

  // =========================
  // UI
  // =========================
  function setStatus(txt) {
    const el = document.getElementById("gdfStatus");
    if (el) el.textContent = txt;
  }

  function lockProcs(lock) {
    const btn = document.getElementById("btnProcs");
    if (!btn) return;
    btn.disabled = !!lock;
    btn.style.background = lock ? "#94a3b8" : "#22c55e";
    btn.style.cursor = lock ? "not-allowed" : "pointer";
  }

  // =========================
  // Runs
  // =========================
  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios...");

      for (const k of [
        "prof_solicitante",
        "cbo_solicitante",
        "regime",
        "especialidade",
        "carater",
        "tipo_consulta",
        "cid",
        "prof_exec",
        "cbo_exec",
      ]) {
        const cfg = MANDATORY[k];
        setStatus(`⌛ Preenchendo ${k}...`);
        await fillReactSelect(cfg);
        await delay(220);
      }

      const st = loadSt() || {};
      st.obrigOk = true;
      st.obrigOkAt = new Date().toISOString();
      saveSt(st);

      lockProcs(false);
      setStatus("✅ Obrigatórios preenchidos. Pode inserir procedimentos.");
      alert("✅ Obrigatórios preenchidos. Agora pode inserir procedimentos.");
    } catch (e) {
      err(e);
      setStatus("❌ Erro ao preencher obrigatórios.");
      alert("Erro nos obrigatórios: " + (e?.message || e));
    }
  }

  async function runProcedimentos() {
    const st = loadSt() || {};
    if (!st.obrigOk) {
      alert("Primeiro clique em ✅ Preencher obrigatórios (guia).");
      return;
    }
    await runProcedimentos_independente(true);
  }

  // ✅ independente: não depende de obrigatórios
  async function runProcedimentos_independente(keepGate = false) {
    if (keepGate) {
      const st = loadSt() || {};
      if (!st.obrigOk) {
        alert("Primeiro clique em ✅ Preencher obrigatórios (guia).");
        return;
      }
    }

    const codes = getCodes();
    if (!codes.length) {
      alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      return;
    }

    if (runProcedimentos_independente.__running) return;
    runProcedimentos_independente.__running = true;

    try {
      const fails = [];
      const skipped = [];
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          const r = await insertOneProcedure_fast(code);

          if (r?.skipped) {
            skipped.push({ code, reason: r.reason || "not_found" });
            log(`⏭️ Pulado: ${code} (${r.reason || "not_found"})`);
          } else {
            log("✅ Inserido:", code);
          }
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(250);
        }

        await delay(60);
      }

      if (fails.length) {
        setStatus(`⚠️ Finalizado com falhas: ${fails.length}/${codes.length} (pulados: ${skipped.length})`);
        alert("Finalizado com falhas. Veja console (F12) para detalhes.");
        console.table(fails);
        if (skipped.length) console.table(skipped);
      } else {
        setStatus(`🎉 Concluído! Inseridos: ${codes.length - skipped.length} | Pulados: ${skipped.length}`);
        alert(`🎉 Concluído! Inseridos: ${codes.length - skipped.length} | Pulados: ${skipped.length}`);
        if (skipped.length) console.table(skipped);
      }
    } catch (e) {
      err(e);
      setStatus("❌ Erro nos procedimentos.");
      alert("Erro nos procedimentos: " + (e?.message || e));
    } finally {
      runProcedimentos_independente.__running = false;
    }
  }

  // =========================
  // Panel
  // =========================
  function createPanel() {
    if (document.getElementById("gdf-inas-panel")) return;

    const panel = document.createElement("div");
    panel.id = "gdf-inas-panel";
    panel.style.cssText = `
      position: fixed;
      top: 90px;
      right: 16px;
      z-index: 999999;
      background: #0f172a;
      color: #fff;
      padding: 12px;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.35);
      font-family: system-ui, sans-serif;
      width: 340px;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:900">GDF INAS</div>
        <button id="btnReset" title="Reset" style="
          padding:6px 10px;border-radius:10px;border:none;cursor:pointer;
          background:#1f2937;color:#e5e7eb;font-weight:900
        ">↺</button>
      </div>

      <button id="btnObrig" style="
        width:100%;
        margin-bottom:8px;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#e5e7eb;
        color:#0b1220;
        font-weight:900
      ">✅ Preencher obrigatórios (guia)</button>

      <button id="btnProcs" disabled style="
        width:100%;
        margin-bottom:8px;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#94a3b8;
        color:#0b1220;
        font-weight:900
      ">🧪 Inserir Procedimentos</button>

      <button id="btnProcsInd" style="
        width:100%;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#22c55e;
        color:#0b1220;
        font-weight:900
      ">🧪 Inserir Procedimentos (independente)</button>

      <div id="gdfStatus" style="margin-top:10px;font-size:12px;opacity:.92;line-height:1.35">
        Beneficiário manual. Depois clique em “Preencher obrigatórios” (opcional).
      </div>

      <div style="margin-top:8px;font-size:11px;opacity:.8">
        v9: procedimento <b>cadenciado</b> (retry até opções carregarem).<br/>
        Se dropdown vier <b>em branco</b>, considera código fora do convênio e <b>pula</b>.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;
    panel.querySelector("#btnProcsInd").onclick = () => runProcedimentos_independente(false);

    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      __TABELA_22_OK__ = false;
      lockProcs(true);
      setStatus("Reset feito. Beneficiário manual → Obrigatórios (opcional) → Procedimentos.");
    };

    const st = loadSt() || {};
    if (st.obrigOk) lockProcs(false);
  }

  // Init
  createPanel();
  log("✅ GDF_INAS v9: procedimento cadenciado com retry + pulo se não existe no convênio.");
})();
