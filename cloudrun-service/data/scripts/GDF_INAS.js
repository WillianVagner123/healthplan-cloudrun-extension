/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V16__) return;
  window.__GDF_INAS_V16__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v16";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
  const normLow = (s) => norm(s).toLowerCase();

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

  function fireMouse(el) {
    if (!el) return false;
    const opts = { bubbles: true, cancelable: true, view: window };
    try { el.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch {}
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    return true;
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

  function readVisibleOptions(baseId) {
    return Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
      .filter(o => o && o.offsetParent !== null);
  }

  async function waitDropdownOptions(baseId, timeoutMs = 35000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const opts = readVisibleOptions(baseId);
      if (opts.length) return opts;
      await delay(120);
    }
    return null;
  }

  // ✅ espera “fim de processamento”
  async function waitNotBusy(scope = document, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const hasBusy =
        !!scope.querySelector("[aria-busy='true']") ||
        !!scope.querySelector("[data-loading='true']") ||
        Array.from(scope.querySelectorAll("button")).some(b => {
          const txt = normLow(b.textContent);
          return b.disabled && txt.includes("adicionar");
        });
      if (!hasBusy) return true;
      await delay(140);
    }
    return false;
  }

  // =========================
  // Config
  // =========================
  const DEFAULTS = {
    crm_solicitante: "22416",
    crm_executante:  "22416",
  };

  const SPEED_DEFAULT = 2000; // ✅ começa em 2000ms

  function getCfg() {
    const st = loadSt() || {};
    const cfg = st.cfg || {};
    return {
      crm_solicitante: norm(cfg.crm_solicitante) || DEFAULTS.crm_solicitante,
      crm_executante:  norm(cfg.crm_executante)  || DEFAULTS.crm_executante,
      speed_ms: Number(cfg.speed_ms) > 0 ? Number(cfg.speed_ms) : SPEED_DEFAULT,
    };
  }

  function setCfg(partial) {
    const st = loadSt() || {};
    st.cfg = Object.assign({}, st.cfg || {}, partial);
    saveSt(st);
  }

  function readPanelInputsAndPersist() {
    const crmSol = document.getElementById("gdfCrmSol");
    const crmExe = document.getElementById("gdfCrmExe");
    const speed  = document.getElementById("gdfSpeed");
    const speedLabel = document.getElementById("gdfSpeedLabel");

    const cur = getCfg();

    const vSol = crmSol ? (norm(crmSol.value).replace(/\D/g, "") || DEFAULTS.crm_solicitante) : cur.crm_solicitante;
    const vExe = crmExe ? (norm(crmExe.value).replace(/\D/g, "") || DEFAULTS.crm_executante)  : cur.crm_executante;

    let vSpd = cur.speed_ms;
    if (speed) {
      vSpd = Math.max(200, Math.min(3000, Number(speed.value) || SPEED_DEFAULT));
      if (speedLabel) speedLabel.textContent = `${vSpd}ms`;
    }

    if (crmSol) crmSol.value = vSol;
    if (crmExe) crmExe.value = vExe;

    setCfg({ crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd });
    return { crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd };
  }

  // =========================
  // React-select: abrir certo + digitar + aguardar + clicar opção
  // =========================
  function openReactSelectById(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return false;

    const baseId = baseIdFromInputId(inputId);
    const placeholder = baseId ? document.getElementById(`${baseId}-placeholder`) : null;

    // ✅ prioridade: placeholder (seu caso do react-select-23-placeholder)
    if (placeholder && placeholder.offsetParent !== null) {
      fireMouse(placeholder);
      input.focus();
      return true;
    }

    // fallback: control/indicator/container
    const container =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;

    const indicator =
      container?.querySelector("[class*='indicatorContainer']") ||
      container?.querySelector("svg")?.closest("div");

    if (indicator && indicator.offsetParent !== null) {
      fireMouse(indicator);
      input.focus();
      return true;
    }

    const control =
      container?.querySelector("[role='combobox']") ||
      container?.querySelector("[class*='control']") ||
      container;

    if (control && control.offsetParent !== null) {
      fireMouse(control);
      input.focus();
      return true;
    }

    input.focus();
    fireMouse(input);
    return true;
  }

  async function typeReactSelect(inputId, text, typeDelay = 55) {
    const input = document.getElementById(inputId);
    if (!input) throw new Error(`Input não encontrado: ${inputId}`);

    input.focus();
    setNativeValue(input, "");
    fireInput(input);
    await delay(100);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }
    return true;
  }

  // ✅ REGRA: não usa ENTER. Só clica em opção que CONTÉM o que foi digitado
  async function fillReactSelectClickMatch({
    id,
    text,
    mustContainTyped = true,       // ✅ sua regra
    optionExact = null,
    optionStartsWith = null,
    optionContains = null,
    waitOptionsMs = 35000,
    typeDelay = 55,
    settleMs = 700
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 30000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    openReactSelectById(id);
    await delay(240);

    await typeReactSelect(id, text, typeDelay);

    const baseId = baseIdFromInputId(id);
    if (!baseId) throw new Error(`Sem baseId do react-select: ${id}`);

    // ✅ espera dropdown carregar opções
    const opts = await waitDropdownOptions(baseId, waitOptionsMs);
    if (!opts) throw new Error(`Timeout: dropdown sem opções em ${id}`);

    const typed = normLow(text);
    const n = (s) => normLow(s);

    const exact = optionExact ? n(optionExact) : null;
    const starts = optionStartsWith ? n(optionStartsWith) : null;
    const contains = optionContains ? n(optionContains) : null;

    // filtro: se mustContainTyped, só aceita opção que contenha o digitado
    const eligible = mustContainTyped
      ? opts.filter(o => n(o.textContent).includes(typed))
      : opts;

    const pick =
      (exact ? eligible.find(o => n(o.textContent) === exact) : null) ||
      (starts ? eligible.find(o => n(o.textContent).startsWith(starts)) : null) ||
      (contains ? eligible.find(o => n(o.textContent).includes(contains)) : null) ||
      eligible[0] ||
      null;

    if (!pick) throw new Error(`Nenhuma opção compatível em ${id} para "${text}"`);

    pick.scrollIntoView?.({ block: "center" });
    await delay(80);
    pick.click();
    await delay(settleMs);

    return true;
  }

  // =========================
  // Obrigatórios
  // =========================
  function buildMandatory() {
    const cfg = getCfg();
    return {
      prof_solicitante: { id: "react-select-3-input",  text: cfg.crm_solicitante, mustContainTyped: true },
      cbo_solicitante:  { id: "react-select-21-input", text: "999999", mustContainTyped: true },

      regime:           { id: "react-select-5-input",  text: "01", mustContainTyped: true },
      especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA", mustContainTyped: false, optionContains: "clinica" },
      carater:          { id: "react-select-7-input",  text: "1", mustContainTyped: true },

      tipo_consulta:    { id: "react-select-9-input",  text: "04", mustContainTyped: false, optionExact: "04 - Consulta" },

      cid:              { id: "react-select-11-input", text: "E88", mustContainTyped: true },

      prof_exec:        { id: "react-select-16-input", text: cfg.crm_executante, mustContainTyped: true },
      cbo_exec:         { id: "react-select-22-input", text: "999999", mustContainTyped: true },
    };
  }

  // =========================
  // Procedimentos
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input";
  const PROC_INPUT_ID  = "react-select-23-input"; // ✅ FORÇADO (seu HTML)
  const QTY_DEFAULT = "1";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

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

  async function ensureTabela22() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const already = tabelaSingleValueText();
        if (already.startsWith("22 -")) return true;

        await fillReactSelectClickMatch({
          id: TABLE_INPUT_ID,
          text: "22",
          mustContainTyped: true,
          optionStartsWith: "22 -",
          waitOptionsMs: 35000,
          settleMs: 800,
        });

        await delay(240);

        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          log("✅ Tabela selecionada:", picked);
          return true;
        }

        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/3 falhou Tabela 22:`, e?.message || e);
        await delay(900);
      }
    }
    throw new Error("Não consegui selecionar a Tabela 22.");
  }

  function getProcedureBlock(procInputEl) {
    let node = procInputEl;
    for (let i = 0; i < 12 && node; i++) {
      const t = normLow(node.textContent || "");
      if (t.includes("tabela") && (t.includes("código e descrição") || t.includes("procedimento"))) {
        return node;
      }
      node = node.parentElement;
    }
    return procInputEl.closest(".css-b62m3t-container")?.parentElement || procInputEl.closest("div") || document;
  }

  function findQtyInputNearProcedure(procInputEl) {
    const block = getProcedureBlock(procInputEl);
    const nums = Array.from(block.querySelectorAll("input[type='number']")).filter(n => n && n.offsetParent !== null);

    if (nums.length === 1) return nums[0];

    // fallback: tenta o mais próximo do campo procedimento (mesmo "columns rows" etc.)
    const near = procInputEl.closest("div")?.querySelector("input[type='number']");
    if (near && near.offsetParent !== null) return near;

    return nums[0] || null;
  }

  function findAddButtonNear(procInputEl) {
    const block = getProcedureBlock(procInputEl);
    const buttons = Array.from(block.querySelectorAll("button")).filter(b => b.offsetParent !== null);

    return buttons.find(b => normLow(b.textContent) === "adicionar") ||
           buttons.find(b => normLow(b.textContent).includes("adicionar")) ||
           null;
  }

  function getProceduresTableEl() {
    // seu print: table.sc-TtZHG
    return document.querySelector("table.sc-TtZHG");
  }

  function tableHasCode(code) {
    const tbl = getProceduresTableEl();
    if (!tbl) return false;
    return Array.from(tbl.querySelectorAll("td"))
      .some(td => norm(td.textContent) === String(code));
  }

  async function waitCodeInTable(code, timeoutMs = 35000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (tableHasCode(code)) return true;
      await delay(140);
    }
    return false;
  }

  async function insertOneProcedure(code) {
    const { speed_ms } = getCfg();

    await ensureTabela22();
    await delay(Math.min(400, speed_ms));

    const procEl = await waitFor(() => document.getElementById(PROC_INPUT_ID), 25000);
    if (!procEl) throw new Error("Campo de Procedimento (react-select-23-input) não encontrado.");

    const block = getProcedureBlock(procEl);

    // ✅ PROCEDIMENTO: clicar opção que CONTÉM o código digitado (sem ENTER)
    await fillReactSelectClickMatch({
      id: PROC_INPUT_ID,
      text: String(code),
      mustContainTyped: true,
      optionStartsWith: String(code),
      optionContains: String(code),
      waitOptionsMs: 35000,
      typeDelay: 65,
      settleMs: Math.max(900, Math.round(speed_ms * 0.6)),
    });

    await delay(Math.min(350, speed_ms));

    // ✅ quantidade (somente do bloco do procedimento)
    const qty = findQtyInputNearProcedure(procEl);
    if (!qty) throw new Error("Quantidade não encontrada no bloco do procedimento.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(90);
    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);

    await delay(Math.min(350, speed_ms));

    // ✅ adicionar
    const addBtn = findAddButtonNear(procEl);
    if (!addBtn) throw new Error("Botão Adicionar não encontrado no bloco do procedimento.");

    addBtn.click();

    // ✅ espera o processamento terminar
    await waitNotBusy(block, 25000);

    // ✅ só avança quando aparecer na tabela
    const appeared = await waitCodeInTable(code, 35000);
    if (!appeared) {
      throw new Error("Cliquei em Adicionar, mas o código não apareceu na tabela (não confirmou / não carregou).");
    }

    await delay(Math.min(300, speed_ms));
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

  async function runObrigatorios() {
    try {
      readPanelInputsAndPersist();
      const M = buildMandatory();
      const { speed_ms } = getCfg();

      setStatus("⏳ Preenchendo obrigatórios (clicando opção do dropdown)...");

      const order = [
        "prof_solicitante",
        "cbo_solicitante",
        "regime",
        "especialidade",
        "carater",
        "tipo_consulta",
        "cid",
        "prof_exec",
        "cbo_exec",
      ];

      for (const k of order) {
        const cfg = M[k];
        setStatus(`⌛ ${k}...`);

        await fillReactSelectClickMatch({
          id: cfg.id,
          text: cfg.text,
          mustContainTyped: cfg.mustContainTyped !== false,
          optionExact: cfg.optionExact || null,
          optionStartsWith: cfg.optionStartsWith || null,
          optionContains: cfg.optionContains || null,
          waitOptionsMs: 35000,
          settleMs: Math.max(900, Math.round(speed_ms * 0.6)),
        });

        await delay(Math.min(450, speed_ms));
      }

      const st = loadSt() || {};
      st.obrigOk = true;
      st.obrigOkAt = new Date().toISOString();
      saveSt(st);

      lockProcs(false);
      setStatus("✅ Obrigatórios OK. Pode inserir procedimentos.");
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
      alert("Primeiro clique em ✅ Preencher obrigatórios.");
      return;
    }

    const codes = getCodes();
    if (!codes.length) {
      alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      return;
    }

    if (runProcedimentos.__running) return;
    runProcedimentos.__running = true;

    try {
      readPanelInputsAndPersist();
      const { speed_ms } = getCfg();

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          await insertOneProcedure(code);
          log("✅ Inserido:", code);
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(speed_ms);
        }

        await delay(Math.min(600, speed_ms));
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
      runProcedimentos.__running = false;
    }
  }

  function createPanel() {
    if (document.getElementById("gdf-inas-panel")) return;

    const st = loadSt() || {};
    const cfg = st.cfg || {};
    const crmSolInit = norm(cfg.crm_solicitante) || DEFAULTS.crm_solicitante;
    const crmExeInit = norm(cfg.crm_executante)  || DEFAULTS.crm_executante;
    const speedInit  = Number(cfg.speed_ms) > 0 ? Number(cfg.speed_ms) : SPEED_DEFAULT;

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
      width: 380px;
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-weight:900">GDF INAS</div>
        <button id="btnReset" title="Reset" style="
          padding:6px 10px;border-radius:10px;border:none;cursor:pointer;
          background:#1f2937;color:#e5e7eb;font-weight:900
        ">↺</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;opacity:.9;margin-bottom:4px">CRM Solicitante</div>
          <input id="gdfCrmSol" inputmode="numeric" value="${crmSolInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
        <div>
          <div style="font-size:11px;opacity:.9;margin-bottom:4px">CRM Executante</div>
          <input id="gdfCrmExe" inputmode="numeric" value="${crmExeInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
      </div>

      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:11px;opacity:.9">Cadência</div>
          <div id="gdfSpeedLabel" style="font-size:11px;opacity:.9">${speedInit}ms</div>
        </div>
        <input id="gdfSpeed" type="range" min="200" max="3000" step="50" value="${speedInit}"
          style="width:100%" />
        <div style="font-size:11px;opacity:.75;margin-top:4px">
          ✅ Sem ENTER. Espera dropdown e clica na opção.
        </div>
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
      ">✅ Preencher obrigatórios</button>

      <button id="btnProcs" disabled style="
        width:100%;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#94a3b8;
        color:#0b1220;
        font-weight:900
      ">🧪 Inserir Procedimentos</button>

      <div id="gdfStatus" style="margin-top:10px;font-size:12px;opacity:.92;line-height:1.35">
        Pronto.
      </div>
    `;

    document.body.appendChild(panel);

    const autosave = () => {
      const cfg2 = readPanelInputsAndPersist();
      setStatus(`💾 Salvo. CRM Sol: ${cfg2.crm_solicitante} | CRM Exec: ${cfg2.crm_executante} | Vel: ${cfg2.speed_ms}ms`);
    };

    panel.querySelector("#gdfCrmSol").addEventListener("change", autosave);
    panel.querySelector("#gdfCrmExe").addEventListener("change", autosave);
    panel.querySelector("#gdfCrmSol").addEventListener("blur", autosave);
    panel.querySelector("#gdfCrmExe").addEventListener("blur", autosave);
    panel.querySelector("#gdfSpeed").addEventListener("input", autosave);
    panel.querySelector("#gdfSpeed").addEventListener("change", autosave);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;

    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      lockProcs(true);
      setStatus("Reset feito. Recarregue a página.");
    };

    const st2 = loadSt() || {};
    if (st2.obrigOk) lockProcs(false);
  }

  createPanel();
  log("✅ GDF_INAS v16: sem ENTER + espera dropdown + procedimento fixo no react-select-23 + só avança quando aparecer na tabela.");
})();
