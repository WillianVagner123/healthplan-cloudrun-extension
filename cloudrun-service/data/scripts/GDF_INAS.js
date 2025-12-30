/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["label", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS__) return;
  window.__GDF_INAS__ = true;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  // =========================
  // ✅ CONFIG (Obrigatórios — por ID, igual VBA)
  // =========================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  type: "22416",   pickContains: "22416" },
    cbo_solicitante:  { id: "react-select-21-input", type: "999999",  pickContains: "999999" },

    regime:           { id: "react-select-5-input",  type: "01",      pickContains: "Ambulatorial" },
    especialidade:    { id: "react-select-6-input",  type: "CLINICA MEDICA", pickContains: "CLINICA" },
    carater:          { id: "react-select-7-input",  type: "1",       pickContains: "Eletivo" },

    tipo_consulta:    { id: "react-select-9-input",  type: "04 - Consulta", pickExact: "04 - Consulta" },
    cid:              { id: "react-select-11-input", type: "E88",     pickContains: "E88" },

    prof_exec:        { id: "react-select-16-input", type: "22416",   pickContains: "22416" },
    cbo_exec:         { id: "react-select-22-input", type: "999999",  pickContains: "999999" },
  };

  // =========================
  // ✅ CONFIG (Procedimentos)
  // =========================
  // Tabela e Procedimento na tela de "Adicionar procedimento"
  const TABLE_INPUT_ID = "react-select-18-input";
  const PROC_INPUT_ID  = "react-select-19-input";

  // selecione a opção 22 (tabela)
  const TABLE_PICK_CONTAINS = "22 - Procedimentos";

  // quantidade padrão
  const QTY_DEFAULT = "1";

  // códigos vindos do Maskara (Executar Kit) OU fallback
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = []; // se quiser fixo: ["40301087","40301150"]

  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK).map(String);

  // =========================
  // ✅ Estado
  // =========================
  const STORE_KEY = "gdf_inas_state_v3";
  const loadSt = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  let PROCS_RUNNING = false;

  // =========================
  // ✅ UI
  // =========================
  function createPanel() {
    if (document.getElementById("gdf-inas-panel")) return;

    const panel = document.createElement("div");
    panel.id = "gdf-inas-panel";
    panel.style = `
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
      width: 320px;
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
      ">
        ✅ Preencher obrigatórios (guia)
      </button>

      <button id="btnProcs" disabled style="
        width:100%;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#94a3b8;
        color:#0b1220;
        font-weight:900
      ">
        🧪 Inserir Procedimentos
      </button>

      <div id="gdfStatus" style="margin-top:10px;font-size:12px;opacity:.92;line-height:1.35">
        Beneficiário (CPF/carteirinha) é manual. Depois clique em “Preencher obrigatórios”.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;
    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      setStatus("Reset feito. Beneficiário manual → Preencher obrigatórios.");
      lockProcs(true);
    };

    const st = loadSt() || {};
    if (st.obrigOk) {
      lockProcs(false);
      setStatus("✅ Obrigatórios já marcados. Pode inserir procedimentos.");
    } else {
      lockProcs(true);
    }
  }

  function setStatus(txt) {
    const el = document.getElementById("gdfStatus");
    if (el) el.textContent = txt;
  }

  function lockProcs(lock) {
    const btn = document.getElementById("btnProcs");
    if (!btn) return;
    btn.disabled = !!lock;
    if (lock) {
      btn.style.background = "#94a3b8";
      btn.style.color = "#0b1220";
      btn.style.cursor = "not-allowed";
    } else {
      btn.style.background = "#22c55e";
      btn.style.color = "#07210f";
      btn.style.cursor = "pointer";
    }
  }

  // =========================
  // ✅ Helpers React-Select (robusto)
  // =========================
  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

  function fire(el, type) {
    el?.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function waitFor(getter, timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs_toggle(timeoutMs)) { // prevent accidental undefined
      const el = (typeof getter === "string") ? document.querySelector(getter) : getter();
      if (el) return el;
      await delay(120);
    }
    return null;

    function timeoutMs_toggle(t){ return typeof t === "number" ? t : 20000; }
  }

  async function openSelect(input) {
    input.focus();
    input.click();
    fire(input, "focus");
    fire(input, "mousedown");
    await delay(120);
  }

  async function ghostType(input, text, charDelay = 14) {
    input.focus();
    input.value = "";
    fire(input, "input"); fire(input, "change");
    for (const ch of String(text)) {
      input.value += ch;
      fire(input, "input");
      await delay(charDelay);
    }
    fire(input, "change");
  }

  function baseIdFromInput(input) {
    const id = input?.id || "";
    const m = id.match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  async function getOptions(baseId, timeoutMs = 12000) {
    return await waitFor(() => {
      const opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`));
      return opts.length ? opts : null;
    }, timeoutMs);
  }

  async function pickOption(baseId, { contains = null, exact = null, index = 0 } = {}) {
    const opts = await getOptions(baseId, 12000);
    if (!opts) return { ok: false, reason: "no_options" };

    let chosen = null;
    if (exact) {
      const ex = exact.toLowerCase();
      chosen = opts.find(o => norm(o.textContent).toLowerCase() === ex) || null;
    }
    if (!chosen && contains) {
      const c = contains.toLowerCase();
      chosen = opts.find(o => norm(o.textContent).toLowerCase().includes(c)) || null;
    }
    if (!chosen) chosen = opts[index] || opts[0] || null;
    if (!chosen) return { ok: false, reason: "no_choice" };

    chosen.scrollIntoView?.({ block: "center" });
    await delay(80);
    chosen.click();
    return { ok: true, chosenText: norm(chosen.textContent), total: opts.length };
  }

  async function selectById({ id, type, pickContains, pickExact }) {
    const input = await waitFor(() => document.getElementById(id), 25000);
    if (!input) throw new Error(`Não achei o campo ${id}`);

    await openSelect(input);
    await ghostType(input, type, 12);
    await delay(500);

    const baseId = baseIdFromInput(input);
    if (!baseId) throw new Error(`baseId não encontrado para ${id}`);

    const picked = await pickOption(baseId, { exact: pickExact || null, contains: pickContains || null, index: 0 });
    if (!picked.ok) throw new Error(`Não consegui selecionar opção para ${id}`);

    return picked.chosenText;
  }

  // =========================
  // ✅ Obrigatórios (guia)
  // =========================
  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios da guia...");
      // Beneficiário é manual — não fazemos nada aqui

      await selectById(MANDATORY.prof_solicitante);
      await selectById(MANDATORY.cbo_solicitante);

      await selectById(MANDATORY.regime);
      await selectById(MANDATORY.especialidade);
      await selectById(MANDATORY.carater);

      await selectById(MANDATORY.tipo_consulta);
      await selectById(MANDATORY.cid);

      await selectById(MANDATORY.prof_exec);
      await selectById(MANDATORY.cbo_exec);

      const st = loadSt() || {};
      st.obrigOk = true;
      st.obrigOkAt = new Date().toISOString();
      saveSt(st);

      lockProcs(false);
      setStatus("✅ Obrigatórios preenchidos. Agora pode inserir procedimentos.");
      alert("✅ Obrigatórios preenchidos. Agora pode inserir procedimentos.");
    } catch (e) {
      err(e);
      setStatus("❌ Erro ao preencher obrigatórios.");
      alert("Erro nos obrigatórios: " + (e?.message || e));
    }
  }

  // =========================
  // ✅ Procedimentos
  // =========================
  function procedureInputEnabled(input) {
    return !!input && !input.disabled && input.getAttribute("aria-disabled") !== "true";
  }

  function findQtyInput() {
    // preferir input number dentro do bloco de "Quantidade"
    const qtyByContainer = document.querySelector("input[type='number']");
    return qtyByContainer || null;
  }

  function findAddButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const byText = buttons.find(b => norm(b.textContent).toLowerCase() === "adicionar")
               || buttons.find(b => norm(b.textContent).toLowerCase().includes("adicionar"));
    return byText || null;
  }

  async function ensureTabela22() {
    const tableInput = await waitFor(() => document.getElementById(TABLE_INPUT_ID), 25000);
    if (!tableInput) return { ok: false, reason: "table_input_not_found" };

    await openSelect(tableInput);
    await ghostType(tableInput, "22", 12);
    await delay(450);

    const baseId = baseIdFromInput(tableInput);
    if (!baseId) return { ok: false, reason: "table_baseid_missing" };

    // tenta pegar "22 - Procedimentos..." (ou qualquer 22)
    const picked = await pickOption(baseId, { contains: TABLE_PICK_CONTAINS, index: 0 });
    if (!picked.ok) return { ok: false, reason: "table_pick_failed", detail: picked };

    return { ok: true, chosen: picked.chosenText };
  }

  async function pickProcedure(code) {
    const procInput = await waitFor(() => document.getElementById(PROC_INPUT_ID), 25000);
    if (!procInput) return { ok: false, reason: "proc_input_not_found" };

    // se ainda estiver disabled, tabela não foi aplicada
    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTabela22();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };

      const enabled = await waitFor(() => procedureInputEnabled(procInput) ? true : null, 15000);
      if (!enabled) return { ok: false, reason: "proc_stayed_disabled" };
    }

    await openSelect(procInput);
    await ghostType(procInput, String(code), 14);
    await delay(600);

    const baseId = baseIdFromInput(procInput);
    if (!baseId) return { ok: false, reason: "proc_baseid_missing" };

    const picked = await pickOption(baseId, { index: 0 });
    if (!picked.ok) return { ok: false, reason: "proc_pick_failed", detail: picked };

    return { ok: true, chosen: picked.chosenText };
  }

  async function fillOne(code) {
    // 1) seleciona procedimento
    const p = await pickProcedure(code);
    if (!p.ok) return p;

    // 2) quantidade
    const qty = findQtyInput();
    if (!qty) return { ok: false, reason: "qty_not_found" };
    qty.focus();
    qty.value = "";
    fire(qty, "input"); fire(qty, "change");
    await ghostType(qty, QTY_DEFAULT, 10);
    await delay(150);

    // 3) adicionar
    const addBtn = findAddButton();
    if (!addBtn) return { ok: false, reason: "add_button_not_found" };
    addBtn.click();

    return { ok: true, picked: p.chosen };
  }

  async function runProcedimentos() {
    try {
      const st = loadSt() || {};
      if (!st.obrigOk) {
        alert("Primeiro clique em ✅ Preencher obrigatórios (guia). Beneficiário é manual.");
        return;
      }
      if (PROCS_RUNNING) return;
      PROCS_RUNNING = true;

      const codes = getCodes();
      if (!codes.length) {
        PROCS_RUNNING = false;
        alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
        return;
      }

      setStatus(`🧪 Selecionando Tabela 22...`);
      const t = await ensureTabela22();
      if (!t.ok) throw new Error("Não consegui selecionar a Tabela (22).");
      log("✅ Tabela:", t.chosen);

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        const r = await fillOne(code);
        if (!r.ok) {
          fails.push({ code, reason: r.reason, detail: r.detail || null });
          warn("Falha:", code, r);
          await delay(500);
          continue;
        }

        log("✅ Inserido:", code, "->", r.picked);
        await delay(700);
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
      PROCS_RUNNING = false;
    }
  }

  // =========================
  // Init
  // =========================
  createPanel();
  log("✅ Painel carregado (Obrigatórios + Procedimentos).");
})();
