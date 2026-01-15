/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V14__) return;
  window.__GDF_INAS_V14__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v14";
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

  // =========================
  // Busy / pós-Adicionar
  // =========================
  async function waitNotBusy(scope = document, timeoutMs = 25000) {
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

  function openReactSelect(input) {
    const container =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;

    const baseId = baseIdFromInputId(input.id);
    const placeholder = baseId ? document.getElementById(`${baseId}-placeholder`) : null;

    const indicator =
      container?.querySelector("[class*='indicatorContainer']") ||
      container?.querySelector("svg")?.closest("div");

    if (indicator && indicator.offsetParent !== null) return fireMouse(indicator);
    if (placeholder && placeholder.offsetParent !== null) return fireMouse(placeholder);

    const control =
      container?.querySelector("[role='combobox']") ||
      container?.querySelector("[class*='control']") ||
      container;

    if (control && control.offsetParent !== null) return fireMouse(control);

    input.focus();
    return fireMouse(input);
  }

  async function typeReactSelect(input, text, typeDelay = 65) {
    input.focus();
    setNativeValue(input, "");
    fireInput(input);
    await delay(120);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }
  }

  async function waitOptionCompatible(baseId, needle, timeoutMs = 8000) {
    const nNeedle = normLow(needle);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const opts = readVisibleOptions(baseId);
      if (opts.length) {
        const hit = opts.find(o => normLow(o.textContent).includes(nNeedle));
        if (hit) return hit;
      }
      await delay(220);
    }
    return null;
  }

  async function fillReactSelectWaitCompatible({
    id,
    text,
    containsText = null,
    exactText = null,
    openDelayMs = 240,
    typeDelay = 45,
    waitOptionsMs = 8000,
    settleMs = 700
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 6000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(140);

    openReactSelect(input);
    await delay(openDelayMs);

    await typeReactSelect(input, text, typeDelay);

    const baseId = baseIdFromInputId(id);
    if (!baseId) throw new Error(`Sem baseId para buscar opções em ${id}`);

    if (input.getAttribute("aria-expanded") !== "true") {
      openReactSelect(input);
      await delay(200);
    }

    const needle = exactText || containsText || text;

    let pick = null;
    if (exactText) {
      const nExact = normLow(exactText);
      const t0 = Date.now();
      while (Date.now() - t0 < waitOptionsMs) {
        const opts = readVisibleOptions(baseId);
        pick = opts.find(o => normLow(o.textContent) === nExact) || null;
        if (pick) break;
        await delay(220);
      }
    } else {
      pick = await waitOptionCompatible(baseId, needle, waitOptionsMs);
    }

    if (!pick) throw new Error(`Nenhuma opção compatível em ${id} para "${needle}" (timeout)`);

    pick.scrollIntoView?.({ block: "center" });
    await delay(120);
    pick.click();
    await delay(settleMs);
    return true;
  }

  // =========================
  // Defaults + CRM + Cadência
  // =========================
  const DEFAULTS = { crm_solicitante: "22416", crm_executante: "22416" };
  const SPEED_DEFAULT = 2000;

  function getCfg() {
    const st = loadSt() || {};
    const cfg = st.cfg || {};
    return {
      crm_solicitante: norm(cfg.crm_solicitante).replace(/\D/g, "") || DEFAULTS.crm_solicitante,
      crm_executante:  norm(cfg.crm_executante).replace(/\D/g, "")  || DEFAULTS.crm_executante,
      speed_ms: Number(cfg.speed_ms) > 0 ? Number(cfg.speed_ms) : SPEED_DEFAULT,
    };
  }

  function setCfg(partial) {
    const st = loadSt() || {};
    st.cfg = Object.assign({}, st.cfg || {}, partial);
    saveSt(st);
  }

  function readPanelInputsAndPersist(quiet = false) {
    const crmSol = document.getElementById("gdfCrmSol");
    const crmExe = document.getElementById("gdfCrmExe");
    const speed  = document.getElementById("gdfSpeed");
    const speedLabel = document.getElementById("gdfSpeedLabel");

    const cur = getCfg();
    const vSol = crmSol ? (norm(crmSol.value).replace(/\D/g, "") || DEFAULTS.crm_solicitante) : cur.crm_solicitante;
    const vExe = crmExe ? (norm(crmExe.value).replace(/\D/g, "") || DEFAULTS.crm_executante)  : cur.crm_executante;

    let vSpd = cur.speed_ms;
    if (speed) {
      vSpd = Math.max(250, Math.min(4000, Number(speed.value) || SPEED_DEFAULT));
      if (speedLabel) speedLabel.textContent = `${vSpd}ms`;
    }

    if (crmSol) crmSol.value = vSol;
    if (crmExe) crmExe.value = vExe;

    setCfg({ crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd });
    if (!quiet) setStatus(`💾 OK | CRM Sol: ${vSol} | CRM Exec: ${vExe} | Cadência: ${vSpd}ms`);
    return { crm_solicitante: vSol, crm_executante: vExe, speed_ms: vSpd };
  }

  // =========================
  // Obrigatórios
  // =========================
  function buildMandatory() {
    const cfg = getCfg();
    return {
      prof_solicitante: { id: "react-select-3-input",  text: cfg.crm_solicitante, contains: cfg.crm_solicitante, waitMs: 60000 },
      cbo_solicitante:  { id: "react-select-21-input", text: "999999", contains: "999999", waitMs: 45000 },

      regime:           { id: "react-select-5-input",  text: "01", contains: "01", waitMs: 45000 },
      especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA", contains: "CLINICA MEDICA", waitMs: 45000 },
      carater:          { id: "react-select-7-input",  text: "1", contains: "1", waitMs: 45000 },

      tipo_consulta:    { id: "react-select-9-input",  text: "04", exact: "04 - Consulta", waitMs: 45000 },

      cid:              { id: "react-select-11-input", text: "E88", contains: "E88", waitMs: 45000 },

      prof_exec:        { id: "react-select-16-input", text: cfg.crm_executante, contains: cfg.crm_executante, waitMs: 60000 },
      cbo_exec:         { id: "react-select-22-input", text: "999999", contains: "999999", waitMs: 45000 },
    };
  }

  // =========================
  // Procedimentos
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input";
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

  function tabelaIsBlank() {
    // quando fica no placeholder "Tabela*" → singleValue vazio
    return tabelaSingleValueText() === "";
  }

  async function waitTabelaBlank(timeoutMs = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (tabelaIsBlank()) return true;
      await delay(220);
    }
    return false;
  }

  async function ensureTabela22() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const already = tabelaSingleValueText();
        if (already.startsWith("22 -")) return true;

        await fillReactSelectWaitCompatible({
          id: TABLE_INPUT_ID,
          text: "22",
          containsText: "22 -",
          waitOptionsMs: 5000,
          settleMs: 700,
        });

        await delay(450);

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

  function tableHasCode(code) {
    const tds = Array.from(document.querySelectorAll("table td.first-column"))
      .filter(td => td && td.offsetParent !== null);
    return tds.some(td => norm(td.textContent) === String(code));
  }

  async function waitRowAppears(code, timeoutMs = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (tableHasCode(code)) return true;
      await delay(200);
    }
    return false;
  }

  function findAddButton(scope = document) {
    return scope.querySelector('button[form="button-add-procedure"]')
      || document.querySelector('button[form="button-add-procedure"]')
      || null;
  }

  function getProceduresScope() {
    const add = document.querySelector('button[form="button-add-procedure"]');
    if (!add) return document;
    return add.closest("form") || add.closest("section") || add.closest("div") || document;
  }

  // ✅ input do procedimento é o "último" react-select do bloco (ID sobe 2 em 2)
  function getProcedureInputId() {
    const scope = getProceduresScope();
    const inputs = Array.from(scope.querySelectorAll("input[id^='react-select-'][id$='-input']"))
      .filter(i => i && i.offsetParent !== null);

    const filtered = inputs.filter(i => i.id !== TABLE_INPUT_ID);
    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const na = parseInt(String(a.id).match(/react-select-(\d+)-input/)?.[1] || "0", 10);
      const nb = parseInt(String(b.id).match(/react-select-(\d+)-input/)?.[1] || "0", 10);
      return na - nb;
    });

    return filtered[filtered.length - 1].id;
  }

  function findQtyInputNear(procInputEl) {
    const scope = procInputEl?.closest("form") || procInputEl?.closest("section") || getProceduresScope();
    const nums = Array.from(scope.querySelectorAll("input[type='number']")).filter(n => n.offsetParent !== null);
    return nums[0] || null;
  }

  // ✅ Pós-add robusto:
  // - não usa procId fixo (porque ele muda 23→25→27…)
 async function waitAfterAddDynamic(code, scope, timeoutMs = 15000) {
  const t0 = Date.now();

  // 1) linha apareceu
  const okRow = await waitRowAppears(code, 10000);
  if (!okRow) return { ok: false, why: "linha não apareceu" };

  // 2) tenta tabela em branco (rápido)
  await waitTabelaBlank(3000);

  // 3) input novo pronto = GO
  while (Date.now() - t0 < timeoutMs) {
    const newProcId = getProcedureInputId();
    const inp = newProcId ? document.getElementById(newProcId) : null;

    if (inp && inp.value === "") {
      return { ok: true, why: "input novo pronto" };
    }

    await delay(120);
  }

  return { ok: false, why: "input novo não estabilizou" };
}


    // 3) espera novo input de procedimento existir e estar pronto (value vazio) e página não busy
    while (Date.now() - t0 < timeoutMs) {
  const newProcId = getProcedureInputId();
  const inp = newProcId ? document.getElementById(newProcId) : null;

  if (inp && inp.value === "") {
    return { ok: true, why: "input novo pronto" };
  }

  await delay(120);
}


    return { ok: false, why: "procedimento não ficou pronto (input novo não estabilizou)" };
  }

  async function insertOneProcedure(code) {
    const { speed_ms } = getCfg();
    const scope = getProceduresScope();

    // a cada procedimento, começa selecionando a tabela 22 (porque após add ela “zera”)
    await ensureTabela22();
    await delay(Math.max(200, speed_ms * 0.2));

    // sempre pega o ID atual (dinâmico)
    let procId = getProcedureInputId();
    if (!procId) throw new Error("Não encontrei o campo de Procedimento (ID dinâmico).");

    const procEl = document.getElementById(procId);
    if (!procEl) throw new Error("Procedimento input não está no DOM.");

    // procedimento: espera opção compatível (código) e clica
    await fillReactSelectWaitCompatible({
      id: procId,
      text: String(code),
      containsText: String(code),
      waitOptionsMs: 60000,
      settleMs: 800,
    });

    await delay(speed_ms);

    // quantidade
    const qty = findQtyInputNear(procEl);
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(220);
    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);

    await delay(speed_ms);

    // adicionar
    const addBtn = findAddButton(scope);
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    addBtn.click();

    // ✅ espera de forma robusta
    const res = await waitAfterAddDynamic(code, scope, 65000);
    if (!res.ok) {
      throw new Error(`Depois de Adicionar, não estabilizou: ${res.why}`);
    }

    await delay(Math.max(250, Math.round(speed_ms * 0.3)));
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
      readPanelInputsAndPersist(true);

      const M = buildMandatory();
      const { speed_ms } = getCfg();

      setStatus("⏳ Preenchendo obrigatórios (aguardando dropdown correto)...");

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

        await fillReactSelectWaitCompatible({
          id: cfg.id,
          text: cfg.text,
          containsText: cfg.contains || null,
          exactText: cfg.exact || null,
          waitOptionsMs: cfg.waitMs || 45000,
          settleMs: 800,
        });

        await delay(Math.max(250, Math.round(speed_ms * 0.25)));
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
      readPanelInputsAndPersist(true);
      const { speed_ms } = getCfg();

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);

        if (tableHasCode(code)) {
          setStatus(`↷ Já existe na tabela: ${code} (pulando)`);
          await delay(Math.max(350, Math.round(speed_ms * 0.3)));
          continue;
        }

        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          await insertOneProcedure(code);
          log("✅ Inserido:", code);
          setStatus(`✅ Inserido: ${code}`);
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(Math.max(600, speed_ms));
        }

        await delay(Math.max(200, Math.round(speed_ms * 0.25)));
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
    const crmSolInit = norm(cfg.crm_solicitante).replace(/\D/g, "") || DEFAULTS.crm_solicitante;
    const crmExeInit = norm(cfg.crm_executante).replace(/\D/g, "")  || DEFAULTS.crm_executante;
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
          <input id="gdfCrmSol" inputmode="numeric" placeholder="ex: 22416" value="${crmSolInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
        <div>
          <div style="font-size:11px;opacity:.9;margin-bottom:4px">CRM Executante</div>
          <input id="gdfCrmExe" inputmode="numeric" placeholder="ex: 22416" value="${crmExeInit}"
            style="width:100%;padding:8px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#e5e7eb" />
        </div>
      </div>

      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-size:11px;opacity:.9">Cadência (começa em 2000ms)</div>
          <div id="gdfSpeedLabel" style="font-size:11px;opacity:.9">${speedInit}ms</div>
        </div>
        <input id="gdfSpeed" type="range" min="400" max="4000" step="50" value="${speedInit}"
          style="width:100%" />
        <div style="font-size:11px;opacity:.75;margin-top:4px">
          Mais alto = mais lento (menos falhas). Sugestão: <b>1800–2600ms</b>.
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
        Beneficiário manual. Depois clique em “Preencher obrigatórios”.
      </div>

      <div style="margin-top:8px;font-size:11px;opacity:.85;line-height:1.35">
        ✅ Espera opção compatível antes de clicar (sem ENTER).<br/>
        ✅ Após Adicionar: espera <b>linha aparecer</b> + <b>Tabela voltar a ficar em branco</b> + <b>novo input pronto</b>.
      </div>
    `;

    document.body.appendChild(panel);

    const autosave = () => readPanelInputsAndPersist(true);
    panel.querySelector("#gdfCrmSol").addEventListener("input", autosave);
    panel.querySelector("#gdfCrmExe").addEventListener("input", autosave);
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
  log("✅ GDF_INAS v14: pós-Add robusto (linha + tabela em branco + input novo pronto).");
})();
