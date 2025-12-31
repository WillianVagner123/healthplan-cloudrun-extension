/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V5__) return;
  window.__GDF_INAS_V5__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v5";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el.__proto__;
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
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress",{ bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
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
  // ✅ MODO por campo:
  // - "direct": digita e dá ENTER imediatamente (sem esperar options)
  // - "wait":   digita, ESPERA opções aparecerem, então ENTER
  // (se não aparecer opção, cai no ENTER mesmo assim)
  // =========================
  async function fillReactSelect({ id, text, mode = "wait", waitBeforeEnterMs = 0, waitOptionsMs = 20000, typeDelay = 10 }) {
    const input = await waitFor(() => document.getElementById(id), 30000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    // abrir dropdown
    input.focus();
    input.click();
    await delay(80);

    // limpar e digitar SEMPRE
    setNativeValue(input, "");
    fireInput(input);
    await delay(50);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }

    // espera extra fixa (caso você queira)
    if (waitBeforeEnterMs > 0) await delay(waitBeforeEnterMs);

    // se é WAIT: aguarda as opções do react-select aparecerem
    if (mode === "wait") {
      const baseId = baseIdFromInputId(id);
      if (baseId) {
        const opts = await waitOptions(baseId, waitOptionsMs);
        if (opts?.length) {
          // opcional: se você quiser clicar sempre na 1ª opção visível
          // (isso costuma ser mais confiável que "ENTER" em alguns combos)
          // comente as 2 linhas abaixo se preferir sempre ENTER
          // opts[0].scrollIntoView?.({ block: "center" });
          // opts[0].click();
          //
          // aqui vamos manter o que você pediu: ENTER
        } else {
          warn("Sem opções detectadas (vai no ENTER mesmo):", { id, text });
        }
      }
    }

    // ENTER final (sempre)
    await delay(30);
    pressEnter(input);

    return true;
  }

  // =========================
  // ✅ SEUS CAMPOS OBRIGATÓRIOS
  // Agora cada um tem seu modo: wait/direct
  // Ajuste os modos como você quiser.
  // =========================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  text: "22416",  mode: "wait",   waitBeforeEnterMs: 2000 },
    cbo_solicitante:  { id: "react-select-21-input", text: "999999", mode: "wait",   waitBeforeEnterMs: 900  },

    regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial", mode: "wait", waitBeforeEnterMs: 800 },
    especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA",     mode: "wait", waitBeforeEnterMs: 2000 },
    carater:          { id: "react-select-7-input",  text: "1 – Eletivo",        mode: "wait", waitBeforeEnterMs: 800 },

    tipo_consulta:    { id: "react-select-9-input",  text: "04 - Consulta",      mode: "wait", waitBeforeEnterMs: 2000 },
    cid:              { id: "react-select-11-input", text: "E88",               mode: "wait", waitBeforeEnterMs: 2000 },

    prof_exec:        { id: "react-select-16-input", text: "22416",  mode: "wait",   waitBeforeEnterMs: 2000 },
    cbo_exec:         { id: "react-select-22-input", text: "999999", mode: "wait",   waitBeforeEnterMs: 900  },
  };

  // =========================
  // ✅ PROCEDIMENTOS
  // - Tabela: pelo seu print, está ficando em 18 às vezes.
  // - Procedimento: você mostrou que pode ser react-select-23-input
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_INPUT_ID  = "react-select-23-input"; // Procedimento*

  const TABLE_TEXT = "22 - Procedimentos e eventos em saúde";           // digita 22 e ENTER
  const QTY_DEFAULT = "1";

  const ADD_BUTTON_SELECTOR =
    "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-eNLTQs.dVUnNT > div.sc-JQDoe.eETcDf > button.sc-eQaGpr.byRRCL.button-add";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

  function findQtyInputNearProcedures() {
    // tenta pegar o input number visível mais perto do bloco de procedimentos
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']"));
    return nums.find(n => n.offsetParent !== null) || nums[0] || null;
  }

  function findAddButton() {
    const btn = document.querySelector(ADD_BUTTON_SELECTOR);
    if (btn) return btn;

    // fallback por texto "Adicionar"
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("form") || document;
    const buttons = Array.from(scope.querySelectorAll("button"));
    const t = (s) => (s || "").toString().trim().toLowerCase();
    return buttons.find(b => t(b.textContent) === "adicionar") ||
           buttons.find(b => t(b.textContent).includes("adicionar")) ||
           null;
  }

async function ensureTabela22() {
  const input = document.getElementById(TABLE_INPUT_ID);
  if (!input) throw new Error("Input da Tabela não encontrado");

  // 1️⃣ digita o texto (ex: "22")
  await fillReactSelect({
    id: TABLE_INPUT_ID,
    text: TABLE_TEXT,          // pode ser "22" ou "22 - Procedimentos..."
    mode: "wait",
    waitBeforeEnterMs: 2000,   // ⏳ espera o backend carregar
    waitOptionsMs: 20000
  });

  // 2️⃣ espera EXTRA para garantir que o React terminou
  await delay(1200);

  // 3️⃣ ENTER SOBRE O INPUT QUE CONTÉM O TEXTO
  input.focus();
  pressEnter(input);

  // 4️⃣ aguarda a seleção se consolidar
  await delay(1200);
}


  async function insertOneProcedure(code) {
    await ensureTabela22();

    await fillReactSelect({
      id: PROC_INPUT_ID,
      text: String(code),
      mode: "wait",
      waitBeforeEnterMs: 1400,
      waitOptionsMs: 25000
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

      // Ordem exatamente como você listou
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
        Campos: alguns “wait” (aguarda opções), outros podem virar “direct”.<br/>
        Ajuste em <code>MANDATORY</code> → <code>mode</code>.
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
  log("✅ GDF_INAS v5: por-campo (wait/direct) + ENTER sempre + procedimentos com react-select-23-input.");
})();
