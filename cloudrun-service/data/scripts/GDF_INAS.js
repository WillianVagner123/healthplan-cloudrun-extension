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

  // ✅ Espera "a opção certa" aparecer (não só o dropdown)
  async function waitOptionCompatible(baseId, needle, timeoutMs = 45000) {
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

  // ✅ Preenche e SÓ CONFIRMA quando a opção compatível aparecer
  async function fillReactSelectWaitCompatible({
    id,
    text,
    // compatibilidade (padrão: contém o texto digitado)
    containsText = null,
    exactText = null,
    // tempos
    openDelayMs = 240,
    typeDelay = 65,
    waitOptionsMs = 45000,
    settleMs = 700,
    // se quiser fallback de ENTER (normalmente: NÃO)
    allowEnterFallback = false,
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 35000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(140);

    openReactSelect(input);
    await delay(openDelayMs);

    await typeReactSelect(input, text, typeDelay);

    const baseId = baseIdFromInputId(id);
    if (!baseId) {
      if (allowEnterFallback) {
        await delay(900);
        pressEnter(input);
        await delay(settleMs);
        return true;
      }
      throw new Error(`Sem baseId para buscar opções em ${id}`);
    }

    const optsNeedle = exactText || containsText || text;

    // garante dropdown aberto
    if (input.getAttribute("aria-expanded") !== "true") {
      openReactSelect(input);
      await delay(200);
    }

    let pick = null;

    if (exactText) {
      const nExact = normLow(exactText);
      const t0 = Date.now();
      while (Date.now() - t0 < waitOptionsMs) {
        const opts = readVisibleOptions(baseId);
        if (opts.length) {
          pick = opts.find(o => normLow(o.textContent) === nExact) || null;
          if (pick) break;
        }
        await delay(220);
      }
    } else {
      pick = await waitOptionCompatible(baseId, optsNeedle, waitOptionsMs);
    }

    if (!pick) {
      throw new Error(`Nenhuma opção compatível em ${id} para "${optsNeedle}" (timeout)`);
    }

    pick.scrollIntoView?.({ block: "center" });
    await delay(120);
    pick.click();
    await delay(settleMs);
    return true;
  }

  // =========================
  // Defaults + CRM + Cadência
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
      vSpd = Math.max(400, Math.min(4000, Number(speed.value) || SPEED_DEFAULT));
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
      // CRM: precisa aguardar opção compatível aparecer
      prof_solicitante: { id: "react-select-3-input",  text: cfg.crm_solicitante, contains: cfg.crm_solicitante, waitMs: 60000 },
      cbo_solicitante:  { id: "react-select-21-input", text: "999999", contains: "999999", waitMs: 45000 },

      regime:           { id: "react-select-5-input",  text: "01", contains: "01", waitMs: 45000 },
      especialidade:    { id: "react-select-6-input",  text: "CLINICA", contains: "CLINICA", waitMs: 45000 },
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
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
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

        await fillReactSelectWaitCompatible({
          id: TABLE_INPUT_ID,
          text: "22",
          containsText: "22 -",
          waitOptionsMs: 45000,
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

  function findAddButton(scope = document) {
    return scope.querySelector('button[form="button-add-procedure"]')
      || document.querySelector('button[form="button-add-procedure"]')
      || null;
  }

  // pega o "form/escopo" do bloco de procedimentos pelo botão Adicionar
  function getProceduresScope() {
    const add = document.querySelector('button[form="button-add-procedure"]');
    if (!add) return document;
    return add.closest("form") || add.closest("section") || add.closest("div") || document;
  }

  // ✅ acha o input de Procedimento (ID muda 23/25/27...)
  function getProcedureInputId() {
    const scope = getProceduresScope();

    const inputs = Array.from(scope.querySelectorAll("input[id^='react-select-'][id$='-input']"))
      .filter(i => i && i.offsetParent !== null);

    // remove o da Tabela
    const filtered = inputs.filter(i => i.id !== TABLE_INPUT_ID);

    if (!filtered.length) return null;

    // normalmente é o último react-select do bloco (e ele sobe 2 em 2)
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

  function tableHasCode(code) {
    const tds = Array.from(document.querySelectorAll("table td.first-column"))
      .filter(td => td && td.offsetParent !== null);
    return tds.some(td => norm(td.textContent) === String(code));
  }

  async function waitRowAppears(code, timeoutMs = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (tableHasCode(code)) return true;
      await delay(200);
    }
    return false;
  }

  // ✅ depois de clicar Adicionar, só segue quando:
  // - botão não estiver busy
  // - o código aparecer na tabela de baixo
  // - o campo de procedimento voltar a ficar "pronto" (value vazio)
  async function waitAfterAdd(procId, code, scope, timeoutMs = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await waitNotBusy(scope, 25000);

      const okRow = tableHasCode(code);
      const inp = document.getElementById(procId);
      const okReady = inp ? (String(inp.value || "") === "") : false;

      if (okRow && okReady) return true;

      await delay(240);
    }
    return false;
  }

  async function insertOneProcedure(code) {
    const { speed_ms } = getCfg();

    await ensureTabela22();
    await delay(speed_ms);

    const scope = getProceduresScope();
    const procId = getProcedureInputId();
    if (!procId) throw new Error("Não encontrei o campo de Procedimento (ID dinâmico).");

    const procEl = document.getElementById(procId);
    if (!procEl) throw new Error("Procedimento input não está no DOM.");

    // 🔒 segurança: se o último código ainda não apareceu, não corre
    // (evita ele “pular” antes da UI assentar)
    // (aqui é por inserção atual, então só garante no pós-add)

    // ✅ Procedimento: espera opção compatível (código) e clica
    await fillReactSelectWaitCompatible({
      id: procId,
      text: String(code),
      containsText: String(code),       // a opção PRECISA conter o código digitado
      waitOptionsMs: 60000,
      settleMs: 800,
      allowEnterFallback: false,        // ✅ sem ENTER
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

    // ✅ só continua quando o código apareceu na tabela E o campo voltou a ficar pronto
    const ok = await waitAfterAdd(procId, code, scope, 65000);
    if (!ok) {
      throw new Error("Depois de Adicionar, o procedimento não assentou (linha não apareceu e/ou campo não resetou).");
    }

    // micro-pausa final
    await delay(Math.max(350, Math.round(speed_ms * 0.6)));
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

        // ✅ TODOS aguardam a opção compatível aparecer (sem "chutar" cedo)
        await fillReactSelectWaitCompatible({
          id: cfg.id,
          text: cfg.text,
          containsText: cfg.contains || null,
          exactText: cfg.exact || null,
          waitOptionsMs: cfg.waitMs || 45000,
          settleMs: 800,
          allowEnterFallback: false,
        });

        await delay(Math.max(300, Math.round(speed_ms * 0.35)));
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

        // se já está na tabela, pula (evita duplicar)
        if (tableHasCode(code)) {
          setStatus(`↷ Já existe na tabela: ${code} (pulando)`);
          await delay(Math.max(350, Math.round(speed_ms * 0.6)));
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
          await delay(Math.max(900, speed_ms));
        }

        await delay(Math.max(450, Math.round(speed_ms * 0.5)));
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
        ✅ Agora <b>tudo</b> espera aparecer a <b>opção compatível</b> (sem ENTER antes da hora).<br/>
        ✅ Procedimento só avança quando o <b>código aparecer na tabela de baixo</b> e o campo resetar.
      </div>
    `;

    document.body.appendChild(panel);

    // autosave SEM botão (como você pediu)
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
  log("✅ GDF_INAS v13: espera opção compatível (CRM/procedimento) + cadência 2000ms + só avança após linha aparecer na tabela.");
})();
