/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V13__) return;
  window.__GDF_INAS_V13__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v13";
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

  function pressEnter(el) {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
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

  // ✅ espera “fim de processamento” após clicar Adicionar
  async function waitNotBusy(scope = document, timeoutMs = 20000) {
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
      await delay(140);
    }
    return false;
  }

  // =========================
  // Defaults + CRM configurável (auto-salva)
  // =========================
  const DEFAULTS = {
    crm_solicitante: "22416",
    crm_executante:  "22416",
  };

  const SPEED_DEFAULT = 900;

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
      vSpd = Math.max(200, Math.min(2000, Number(speed.value) || SPEED_DEFAULT));
      if (speedLabel) speedLabel.textContent = `${vSpd}ms`;
    }

    if (crmSol) crmSol.value = vSol;
    if (crmExe) crmExe.value = vExe;

    setCfg({ crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd });
    return { crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd };
  }

  // =========================
  // React-Select: abrir + digitar (ESSÊNCIA DO QUE FUNCIONAVA)
  // =========================
  function openReactSelect(input) {
    const container =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;

    const baseId = baseIdFromInputId(input.id);

    // ✅ tenta clicar no placeholder (o seu caso do react-select-23-placeholder)
    const placeholder = baseId ? document.getElementById(`${baseId}-placeholder`) : null;
    if (placeholder && placeholder.offsetParent !== null) return fireMouse(placeholder);

    // seta / indicador
    const indicator =
      container?.querySelector("[class*='indicatorContainer']") ||
      container?.querySelector("svg")?.closest("div");
    if (indicator && indicator.offsetParent !== null) return fireMouse(indicator);

    // control / combobox
    const control =
      container?.querySelector("[role='combobox']") ||
      container?.querySelector("[class*='control']") ||
      container;
    if (control && control.offsetParent !== null) return fireMouse(control);

    input.focus();
    return fireMouse(input);
  }

  async function typeReactSelect(input, text, typeDelay = 55) {
    input.focus();
    setNativeValue(input, "");
    fireInput(input);
    await delay(90);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }
  }

  // ✅ LOOSE: abre → digita → espera → ENTER (igual “o que funcionava”)
  async function fillReactSelectLoose({
    id,
    text,
    openDelayMs = 180,
    typeDelay = 55,
    waitBeforeEnterMs = 1000,
    settleMs = 350
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 12000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    openReactSelect(input);
    await delay(openDelayMs);

    await typeReactSelect(input, text, typeDelay);

    if (waitBeforeEnterMs > 0) await delay(waitBeforeEnterMs);
    pressEnter(input);
    await delay(settleMs);

    return true;
  }

  // ✅ Pick só para casos críticos (tipo_consulta e Tabela 22)
  function readVisibleOptions(baseId) {
    return Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
      .filter(o => o && o.offsetParent !== null);
  }

  async function fillReactSelectPick({
    id,
    text,
    optionStartsWith = null,
    optionContains = null,
    optionExact = null,
    waitOptionsMs = 30000,
    typeDelay = 55,
    settleMs = 550
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 20000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    openReactSelect(input);
    await delay(180);

    await typeReactSelect(input, text, typeDelay);

    const baseId = baseIdFromInputId(id);
    if (!baseId) {
      await delay(200);
      pressEnter(input);
      await delay(settleMs);
      return true;
    }

    const n = (s) => normLow(s);
    const exact = optionExact ? n(optionExact) : null;
    const starts = optionStartsWith ? n(optionStartsWith) : null;
    const contains = optionContains ? n(optionContains) : null;

    const t0 = Date.now();
    while (Date.now() - t0 < waitOptionsMs) {
      const opts = readVisibleOptions(baseId);

      const pick =
        (exact ? opts.find(o => n(o.textContent) === exact) : null) ||
        (starts ? opts.find(o => n(o.textContent).startsWith(starts)) : null) ||
        (contains ? opts.find(o => n(o.textContent).includes(contains)) : null);

      if (pick) {
        pick.scrollIntoView?.({ block: "center" });
        await delay(80);
        pick.click();
        await delay(settleMs);
        return true;
      }

      await delay(220);
    }

    // fallback: ENTER (não deixa travar)
    pressEnter(input);
    await delay(settleMs);
    return true;
  }

  // =========================
  // Obrigatórios (CRM dinâmico)
  // =========================
  function buildMandatory() {
    const cfg = getCfg();
    return {
      prof_solicitante: { id: "react-select-3-input",  text: cfg.crm_solicitante },
      cbo_solicitante:  { id: "react-select-21-input", text: "999999" },

      regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial" },
      especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA" },
      carater:          { id: "react-select-7-input",  text: "1 – Eletivo" },

      tipo_consulta: {
        id: "react-select-9-input",
        text: "04",
        optionExact: "04 - Consulta",
      },

      cid:              { id: "react-select-11-input", text: "E88" },

      prof_exec:        { id: "react-select-16-input", text: cfg.crm_executante },
      cbo_exec:         { id: "react-select-22-input", text: "999999" },
    };
  }

  // =========================
  // PROCEDIMENTOS (ESSÊNCIA DO SEU QUE FUNCIONAVA + fallback dinâmico)
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_FIXED_ID  = "react-select-23-input"; // o “clássico” que funcionava
  const QTY_DEFAULT = "1";

  // mantém sua estratégia de seletor forte
  const ADD_BUTTON_SELECTOR =
    "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-eNLTQs.dVUnNT > div.sc-JQDoe.eETcDf > button.sc-eQaGpr.byRRCL.button-add";

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

        await fillReactSelectPick({
          id: TABLE_INPUT_ID,
          text: "22",
          optionStartsWith: "22 -",
          waitOptionsMs: 30000,
          typeDelay: 55,
          settleMs: 550,
        });

        await delay(250);

        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          log("✅ Tabela selecionada:", picked);
          return true;
        }

        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/3 falhou Tabela 22:`, e?.message || e);
        await delay(650);
      }
    }
    throw new Error("Não consegui selecionar a Tabela 22.");
  }

  function findProcInputByLabel() {
    const needles = [
      "código e descrição do procedimento",
      "codigo e descricao do procedimento",
      "procedimento ou item",
      "procedimento"
    ];

    const labs = Array.from(document.querySelectorAll("label"))
      .filter(l => l.offsetParent !== null)
      .filter(l => needles.some(n => normLow(l.textContent).includes(n)));

    for (const lab of labs) {
      const root = lab.closest("div") || lab.parentElement || document;
      const inp = root.querySelector("input[id^='react-select-'][id$='-input']");
      if (inp && inp.offsetParent !== null) return inp.id;
    }
    return null;
  }

  function scopeHasAddButton(scope) {
    if (!scope) return false;
    if (scope.querySelector('button[form="button-add-procedure"]')) return true;
    if (scope.querySelector(ADD_BUTTON_SELECTOR)) return true;
    const btns = Array.from(scope.querySelectorAll("button"));
    return btns.some(b => normLow(b.textContent).includes("adicionar"));
  }

  function isVisibleInputId(id) {
    const el = document.getElementById(id);
    return !!el && el.offsetParent !== null;
  }

  // ✅ tenta 23… até achar o próximo visível (sua ideia)
  function findProcInputByIncrement(start = 23, max = 60) {
    for (let n = start; n <= max; n++) {
      const id = `react-select-${n}-input`;
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) continue;

      const scope = el.closest("form") || el.closest("section") || el.closest("div") || document;
      if (scopeHasAddButton(scope)) return id;
    }
    return null;
  }

  async function getProcedureInputId() {
    // 1) o clássico que funcionava
    if (isVisibleInputId(PROC_FIXED_ID)) return PROC_FIXED_ID;

    // 2) brute-force incremental (23,24,25…)
    const byInc = findProcInputByIncrement(23, 220);
    if (byInc) return byInc;

    // 3) por label
    const byLabel = findProcInputByLabel();
    if (byLabel) return byLabel;

    return null;
  }

  function findQtyInputNearProcedures(procInputId) {
    const proc = document.getElementById(procInputId);
    const scope = proc?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']"));
    return nums.find(n => n.offsetParent !== null) || nums[0] || null;
  }

  function findAddButton(procInputId) {
    // 1) seletor forte (igual seu que funcionava)
    const btn = document.querySelector(ADD_BUTTON_SELECTOR);
    if (btn) return btn;

    // 2) fallback por form / texto dentro do escopo
    const proc = document.getElementById(procInputId);
    const scope = proc?.closest("form") || document;

    const btnByForm = scope.querySelector('button[form="button-add-procedure"]') || document.querySelector('button[form="button-add-procedure"]');
    if (btnByForm) return btnByForm;

    const buttons = Array.from(scope.querySelectorAll("button"));
    return buttons.find(b => normLow(b.textContent) === "adicionar") ||
           buttons.find(b => normLow(b.textContent).includes("adicionar")) ||
           null;
  }

  async function insertOneProcedure(code) {
    const { speed_ms } = getCfg();

    await ensureTabela22();

    const procId = await getProcedureInputId();
    if (!procId) throw new Error("Não encontrei o campo de Procedimento (23…/label).");

    // ✅ ESSÊNCIA: digita + ENTER (sem exigir clicar opção do código)
    await fillReactSelectLoose({
      id: procId,
      text: String(code),
      typeDelay: 55,
      waitBeforeEnterMs: Math.max(700, Math.round(speed_ms * 0.9)),
      settleMs: 350,
    });

    await delay(Math.min(250, speed_ms));

    const qty = findQtyInputNearProcedures(procId);
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(60);
    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);
    await delay(90);

    const addBtn = findAddButton(procId);
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    const proc = document.getElementById(procId);
    const scope = proc?.closest("form") || document;

    addBtn.click();
    await waitNotBusy(scope, 20000);
    await delay(Math.min(180, speed_ms));
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

      setStatus("⏳ Preenchendo obrigatórios...");

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

        if (k === "tipo_consulta") {
          await fillReactSelectPick({
            id: cfg.id,
            text: cfg.text,
            optionExact: cfg.optionExact || null,
            waitOptionsMs: 30000,
            typeDelay: 55,
            settleMs: 650,
          });
        } else {
          await fillReactSelectLoose({
            id: cfg.id,
            text: cfg.text,
            typeDelay: 55,
            waitBeforeEnterMs: Math.max(850, Math.round(speed_ms * 0.9)),
            settleMs: 350,
          });
        }

        await delay(240);
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

        await delay(Math.round(speed_ms * 0.25));
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
          <div style="font-size:11px;opacity:.9;margin-bottom:4px">CRM Solicitante (padrão)</div>
          <input id="gdfCrmSol" inputmode="numeric" placeholder="ex: 22416" value="${crmSolInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
        <div>
          <div style="font-size:11px;opacity:.9;margin-bottom:4px">CRM Executante (padrão)</div>
          <input id="gdfCrmExe" inputmode="numeric" placeholder="ex: 22416" value="${crmExeInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
      </div>

      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:11px;opacity:.9">Velocidade (cadência)</div>
          <div id="gdfSpeedLabel" style="font-size:11px;opacity:.9">${speedInit}ms</div>
        </div>
        <input id="gdfSpeed" type="range" min="200" max="2000" step="50" value="${speedInit}"
          style="width:100%" />
        <div style="font-size:11px;opacity:.75;margin-top:4px">
          Mais alto = mais lento (menos falhas). Sugestão: <b>650–1100ms</b>.
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
        Beneficiário manual. (CRM e velocidade salvam sozinhos.) Depois clique em “Preencher obrigatórios”.
      </div>

      <div style="margin-top:8px;font-size:11px;opacity:.8;line-height:1.35">
        ✅ Procedimento: tenta <b>23</b>, se não existir vai <b>24,25,26...</b> automaticamente.<br/>
        ✅ React-Select abre pelo <b>placeholder</b> quando existir (ex: <code>react-select-23-placeholder</code>).<br/>
        ✅ Inserção no estilo “que funcionava”: <b>digita + ENTER</b> (sem travar em opção).
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
      setStatus("Reset feito. Recarregue a página para voltar ao padrão.");
    };

    const st2 = loadSt() || {};
    if (st2.obrigOk) lockProcs(false);
  }

  // Init
  createPanel();
  log("✅ GDF_INAS v13: essência do procedimento (digita+ENTER) + fallback 23→24→25 + placeholder.");
})();
