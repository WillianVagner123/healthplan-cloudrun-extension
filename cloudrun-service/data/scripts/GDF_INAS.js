/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["label", "input", "button"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS__) return;
  window.__GDF_INAS__ = true;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  // =========================================================
  // ✅ CONFIG — AJUSTE AQUI (campos obrigatórios)
  // =========================================================
  // Chave = texto que aparece no label do campo
  // value = o texto que você quer selecionar
  //
  // DICA: use um pedaço do texto que aparece na opção (ex: "Ambulatorial", "Eletivo", "Consulta")
  const MANDATORY_DEFAULTS = [
    { labelContains: "Regime de Atendimento",   value: "Ambulatorial" }, // ex: "01 – Ambulatorial"
    { labelContains: "Especialidade da guia",   value: "CLINICA MEDICA" },
    { labelContains: "Caráter do Atendimento",  value: "Eletivo" },
    { labelContains: "Tipo de Consulta",        value: "Consulta" },     // ajuste se for "04 - Consulta"
    { labelContains: "Tipo de Atendimento",     value: "" },             // se você não quiser preencher, deixe ""
    { labelContains: "Indicação clínica",       value: "" }              // se existir e você quiser, coloque um valor
  ];

  // =========================================================
  // ✅ CONFIG — Procedimentos
  // =========================================================
  const TABLE_PICK_MODE    = "index"; // "index" | "text"
  const TABLE_OPTION_INDEX = 3;       // option-3 (como você fazia)
  const TABLE_OPTION_TEXT  = "22";    // usado se mode="text"
  const QTY_DEFAULT = "1";

  // fallback se não vier do kit/payload
  const CODES_FALLBACK = []; // ex: ["40301087","40301150"]

  // payload do Maskara (se você envia codes no botão Executar Kit)
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];

  function getCodes() {
    if (codesFromPayload.length) return codesFromPayload;
    return CODES_FALLBACK.map(String);
  }

  // =========================================================
  // ✅ Estado persistente
  // =========================================================
  const STORE_KEY = "gdf_inas_state_v2";
  const loadSt = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  let PROCS_RUNNING = false;

  // =========================================================
  // ✅ UI Painel
  // =========================================================
  function createPanel() {
    const existing = document.getElementById("gdf-inas-panel");
    if (existing) return;

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
      width: 310px;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:900">GDF INAS</div>
        <button id="btnReset" title="Reset" style="
          padding:6px 10px;border-radius:10px;border:none;cursor:pointer;
          background:#1f2937;color:#e5e7eb;font-weight:900
        ">↺</button>
      </div>

      <button id="btnObrigatorios" style="
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
        ✅ Preencher campos obrigatórios
      </button>

      <button id="btnProcedimentos" disabled style="
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
        Preencha o beneficiário manualmente. Depois clique em “Preencher campos obrigatórios”.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrigatorios").onclick = runMandatory;
    panel.querySelector("#btnProcedimentos").onclick = runProcedimentos;
    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      setStatus("Reset feito. Preencha beneficiário manualmente e clique em “Preencher campos obrigatórios”.");
      lockProcsButton(true);
    };

    const st = loadSt() || {};
    if (st.mandatoryOk) {
      lockProcsButton(false);
      setStatus("✅ Obrigatórios já preenchidos/marcados. Pode inserir procedimentos.");
    } else {
      lockProcsButton(true);
    }
  }

  function setStatus(txt) {
    const el = document.getElementById("gdfStatus");
    if (el) el.textContent = txt;
  }

  function lockProcsButton(lock) {
    const btn = document.getElementById("btnProcedimentos");
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

  // =========================================================
  // ✅ Helpers React-Select por LABEL
  // =========================================================
  function norm(s) { return (s || "").toString().replace(/\s+/g, " ").trim(); }

  function fire(el, type) {
    el?.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function ghostType(el, text, d = 14) {
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    for (const c of String(text)) {
      el.value += c;
      fire(el, "input");
      await delay(d);
    }
    fire(el, "change");
  }

  async function waitFor(fnOrSel, timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = (typeof fnOrSel === "string") ? document.querySelector(fnOrSel) : fnOrSel();
      if (el) return el;
      await delay(120);
    }
    return null;
  }

  function findFieldBoxByLabel(labelText) {
    const labels = Array.from(document.querySelectorAll("label"));
    const lab = labels.find(l => norm(l.textContent).toLowerCase().includes(labelText.toLowerCase()));
    if (!lab) return null;
    return lab.closest("div") || lab.parentElement || null;
  }

  function findReactSelectInputWithin(container) {
    if (!container) return null;
    return container.querySelector("input[id^='react-select-'][id$='-input']") || null;
  }

  function baseIdFromInput(input) {
    const id = input?.id || "";
    const m = id.match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  async function openSelect(input) {
    input.focus();
    input.click();
    fire(input, "focus");
    fire(input, "mousedown");
    await delay(120);
  }

  async function waitOptions(baseId, timeoutMs = 12000) {
    return await waitFor(() => {
      const opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`));
      return opts.length ? opts : null;
    }, timeoutMs);
  }

  async function pickOption(baseId, { index = 0, text = null } = {}) {
    const opts = await waitOptions(baseId, 12000);
    if (!opts) return { ok: false, reason: "no_options" };

    let chosen = null;
    if (text) {
      const t = text.toLowerCase();
      chosen = opts.find(o => norm(o.textContent).toLowerCase().includes(t)) || null;
    }
    if (!chosen) chosen = opts[index] || opts[0] || null;
    if (!chosen) return { ok: false, reason: "no_choice" };

    chosen.scrollIntoView?.({ block: "center" });
    await delay(80);
    chosen.click();
    return { ok: true, chosenText: norm(chosen.textContent), total: opts.length };
  }

  async function setSelectByLabel({ labelContains, value }) {
    if (!value) return { ok: true, skipped: true, labelContains };

    const box = findFieldBoxByLabel(labelContains);
    if (!box) return { ok: false, reason: "label_not_found", labelContains };

    const input = findReactSelectInputWithin(box);
    if (!input) return { ok: false, reason: "select_input_not_found", labelContains };

    const baseId = baseIdFromInput(input);
    if (!baseId) return { ok: false, reason: "baseid_missing", id: input.id, labelContains };

    await openSelect(input);
    await ghostType(input, value, 12);
    await delay(450);

    // tenta escolher por texto primeiro; se não achar, cai no primeiro
    const picked = await pickOption(baseId, { text: value, index: 0 });
    if (!picked.ok) return { ok: false, reason: "pick_failed", labelContains, value, detail: picked };

    return { ok: true, labelContains, chosen: picked.chosenText };
  }

  // =========================================================
  // ✅ Botão: preencher obrigatórios (NÃO mexe em CPF/carteirinha)
  // =========================================================
  async function runMandatory() {
    try {
      setStatus("⏳ Preenchendo campos obrigatórios...");
      const results = [];
      for (const cfg of MANDATORY_DEFAULTS) {
        const r = await setSelectByLabel(cfg);
        results.push(r);
        if (!r.ok) warn("Obrigatório falhou:", r);
        await delay(200);
      }

      // Se algum obrigatório configurado (value não vazio) falhou, avisa mas permite seguir
      const hardFails = results.filter(r => !r.ok && !r.skipped);
      if (hardFails.length) {
        setStatus(`⚠️ Alguns campos não foram preenchidos (${hardFails.length}). Verifique e clique novamente se precisar.`);
      } else {
        setStatus("✅ Campos obrigatórios preenchidos.");
      }

      const st = loadSt() || {};
      st.mandatoryOk = true;
      st.mandatoryOkAt = new Date().toISOString();
      saveSt(st);

      lockProcsButton(false);
      alert("✅ Obrigatórios preenchidos (ou marcados como OK). Agora pode inserir procedimentos.");

    } catch (e) {
      err(e);
      setStatus("❌ Erro ao preencher obrigatórios.");
      alert("Erro ao preencher obrigatórios: " + (e?.message || e));
    }
  }

  // =========================================================
  // 🧪 Procedimentos
  // =========================================================
  function procedureInputEnabled(input) {
    return !!input && !input.disabled && input.getAttribute("aria-disabled") !== "true";
  }

  function findQtyInput() {
    const box = findFieldBoxByLabel("Quantidade");
    if (box) {
      const inp = box.querySelector("input[type='number']");
      if (inp) return inp;
    }
    return document.querySelector("input[type='number']") || null;
  }

  function findAddButton() {
    const btnExact = Array.from(document.querySelectorAll("button"))
      .find(b => norm(b.textContent).toLowerCase() === "adicionar");
    if (btnExact) return btnExact;

    return Array.from(document.querySelectorAll("button"))
      .find(b => norm(b.textContent).toLowerCase().includes("adicionar")) || null;
  }

  async function ensureTableSelected() {
    const tableBox = findFieldBoxByLabel("Tabela");
    const tableInput = findReactSelectInputWithin(tableBox);
    if (!tableInput) return { ok: false, reason: "table_input_not_found" };

    await openSelect(tableInput);
    const baseId = baseIdFromInput(tableInput);
    if (!baseId) return { ok: false, reason: "table_baseid_missing" };

    const pick =
      TABLE_PICK_MODE === "text"
        ? await pickOption(baseId, { text: TABLE_OPTION_TEXT, index: 0 })
        : await pickOption(baseId, { index: TABLE_OPTION_INDEX });

    if (!pick.ok) return { ok: false, reason: "table_pick_failed", detail: pick };
    return { ok: true, chosen: pick.chosenText };
  }

  async function fillOneProcedure(code) {
    const tableBox = findFieldBoxByLabel("Tabela");
    const procBox  = findFieldBoxByLabel("Código e descrição");
    const tableInput = findReactSelectInputWithin(tableBox);
    const procInput  = findReactSelectInputWithin(procBox);

    if (!tableInput) return { ok: false, reason: "table_input_not_found" };
    if (!procInput)  return { ok: false, reason: "proc_input_not_found" };

    // garante tabela selecionada se procedimento estiver disabled
    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTableSelected();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };

      const enabled = await waitFor(() => procedureInputEnabled(procInput) ? true : null, 15000);
      if (!enabled) return { ok: false, reason: "proc_stayed_disabled" };
    }

    await openSelect(procInput);
    await ghostType(procInput, String(code), 14);
    await delay(550);

    const procBase = baseIdFromInput(procInput);
    if (!procBase) return { ok: false, reason: "proc_baseid_missing" };

    const pickProc = await pickOption(procBase, { index: 0 });
    if (!pickProc.ok) return { ok: false, reason: "proc_pick_failed", detail: pickProc };

    const qty = findQtyInput();
    if (!qty) return { ok: false, reason: "qty_not_found" };
    qty.focus();
    qty.value = "";
    fire(qty, "input"); fire(qty, "change");
    await ghostType(qty, QTY_DEFAULT, 10);

    const addBtn = findAddButton();
    if (!addBtn) return { ok: false, reason: "add_button_not_found" };
    addBtn.click();

    return { ok: true, picked: pickProc.chosenText };
  }

  async function runProcedimentos() {
    try {
      const st = loadSt() || {};
      if (!st.mandatoryOk) {
        alert("Preencha o beneficiário manualmente e clique em “Preencher campos obrigatórios” antes.");
        return;
      }

      if (PROCS_RUNNING) return;
      PROCS_RUNNING = true;

      const codes = getCodes();
      if (!codes.length) {
        PROCS_RUNNING = false;
        return alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      }

      setStatus(`🧪 Inserindo procedimentos... (0/${codes.length})`);

      const t = await ensureTableSelected();
      if (!t.ok) throw new Error("Não consegui selecionar Tabela.");
      log("✅ Tabela:", t.chosen);

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setStatus(`🧪 Inserindo... (${i + 1}/${codes.length}) ${code}`);

        const r = await fillOneProcedure(code);
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
        alert("Finalizado com falhas. Veja o console (F12) para detalhes.");
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

  // =========================================================
  // Init
  // =========================================================
  createPanel();
  log("✅ Painel carregado (Obrigatórios + Procedimentos).");
})();
