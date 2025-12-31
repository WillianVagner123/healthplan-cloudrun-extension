/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V6__) return;
  window.__GDF_INAS_V6__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v6";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

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
    }, timeoutMs, 100);
  }

  // =========================
  // ✅ React-Select filler (ENTER OU CLIQUE NA OPÇÃO)
  // =========================
  async function fillReactSelect({
    id,
    text,
    mode = "wait",
    waitBeforeEnterMs = 0,
    waitOptionsMs = 20000,
    typeDelay = 10,

    // ✅ NOVO: clicar numa opção específica
    clickOption = false,
    optionExact = null,
    optionStartsWith = null,
    optionContains = null,
    postWaitAfterPickMs = 600
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 30000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    // abrir dropdown
    input.focus();
    input.click();
    await delay(120);

    // limpar e digitar SEMPRE
    setNativeValue(input, "");
    fireInput(input);
    await delay(80);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }

    if (waitBeforeEnterMs > 0) await delay(waitBeforeEnterMs);

    // WAIT: aguarda opções
    let opts = null;
    let baseId = null;
    if (mode === "wait") {
      baseId = baseIdFromInputId(id);
      if (baseId) opts = await waitOptions(baseId, waitOptionsMs);
    }

    // ✅ modo "clicar opção"
    if (clickOption) {
      if (!opts?.length) {
        // reabrir e esperar de novo
        input.focus(); input.click();
        await delay(180);
        baseId = baseId || baseIdFromInputId(id);
        opts = baseId ? await waitOptions(baseId, waitOptionsMs) : null;
      }
      if (!opts?.length) throw new Error(`Sem opções visíveis para ${id} (clickOption)`);

      const n = (s) => norm(s).toLowerCase();
      const exact = optionExact ? n(optionExact) : null;
      const starts = optionStartsWith ? n(optionStartsWith) : null;
      const contains = optionContains ? n(optionContains) : null;

      const pick =
        (exact ? opts.find(o => n(o.textContent) === exact) : null) ||
        (starts ? opts.find(o => n(o.textContent).startsWith(starts)) : null) ||
        (contains ? opts.find(o => n(o.textContent).includes(contains)) : null);

      if (!pick) {
        console.log("GDF_INAS: opções disponíveis:", opts.map(o => norm(o.textContent)));
        throw new Error(`Não achei opção alvo no dropdown (${id}).`);
      }

      pick.scrollIntoView?.({ block: "center" });
      await delay(80);
      pick.click();
      await delay(postWaitAfterPickMs);
      return true;
    }

    // padrão: ENTER
    await delay(30);
    pressEnter(input);
    await delay(postWaitAfterPickMs);
    return true;
  }

  // =========================
  // ✅ SEUS CAMPOS OBRIGATÓRIOS
  // =========================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  text: "22416",  mode: "wait", waitBeforeEnterMs: 2000 },
    cbo_solicitante:  { id: "react-select-21-input", text: "999999", mode: "wait", waitBeforeEnterMs: 900  },

    regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial", mode: "wait", waitBeforeEnterMs: 800  },
    especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA",     mode: "wait", waitBeforeEnterMs: 2000 },
    carater:          { id: "react-select-7-input",  text: "1 – Eletivo",        mode: "wait", waitBeforeEnterMs: 800  },

    tipo_consulta:    { id: "react-select-9-input",  text: "04 - Consulta",      mode: "wait", waitBeforeEnterMs: 2000 },
    cid:              { id: "react-select-11-input", text: "E88",               mode: "wait", waitBeforeEnterMs: 2000 },

    prof_exec:        { id: "react-select-16-input", text: "22416",  mode: "wait", waitBeforeEnterMs: 2000 },
    cbo_exec:         { id: "react-select-22-input", text: "999999", mode: "wait", waitBeforeEnterMs: 900  },
  };

  // =========================
  // ✅ PROCEDIMENTOS
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_INPUT_ID  = "react-select-23-input"; // Procedimento*

  const TABLE_TEXT = "22 - Procedimentos e eventos em saúde";
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

  // ======= ✅ DETECTA O TEXTO SELECIONADO NA TABELA =======
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

  // ======= ✅ GARANTE TABELA 22 (clicando a opção 22) =======
  async function ensureTabela22() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const already = tabelaSingleValueText();
        if (already.startsWith("22 -")) return true;

        // digita "22" e CLICA na opção "22 - ..."
        await fillReactSelect({
          id: TABLE_INPUT_ID,
          text: "22",
          mode: "wait",
          waitBeforeEnterMs: 2000,
          waitOptionsMs: 30000,

          clickOption: true,
          optionStartsWith: "22 -",
          postWaitAfterPickMs: 900
        });

        await delay(600);

        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          log("✅ Tabela selecionada:", picked);
          return true;
        }

        // fallback: ENTER pra consolidar
        const input = document.getElementById(TABLE_INPUT_ID);
        if (input) { input.focus(); pressEnter(input); }
        await delay(700);

        const picked2 = tabelaSingleValueText();
        if (picked2.startsWith("22 -")) {
          log("✅ Tabela selecionada (pós-enter):", picked2);
          return true;
        }

        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/3 falhou ao selecionar Tabela 22:`, e?.message || e);
        await delay(900);
      }
    }
    throw new Error("Não consegui selecionar a Tabela 22 após 3 tentativas.");
  }

  async function insertOneProcedure(code) {
    await ensureTabela22();

    await fillReactSelect({
      id: PROC_INPUT_ID,
      text: String(code),
      mode: "wait",
      waitBeforeEnterMs: 1400,
      waitOptionsMs: 25000,
      postWaitAfterPickMs: 600
    });

    await delay(450);

    const qty = findQtyInputNearProcedures();
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(80);
    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);
    await delay(150);

    const addBtn = findAddButton();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");
    addBtn.click();

    await delay(700);
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
        await delay(350);
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

    const codes = getCodes();
    if (!codes.length) {
      alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      return;
    }

    if (runProcedimentos.__running) return;
    runProcedimentos.__running = true;

    try {
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
          await delay(800);
        }
        await delay(250);
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

      <div style="margin-top:8px;font-size:11px;opacity:.8">
        Tabela 22 agora: digita "22" e <b>clica</b> na opção "22 - ..."<br/>
        Se falhar em horário de pico: aumente <code>waitBeforeEnterMs</code> e <code>postWaitAfterPickMs</code> no <code>ensureTabela22()</code>.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;
    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      lockProcs(true);
      setStatus("Reset feito. Beneficiário manual → Preencher obrigatórios.");
    };

    const st = loadSt() || {};
    if (st.obrigOk) lockProcs(false);
  }

  // Init
  createPanel();
  log("✅ GDF_INAS v6: Tabela 22 por clique (confiável) + correções gerais.");
})();
