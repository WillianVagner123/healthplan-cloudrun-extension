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
  // fallbackQuery = o que você digita + Enter
  // expectIncludes = texto que deve aparecer após selecionar (pode ser parcial)
  // =========================================================
  const MANDATORY = {
    prof_solicitante: {
      id: "react-select-3-input",
      fallbackQuery: "29278",
      expectIncludes: "29278"
    },
    cbo_solicitante: {
      id: "react-select-21-input",
      fallbackQuery: "999999",
      expectIncludes: "999999"
    },
    regime: {
      id: "react-select-5-input",
      fallbackQuery: "01",
      expectIncludes: "Ambulatorial"
    },
    especialidade: {
      id: "react-select-6-input",
      fallbackQuery: "CLINICA MEDICA",
      expectIncludes: "CLINICA"
    },
    carater: {
      id: "react-select-7-input",
      fallbackQuery: "Eletivo",
      expectIncludes: "Eletivo"
    },
    tipo_consulta: {
      id: "react-select-9-input",
      fallbackQuery: "04",
      expectIncludes: "Consulta"
    },
    cid: {
      id: "react-select-11-input",
      fallbackQuery: "E88",
      expectIncludes: "E88"
    },
    prof_exec: {
      id: "react-select-16-input",
      fallbackQuery: "29278",
      expectIncludes: "29278"
    },
    cbo_exec: {
      id: "react-select-22-input",
      fallbackQuery: "999999",
      expectIncludes: "999999"
    },
  };

  // =========================================================
  // ✅ CONFIG — PROCEDIMENTOS
  // =========================================================
  const TABLE_INPUT_ID = "react-select-18-input";
  const PROC_INPUT_ID  = "react-select-19-input";
  const TABLE_FALLBACK_QUERY = "22";
  const TABLE_EXPECT = "22";
  const QTY_DEFAULT = "1";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK).map(String);

  // =========================================================
  // ✅ Estado
  // =========================================================
  const STORE_KEY = "gdf_inas_state_v8";
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
  // ✅ Helpers
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

  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

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
      code: keyVal,
      keyCode: keyCodeVal,
      which: keyCodeVal
    }));
  }

  function getSelectRootFromInput(input) {
    // sobe para um container "select" do layout; funciona bem com react-select
    return input.closest(".select, .procedure, [class*='select'], [class*='procedure']") || input.closest("div") || null;
  }

  function getSelectedTextFromSelectRoot(root) {
    if (!root) return "";
    // react-select costuma renderizar o valor em div *singleValue*
    const sv =
      root.querySelector("[class*='singleValue']") ||
      root.querySelector("[class*='SingleValue']") ||
      root.querySelector(".css-1dimb5e-singleValue") ||
      null;
    const txt = sv ? sv.textContent : "";
    return norm(txt);
  }

  function isBusySelect(root) {
    if (!root) return false;
    const t = (root.textContent || "").toLowerCase();
    // heurísticas comuns: "carregando", "loading"
    if (t.includes("carregando") || t.includes("loading")) return true;
    // spinner/indicator
    if (root.querySelector("[class*='loadingIndicator'], [class*='LoadingIndicator']")) return true;
    return false;
  }

  async function waitNotBusy(root, timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (!isBusySelect(root)) return true;
      await delay(120);
    }
    return false;
  }

  async function waitSelectSettled(input, { expectIncludes = "", timeoutMs = 20000 } = {}) {
    const root = getSelectRootFromInput(input);
    const want = norm(expectIncludes).toLowerCase();

    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await waitNotBusy(root, 1500);

      const selected = getSelectedTextFromSelectRoot(root);
      const selLower = selected.toLowerCase();

      // sucesso se:
      // - apareceu selected text e (se houver expectIncludes) ele contém
      // - OU: input ficou vazio (muitos react-select limpam o input) e existe algum singleValue
      const inputVal = (input.value || "").trim();

      const hasSingle = !!selected;
      const matches = !want || selLower.includes(want);

      if (hasSingle && matches) return { ok: true, selected };

      // fallback: às vezes não acha singleValue, mas o campo fica “resolvido”
      if (!inputVal && hasSingle) return { ok: true, selected };

      await delay(150);
    }
    return { ok: false, selected: getSelectedTextFromSelectRoot(getSelectRootFromInput(input)) };
  }

  async function openAndFocus(input) {
    input.scrollIntoView?.({ block: "center" });
    await delay(60);

    // clique no controle para abrir
    const control = input.closest("div[class*='css-']")?.parentElement || input;
    control.click();
    await delay(120);

    input.focus();
    await delay(60);
  }

  async function typeEnterAndWait(input, text, expectIncludes = "") {
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
    await delay(220);

    // se não assentou, tenta ArrowDown + Enter
    let settled = await waitSelectSettled(input, { expectIncludes, timeoutMs: 9000 });
    if (!settled.ok) {
      key(input, "keydown", "ArrowDown", 40);
      key(input, "keyup", "ArrowDown", 40);
      await delay(150);
      key(input, "keydown", "Enter", 13);
      key(input, "keyup", "Enter", 13);
      await delay(220);
      settled = await waitSelectSettled(input, { expectIncludes, timeoutMs: 12000 });
    }

    if (!settled.ok) {
      throw new Error(`Não assentou seleção (esperado: "${expectIncludes || text}")`);
    }

    return settled.selected || "(ok)";
  }

  // =========================================================
  // ✅ Obrigatórios
  // =========================================================
  async function fillMandatoryField(field) {
    const input = await waitFor(() => document.getElementById(field.id), 30000);
    if (!input) throw new Error(`Não achei o campo ${field.id}`);

    const q = field.fallbackQuery;
    const expect = field.expectIncludes || q;

    log("→ Preenchendo:", field.id, { q, expect });
    const selected = await typeEnterAndWait(input, q, expect);
    log("✅ OK:", field.id, "=>", selected);
    await delay(250); // micro-respiro entre campos
  }

  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios da guia (ENTER + WAIT)...");

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
  // ✅ Procedimentos
  // =========================================================
  function procedureInputEnabled(input) {
    return !!input && !input.disabled && input.getAttribute("aria-disabled") !== "true";
  }

  function findQtyInput() {
    return document.querySelector("input[type='number']") || null;
  }

  function findAddButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    return (
      buttons.find(b => norm(b.textContent).toLowerCase() === "adicionar") ||
      buttons.find(b => norm(b.textContent).toLowerCase().includes("adicionar")) ||
      null
    );
  }

  async function ensureTabela22() {
    const input = await waitFor(() => document.getElementById(TABLE_INPUT_ID), 25000);
    if (!input) return { ok: false, reason: "table_input_not_found" };

    await typeEnterAndWait(input, TABLE_FALLBACK_QUERY, TABLE_EXPECT);
    return { ok: true, chosen: "22 (assentou)" };
  }

  async function pickProcedure(code) {
    const procInput = await waitFor(() => document.getElementById(PROC_INPUT_ID), 25000);
    if (!procInput) return { ok: false, reason: "proc_input_not_found" };

    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTabela22();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };
      await delay(250);
    }

    await typeEnterAndWait(procInput, String(code), String(code).replace(/\D/g, "").slice(0, 4));
    return { ok: true, chosen: `(ok) ${code}` };
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

      setStatus("🧪 Selecionando Tabela 22 (WAIT)...");
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
  log("✅ Painel carregado (ENTER + WAIT por campo).");
})();
