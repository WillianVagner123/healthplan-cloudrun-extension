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
  // Aqui o que manda é fallbackQuery (o que você digitava no VBA).
  // pickExact fica só pra log/ajuste futuro.
  // =========================================================
  const MANDATORY = {
    prof_solicitante: {
      id: "react-select-3-input",
      pickExact: "22416 - SERGIO CABRAL FILHO",
      fallbackQuery: "22416"
    },
    cbo_solicitante: {
      id: "react-select-21-input",
      pickExact: "999999 - CBO do prestador solicitante desconhecido ou não informado",
      fallbackQuery: "999999"
    },
    regime: {
      id: "react-select-5-input",
      pickExact: "01 – Ambulatorial",
      fallbackQuery: "01"
    },
    especialidade: {
      id: "react-select-6-input",
      pickExact: "CLINICA MEDICA",
      fallbackQuery: "CLINICA MEDICA"
    },
    carater: {
      id: "react-select-7-input",
      pickExact: "1 – Eletivo",
      fallbackQuery: "Eletivo"
    },
    tipo_consulta: {
      id: "react-select-9-input",
      pickExact: "04 - Consulta",
      fallbackQuery: "04"
    },
    cid: {
      id: "react-select-11-input",
      pickExact: "E88 - Outros distúrbios metabólicos",
      fallbackQuery: "E88"
    },
    prof_exec: {
      id: "react-select-16-input",
      pickExact: "22416 - SERGIO CABRAL FILHO",
      fallbackQuery: "22416"
    },
    cbo_exec: {
      id: "react-select-22-input",
      pickExact: "999999 - CBO do prestador solicitante desconhecido ou não informado",
      fallbackQuery: "999999"
    },
  };

  // =========================================================
  // ✅ CONFIG — PROCEDIMENTOS
  // =========================================================
  const TABLE_INPUT_ID = "react-select-18-input";
  const PROC_INPUT_ID  = "react-select-19-input";
  const TABLE_FALLBACK_QUERY = "22"; // digita e enter
  const QTY_DEFAULT = "1";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK).map(String);

  // =========================================================
  // ✅ Estado
  // =========================================================
  const STORE_KEY = "gdf_inas_state_v7";
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

  // =========================================================
  // ✅ Helpers (teclado)
  // =========================================================
  async function waitFor(getter, timeoutMs = 20000) {
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

  function fireInput(el, data = "") {
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data, inputType: "insertText" }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function key(el, type, keyVal, keyCodeVal) {
    el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: keyVal,
      code: keyVal === "Enter" ? "Enter" : (keyVal === "ArrowDown" ? "ArrowDown" : undefined),
      keyCode: keyCodeVal,
      which: keyCodeVal
    }));
  }

  async function openAndFocus(input) {
    input.scrollIntoView?.({ block: "center" });
    await delay(60);

    // Clica no container pra garantir que abre
    const control = input.closest("div[class*='css-']")?.parentElement;
    (control || input).click();
    await delay(120);

    input.focus();
    await delay(60);
  }

  async function typeAndEnter(input, text, { tryArrowDown = true } = {}) {
    await openAndFocus(input);

    // limpa
    setNativeValue(input, "");
    fireInput(input, "");
    await delay(60);

    // digita
    let current = "";
    for (const ch of String(text)) {
      current += ch;
      key(input, "keydown", ch, ch.charCodeAt(0));
      setNativeValue(input, current);
      fireInput(input, ch);
      key(input, "keyup", ch, ch.charCodeAt(0));
      await delay(18);
    }

    await delay(220);

    // ENTER
    key(input, "keydown", "Enter", 13);
    key(input, "keyup", "Enter", 13);
    await delay(250);

    // Se não pegar, tenta ArrowDown + Enter
    if (tryArrowDown) {
      key(input, "keydown", "ArrowDown", 40);
      key(input, "keyup", "ArrowDown", 40);
      await delay(120);
      key(input, "keydown", "Enter", 13);
      key(input, "keyup", "Enter", 13);
      await delay(250);
    }
  }

  // =========================================================
  // ✅ Obrigatórios (modo teclado)
  // =========================================================
  async function fillMandatoryField(field) {
    const input = await waitFor(() => document.getElementById(field.id), 25000);
    if (!input) throw new Error(`Não achei o campo ${field.id}`);

    // sempre usa fallbackQuery (é o que o portal aceita melhor)
    const q = field.fallbackQuery || field.pickExact;
    if (!q) throw new Error(`Sem fallbackQuery/pickExact para ${field.id}`);

    await typeAndEnter(input, q, { tryArrowDown: true });
  }

  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios da guia (ENTER)...");

      await fillMandatoryField(MANDATORY.prof_solicitante);
      await fillMandatoryField(MANDATORY.cbo_solicitante);

      await fillMandatoryField(MANDATORY.regime);
      await fillMandatoryField(MANDATORY.especialidade);
      await fillMandatoryField(MANDATORY.carater);

      await fillMandatoryField(MANDATORY.tipo_consulta);
      await fillMandatoryField(MANDATORY.cid);

      await fillMandatoryField(MANDATORY.prof_exec);
      await fillMandatoryField(MANDATORY.cbo_exec);

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
  // ✅ Procedimentos (tabela por ENTER + procedimento por ENTER)
  // =========================================================
  function procedureInputEnabled(input) {
    return !!input && !input.disabled && input.getAttribute("aria-disabled") !== "true";
  }

  function findQtyInput() {
    return document.querySelector("input[type='number']") || null;
  }

  function findAddButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim().toLowerCase();
    return (
      buttons.find(b => norm(b.textContent) === "adicionar") ||
      buttons.find(b => norm(b.textContent).includes("adicionar")) ||
      null
    );
  }

  async function ensureTabela22() {
    const input = await waitFor(() => document.getElementById(TABLE_INPUT_ID), 25000);
    if (!input) return { ok: false, reason: "table_input_not_found" };
    await typeAndEnter(input, TABLE_FALLBACK_QUERY, { tryArrowDown: true });
    return { ok: true, chosen: "22 (por ENTER)" };
  }

  async function pickProcedure(code) {
    const procInput = await waitFor(() => document.getElementById(PROC_INPUT_ID), 25000);
    if (!procInput) return { ok: false, reason: "proc_input_not_found" };

    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTabela22();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };
      await delay(250);
    }

    await typeAndEnter(procInput, String(code), { tryArrowDown: true });
    return { ok: true, chosen: `(enter) ${code}` };
  }

  async function fillOne(code) {
    const p = await pickProcedure(code);
    if (!p.ok) return p;

    const qty = findQtyInput();
    if (!qty) return { ok: false, reason: "qty_not_found" };

    qty.scrollIntoView?.({ block: "center" });
    await delay(60);

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty, "");
    await delay(50);

    setNativeValue(qty, String(QTY_DEFAULT));
    fireInput(qty, String(QTY_DEFAULT));
    await delay(120);

    const addBtn = findAddButton();
    if (!addBtn) return { ok: false, reason: "add_button_not_found" };

    addBtn.scrollIntoView?.({ block: "center" });
    await delay(60);
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

      setStatus("🧪 Selecionando Tabela 22 (ENTER)...");
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
          await delay(400);
          continue;
        }

        log("✅ Inserido:", code, "->", r.picked);
        await delay(650);
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
  log("✅ Painel carregado (Obrigatórios + Procedimentos) — modo ENTER (sem depender de opções DOM).");
})();
