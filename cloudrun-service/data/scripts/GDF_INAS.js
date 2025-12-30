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
  // Ajuste pickExact para bater com o texto do dropdown.
  // E use fallbackQuery para filtrar se o texto exato não aparecer.
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
      fallbackQuery: "CLINICA"
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
  const TABLE_PICK_EXACT = "22 - Procedimentos e eventos em saúde";
  const QTY_DEFAULT = "1";

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK).map(String);

  // =========================================================
  // ✅ Estado
  // =========================================================
  const STORE_KEY = "gdf_inas_state_v5";
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
  // ✅ React-Select Helpers (robusto)
  // =========================================================
  const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();

  function fire(el, type) {
    el?.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function waitFor(getter, timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = (typeof getter === "string") ? document.querySelector(getter) : getter();
      if (el) return el;
      await delay(120);
    }
    return null;
  }

  function baseIdFromInput(input) {
    const id = input?.id || "";
    const m = id.match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  function findListbox(baseId) {
    return document.getElementById(`${baseId}-listbox`) || document.querySelector(`[id='${baseId}-listbox']`) || null;
  }

  async function getOptions(baseId, timeoutMs = 15000) {
    return await waitFor(() => {
      const listbox = findListbox(baseId);

      // React-select pode renderizar:
      // 1) div#react-select-XX-option-Y
      // 2) elementos com role="option" dentro do listbox
      let opts = [];
      opts = opts.concat(Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`)));

      if (listbox) {
        opts = opts.concat(Array.from(listbox.querySelectorAll(`[role='option']`)));
      } else {
        // fallback global (quando listbox não aparece com id)
        opts = opts.concat(Array.from(document.querySelectorAll(`[role='option']`)));
      }

      // remove duplicados
      const uniq = [];
      const seen = new Set();
      for (const o of opts) {
        const key = o.id || o.getAttribute("data-value") || o.textContent;
        if (!seen.has(key)) { seen.add(key); uniq.push(o); }
      }

      return uniq.length ? uniq : null;
    }, timeoutMs);
  }

  async function openSelect(input) {
    input.scrollIntoView?.({ block: "center" });
    await delay(80);
    input.focus();
    input.click();
    fire(input, "mousedown");
    await delay(250);
  }

  async function typeFilter(input, text) {
    // Em React-Select, digitar filtra a lista
    input.focus();
    input.value = "";
    fire(input, "input"); fire(input, "change");
    for (const ch of String(text)) {
      input.value += ch;
      fire(input, "input");
      await delay(16);
    }
    fire(input, "change");
    await delay(450);
  }

  async function selectSmart({ id, pickExact, fallbackQuery }) {
    const input = await waitFor(() => document.getElementById(id), 25000);
    if (!input) throw new Error(`Não achei o campo ${id}`);

    await openSelect(input);

    const baseId = baseIdFromInput(input);
    if (!baseId) throw new Error(`baseId não encontrado para ${id}`);

    // 1) tenta achar opção exata logo de cara
    let opts = await getOptions(baseId, 8000);
    if (opts?.length) {
      const exact = norm(pickExact).toLowerCase();
      const chosenExact = opts.find(o => norm(o.textContent).toLowerCase() === exact);
      if (chosenExact) {
        chosenExact.scrollIntoView?.({ block: "center" });
        await delay(80);
        chosenExact.click();
        return norm(chosenExact.textContent);
      }
    }

    // 2) se não achou, digita um filtro (fallbackQuery)
    if (fallbackQuery) {
      await typeFilter(input, fallbackQuery);
      opts = await getOptions(baseId, 12000);
      if (opts?.length) {
        const exact = norm(pickExact).toLowerCase();
        const chosenExact = opts.find(o => norm(o.textContent).toLowerCase() === exact);
        const chosen = chosenExact || opts[0];

        chosen.scrollIntoView?.({ block: "center" });
        await delay(80);
        chosen.click();
        return norm(chosen.textContent);
      }
    }

    // 3) último fallback: tenta clicar o primeiro role=option visível (global)
    const any = Array.from(document.querySelectorAll(`[role='option']`)).find(o => o.offsetParent !== null);
    if (any) {
      any.scrollIntoView?.({ block: "center" });
      await delay(80);
      any.click();
      return norm(any.textContent);
    }

    // log para você ver no console o que apareceu
    console.error("GDF_INAS: Não consegui opções para", id, { pickExact, fallbackQuery, baseId });
    throw new Error(`Não consegui selecionar opção para ${id}`);
  }

  // =========================================================
  // ✅ Obrigatórios (guia)
  // =========================================================
  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios da guia...");

      await selectSmart(MANDATORY.prof_solicitante);
      await selectSmart(MANDATORY.cbo_solicitante);

      await selectSmart(MANDATORY.regime);
      await selectSmart(MANDATORY.especialidade);
      await selectSmart(MANDATORY.carater);

      await selectSmart(MANDATORY.tipo_consulta);
      await selectSmart(MANDATORY.cid);

      await selectSmart(MANDATORY.prof_exec);
      await selectSmart(MANDATORY.cbo_exec);

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

    await openSelect(input);

    const baseId = baseIdFromInput(input);
    if (!baseId) return { ok: false, reason: "table_baseid_missing" };

    // tenta achar exato; se não, filtra por "22"
    let opts = await getOptions(baseId, 8000);
    if (!opts?.length) {
      await typeFilter(input, "22");
      opts = await getOptions(baseId, 12000);
    }
    if (!opts?.length) return { ok: false, reason: "table_no_options" };

    const exact = norm(TABLE_PICK_EXACT).toLowerCase();
    const chosen =
      opts.find(o => norm(o.textContent).toLowerCase() === exact) ||
      opts.find(o => norm(o.textContent).toLowerCase().startsWith("22 -")) ||
      opts[0];

    chosen.scrollIntoView?.({ block: "center" });
    await delay(80);
    chosen.click();

    return { ok: true, chosen: norm(chosen.textContent) };
  }

  async function pickProcedure(code) {
    const procInput = await waitFor(() => document.getElementById(PROC_INPUT_ID), 25000);
    if (!procInput) return { ok: false, reason: "proc_input_not_found" };

    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTabela22();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };

      const enabled = await waitFor(() => procedureInputEnabled(procInput) ? true : null, 15000);
      if (!enabled) return { ok: false, reason: "proc_stayed_disabled" };
    }

    await openSelect(procInput);
    await typeFilter(procInput, String(code));

    const baseId = baseIdFromInput(procInput);
    if (!baseId) return { ok: false, reason: "proc_baseid_missing" };

    const opts = await getOptions(baseId, 12000);
    if (!opts?.length) return { ok: false, reason: "proc_no_options" };

    const chosen = opts[0];
    chosen.scrollIntoView?.({ block: "center" });
    await delay(80);
    chosen.click();

    return { ok: true, chosen: norm(chosen.textContent) };
  }

  async function fillOne(code) {
    const p = await pickProcedure(code);
    if (!p.ok) return p;

    const qty = findQtyInput();
    if (!qty) return { ok: false, reason: "qty_not_found" };

    qty.scrollIntoView?.({ block: "center" });
    await delay(60);

    qty.focus();
    qty.value = "";
    fire(qty, "input"); fire(qty, "change");

    for (const ch of String(QTY_DEFAULT)) {
      qty.value += ch;
      fire(qty, "input");
      await delay(10);
    }
    fire(qty, "change");
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

      setStatus("🧪 Selecionando Tabela 22...");
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
  log("✅ Painel carregado (Obrigatórios + Procedimentos) — sem CPF/carteirinha.");
})();
