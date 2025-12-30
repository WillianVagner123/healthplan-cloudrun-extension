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

  // =========================================================
  // ✅ CONFIG — OBRIGATÓRIOS (SEM CPF/CARTEIRINHA)
  // MODO: sempre digitar + ENTER + esperar + ENTER
  // =========================================================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  text: "22416"   }, // ← seu código
    cbo_solicitante:  { id: "react-select-21-input", text: "999999"  },

    regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial" },
    especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA"     },
    carater:          { id: "react-select-7-input",  text: "1 – Eletivo"        },

    tipo_consulta:    { id: "react-select-9-input",  text: "04 - Consulta"      },
    cid:              { id: "react-select-11-input", text: "E88"               },

    prof_exec:        { id: "react-select-16-input", text: "22416"   }, // ← seu código
    cbo_exec:         { id: "react-select-22-input", text: "999999"  },
  };

  // =========================================================
  // ✅ CONFIG — PROCEDIMENTOS (IMPORTANTE!)
  // Seu campo é react-select-23-input (não 19)
  // Estratégia: digitar → aguardar carregar → ENTER
  // =========================================================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_INPUT_ID  = "react-select-23-input"; // Procedimento* (confirmado por você)
  const TABLE_TEXT     = "22"; // digita 22 e confirma
  const QTY_DEFAULT    = "1";

  // Códigos vindos do Maskara (Executar Kit) ou fallback
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = []; // se quiser fixar: ["40301087","40301150"]
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK).map(String);

  // =========================================================
  // ✅ Estado
  // =========================================================
  const STORE_KEY = "gdf_inas_state_force_enter_v2";
  const loadSt = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  let PROCS_RUNNING = false;

  // =========================================================
  // ✅ UI
  // =========================================================
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

  // =========================================================
  // ✅ Helpers (React / eventos)
  // =========================================================
  async function waitFor(getter, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = (typeof getter === "string") ? document.querySelector(getter) : getter();
      if (el) return el;
      await delay(120);
    }
    return null;
  }

  function setNativeValue(el, value) {
    const proto = el && el.__proto__;
    const desc = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
    const set = desc && desc.set;
    if (set) set.call(el, value);
    else el.value = value;
  }

  function fireInput(el) {
    try { el.dispatchEvent(new InputEvent("input", { bubbles: true })); }
    catch { el.dispatchEvent(new Event("input", { bubbles: true })); }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function typeSlow(el, text, charDelay = 14) {
    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(el, cur);
      fireInput(el);
      await delay(charDelay);
    }
  }

  // Digitar + ENTER + esperar + ENTER (modo "assentar")
  async function forceTypeAndDoubleEnter(input, text, {
    preClickDelay = 80,
    afterTypeDelay = 220,
    afterEnterDelay = 900,
    secondEnterDelay = 250,
    charDelay = 14
  } = {}) {
    input.scrollIntoView?.({ block: "center" });
    await delay(preClickDelay);

    const wrapper = input.closest("div[class*='css-']")?.parentElement || input;
    wrapper.click();
    await delay(120);

    input.focus();
    await delay(50);

    setNativeValue(input, "");
    fireInput(input);
    await delay(60);

    await typeSlow(input, text, charDelay);
    await delay(afterTypeDelay);

    pressEnter(input);
    await delay(afterEnterDelay);

    await delay(secondEnterDelay);
    pressEnter(input);
    await delay(350);

    return true;
  }

  // =========================================================
  // ✅ Obrigatórios
  // =========================================================
  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios da guia (texto + ENTER + WAIT + ENTER)...");

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
        const f = MANDATORY[k];
        const input = await waitFor(() => document.getElementById(f.id), 35000);
        if (!input) throw new Error(`Não achei o campo ${f.id}`);

        log("→ Obrigatório:", f.id, "texto:", f.text);

        // para os campos que costumam demorar (profissionais/CBO), deixa maior
        const heavy = (k.includes("prof_") || k.includes("cbo_"));
        await forceTypeAndDoubleEnter(input, f.text, {
          afterEnterDelay: heavy ? 1300 : 900,
          secondEnterDelay: 250
        });

        await delay(220);
      }

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

  // =========================================================
  // ✅ Procedimentos — seu campo é react-select-23-input
  // Digita → aguarda carregar → ENTER
  // =========================================================
  function findQtyInput() {
    // mais seguro: dentro da área de procedimentos, mas como não temos container fixo, pega o primeiro number visível
    const candidates = Array.from(document.querySelectorAll("input[type='number']"));
    const visible = candidates.find(i => i.offsetParent !== null) || candidates[0] || null;
    return visible;
  }

  function findAddButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const t = (s) => (s || "").toString().trim().toLowerCase();
    return buttons.find(b => t(b.textContent) === "adicionar") ||
           buttons.find(b => t(b.textContent).includes("adicionar")) ||
           null;
  }

  async function ensureTabela22() {
    const input = await waitFor(() => document.getElementById(TABLE_INPUT_ID), 30000);
    if (!input) throw new Error("Campo Tabela (react-select-18-input) não encontrado.");

    setStatus("🧪 Tabela: digitando 22 + ENTER + WAIT + ENTER...");
    await forceTypeAndDoubleEnter(input, TABLE_TEXT, {
      afterEnterDelay: 1100,
      secondEnterDelay: 250
    });

    await delay(250);
    return true;
  }

  async function insertProcedureByEnter(code) {
    const input = await waitFor(() => document.getElementById(PROC_INPUT_ID), 35000);
    if (!input) throw new Error(`Campo do procedimento (${PROC_INPUT_ID}) não encontrado.`);

    // se estiver desabilitado, normalmente é porque a tabela não foi selecionada
    if (input.disabled || input.getAttribute("aria-disabled") === "true") {
      await ensureTabela22();
      await delay(400);
    }

    setStatus(`🧪 Procedimento: ${code} (digitar → aguardar → ENTER)`);

    input.scrollIntoView?.({ block: "center" });
    await delay(120);

    // abre + digita + ENTER + aguarda assentar
    input.focus();
    input.click();
    await delay(120);

    setNativeValue(input, "");
    fireInput(input);
    await delay(60);

    await typeSlow(input, String(code), 14);

    // ⏳ importante: esperar carregar as sugestões
    await delay(1000);

    // ENTER (seleciona a opção)
    pressEnter(input);

    // ⏳ esperar assentar (evita avançar cedo)
    await delay(800);

    // ENTER extra (alguns react-selects só confirmam no 2º)
    pressEnter(input);
    await delay(400);

    return true;
  }

  async function fillOne(code) {
    await insertProcedureByEnter(code);

    const qty = findQtyInput();
    if (!qty) throw new Error("Campo Quantidade não encontrado.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(80);

    setNativeValue(qty, String(QTY_DEFAULT));
    fireInput(qty);
    await delay(120);

    const addBtn = findAddButton();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    addBtn.scrollIntoView?.({ block: "center" });
    await delay(60);
    addBtn.click();

    // ⏳ aguarda inclusão na lista
    await delay(900);

    return true;
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
        alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
        return;
      }

      setStatus("🧪 Preparando: selecionar Tabela 22...");
      await ensureTabela22();

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          await fillOne(code);
          log("✅ Inserido:", code);
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(700);
        }

        await delay(500);
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

  // =========================================================
  // Init
  // =========================================================
  createPanel();
  log("✅ Painel carregado (obrigatórios + procedimentos) — procedimento em react-select-23-input.");
})();
