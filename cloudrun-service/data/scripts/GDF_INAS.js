/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  // =========================
  // Guard
  // =========================
  if (window.__GDF_INAS_V8__) return;
  window.__GDF_INAS_V8__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v8";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
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

  // ✅ espera “fim de processamento” (fallback)
  async function waitNotBusy(scope = document, timeoutMs = 8000) {
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

    // ✅ clicar opção
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

      if (!pick) {
        console.log("GDF_INAS: opções disponíveis:", opts.map(o => norm(o.textContent)));
        throw new Error(`Não achei opção alvo no dropdown (${id}).`);
      }

      pick.scrollIntoView?.({ block: "center" });
      await delay(50);
      pick.click();
      await delay(postWaitAfterPickMs);
      return true;
    }

    // padrão: ENTER
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

    // ✅ mais estável por clique
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
  const CODES_FALLBACK = []; // se quiser, coloque códigos fixos aqui
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

  function findQtyInputNearProcedures() {
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']"));
    return nums.find(n => n.offsetParent !== null) || nums[0] || null;
  }

  function findAddButton() {
    const btn = document.queryOfSelector?.(ADD_BUTTON_SELECTOR); // typo-safe? fallback below
    // (alguns browsers não têm queryOfSelector; então usamos querySelector de verdade)
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

  // =========================
  // ✅ FAST MODE: TABELA 22 cacheada + espera por “linha adicionada”
  // =========================
  let __TABELA_22_OK__ = false;

  function getProcedureRowsCount() {
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;

    // 1) tabela clássica
    const trs = scope.querySelectorAll("table tbody tr");
    if (trs?.length) return trs.length;

    // 2) role row
    const roleRows = scope.querySelectorAll("[role='row']");
    if (roleRows?.length) return roleRows.length;

    // 3) fallback por itens/linhas genéricas
    const items = scope.querySelectorAll("[class*='row'], [class*='item'], li");
    const visibleItems = Array.from(items).filter(x => x.offsetParent !== null);
    return visibleItems.length || 0;
  }

  async function waitRowAdded(prevCount, timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const now = getProcedureRowsCount();
      if (now > prevCount) return true;
      await delay(80);
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
          waitBeforeEnterMs: 200,
          waitOptionsMs: 12000,
          typeDelay: 0,

          clickOption: true,
          optionStartsWith: "22 -",
          postWaitAfterPickMs: 150
        });

        await delay(150);

        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          __TABELA_22_OK__ = true;
          log("✅ Tabela selecionada:", picked);
          return true;
        }

        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/2 falhou ao selecionar Tabela 22 (fast):`, e?.message || e);
        await delay(200);
      }
    }

    throw new Error("Não consegui selecionar a Tabela 22 (fast).");
  }

  async function insertOneProcedure_fast(code) {
    await ensureTabela22_fast();

    const before = getProcedureRowsCount();

    // ✅ Procedimento por clique na opção (mais rápido e confiável)
    await fillReactSelect({
      id: PROC_INPUT_ID,
      text: String(code),
      mode: "wait",
      waitBeforeEnterMs: 120,
      waitOptionsMs: 15000,
      typeDelay: 0,

      clickOption: true,
      optionStartsWith: String(code),
      postWaitAfterPickMs: 120
    });

    const qty = findQtyInputNearProcedures();
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);

    const addBtn = findAddButton();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    addBtn.click();

    const ok = await waitRowAdded(before, 12000);
    if (!ok) {
      const proc = document.getElementById(PROC_INPUT_ID);
      const scope = proc?.closest("form") || document;
      await waitNotBusy(scope, 5000);
    }

    await delay(80);
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

  // 🔒 seu fluxo antigo (mantém gate por obrigatórios)
  async function runProcedimentos() {
    const st = loadSt() || {};
    if (!st.obrigOk) {
      alert("Primeiro clique em ✅ Preencher obrigatórios (guia).");
      return;
    }
    await runProcedimentos_independente(true);
  }

  // ✅ novo fluxo independente (SEM depender de obrigatórios)
  // se keepGate=true, ele roda igual ao antigo; se keepGate=false, roda livre.
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
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          await insertOneProcedure_fast(code);
          log("✅ Inserido:", code);
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(200);
        }

        await delay(40);
      }

      if (fails.length) {
        setStatus(`⚠️ Finalizado com falhas: ${fails.length}/${codes.length}`);
        alert("Finalizado com falhas. Veja console (F12) para detalhes.");
        console.table(fails);
      } else {
        setStatus(`🎉 Procedimentos inseridos! Total: ${codes.length}`);
        alert("🎉 Procedimentos inseridos com sucesso!");
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
        Speed v8: <b>Tabela 22 cacheada</b> + procedimento por <b>clique na opção</b> + espera por <b>linha adicionada</b>.<br/>
        Se começar a falhar por estar rápido: aumente <code>postWaitAfterPickMs</code> do PROC (120 → 250).
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;

    // ✅ independente: não usa localStorage gate
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
  log("✅ GDF_INAS v8: procedimentos rápidos + desacoplados dos obrigatórios.");
})();
