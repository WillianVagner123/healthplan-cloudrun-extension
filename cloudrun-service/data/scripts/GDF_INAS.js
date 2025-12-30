/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["form", "input", "label"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS__) return;
  window.__GDF_INAS__ = true;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err = (...a) => console.error("GDF_INAS:", ...a);

  // =========================
  // ✅ CONFIG (ajuste aqui)
  // =========================
  const TABLE_PICK_MODE = "index"; // "index" | "text"
  const TABLE_OPTION_INDEX = 3;    // option-3 (se mode=index)
  const TABLE_OPTION_TEXT  = "22"; // se mode=text, procura opção contendo isso
  const QTY_DEFAULT = "1";

  // fallback se não vier do kit/payload
  const CODES_FALLBACK = []; // ex: ["40301087","40301150"]

  // Estado simples em memória
  let PROCS_RUNNING = false;

  // payload do Maskara (se você já envia codes no botão Executar Kit)
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];

  function getCodes() {
    if (codesFromPayload.length) return codesFromPayload;
    return CODES_FALLBACK.map(String);
  }

  // =========================
  // ✅ UI Painel
  // =========================
  function createPanel() {
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
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,.35);
      font-family: system-ui, sans-serif;
      width: 260px;
    `;

    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px">GDF INAS</div>

      <input id="gdfCpf"
        placeholder="CPF ou Carteirinha"
        style="width:100%;padding:6px;border-radius:6px;border:none;margin-bottom:8px"/>

      <button id="btnCadastro" style="width:100%;margin-bottom:6px;padding:8px;border-radius:8px;border:none;cursor:pointer">
        📄 Inserir Dados Cadastrais
      </button>

      <button id="btnProcedimentos" style="width:100%;padding:8px;border-radius:8px;border:none;cursor:pointer;background:#22c55e;color:#07210f;font-weight:700">
        🧪 Inserir Procedimentos
      </button>

      <div id="gdfStatus" style="margin-top:8px;font-size:12px;opacity:.9;line-height:1.3">
        Pronto.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnCadastro").onclick = runCadastro;
    panel.querySelector("#btnProcedimentos").onclick = runProcedimentos;
  }

  function setStatus(txt) {
    const el = document.getElementById("gdfStatus");
    if (el) el.textContent = txt;
  }

  // =========================
  // ✅ Helpers gerais
  // =========================
  function norm(s) { return (s || "").toString().replace(/\s+/g, " ").trim(); }

  function fire(el, type) {
    el?.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function ghostType(el, text, d = 12) {
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    for (const c of String(text)) {
      el.value += c;
      fire(el, "input");
      await delay(d);
    }
    fire(el, "change");
  }

  async function waitFor(fnOrSel, timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = (typeof fnOrSel === "string") ? document.querySelector(fnOrSel) : fnOrSel();
      if (el) return el;
      await delay(100);
    }
    return null;
  }

  function findFieldByLabel(labelText) {
    const labels = Array.from(document.querySelectorAll("label"));
    const lab = labels.find(l => norm(l.textContent).toLowerCase().includes(labelText.toLowerCase()));
    if (!lab) return null;
    return lab.closest("div") || lab.parentElement || null;
  }

  function findReactSelectInputWithin(container) {
    if (!container) return null;
    return container.querySelector("input[id^='react-select-'][id$='-input']") || null;
  }

  function baseIdFromInput(input) {
    const id = input?.id || "";
    const m = id.match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  async function openSelect(input) {
    input.focus();
    input.click();
    fire(input, "focus");
    fire(input, "mousedown");
    await delay(120);
  }

  async function waitOptions(baseId, timeoutMs = 12000) {
    return await waitFor(() => {
      const opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`));
      return opts.length ? opts : null;
    }, timeoutMs);
  }

  async function pickOption(baseId, { index = 0, text = null } = {}) {
    const opts = await waitOptions(baseId, 12000);
    if (!opts) return { ok: false, reason: "no_options" };

    let chosen = null;
    if (text) {
      const t = text.toLowerCase();
      chosen = opts.find(o => norm(o.textContent).toLowerCase().includes(t)) || null;
    }
    if (!chosen) chosen = opts[index] || opts[0] || null;
    if (!chosen) return { ok: false, reason: "no_choice" };

    chosen.scrollIntoView?.({ block: "center" });
    await delay(80);
    chosen.click();
    return { ok: true, chosenText: norm(chosen.textContent), total: opts.length };
  }

  // =========================
  // 📄 CADASTRO (o seu fluxo)
  // =========================
  async function selectReactById(inputId, typeText, optionContains) {
    const input = document.getElementById(inputId);
    if (!input) throw new Error(`Input ${inputId} não encontrado`);
    await openSelect(input);
    await ghostType(input, typeText, 12);
    await delay(500);

    const base = baseIdFromInput(input);
    const res = await pickOption(base, { text: optionContains || typeText, index: 0 });
    if (!res.ok) throw new Error(`Falha ao escolher opção em ${inputId}`);
  }

  async function runCadastro() {
    try {
      const cpf = document.getElementById("gdfCpf")?.value?.trim();
      if (!cpf) return alert("Informe CPF ou Carteirinha");

      setStatus("📄 Preenchendo cadastro...");

      const cpfInput = await waitFor("input[placeholder*='Procure pelo CPF']", 25000);
      if (!cpfInput) throw new Error("Campo CPF/Carteirinha não encontrado.");

      await ghostType(cpfInput, cpf, 10);

      await selectReactById("react-select-3-input",  "28381",  "28381");
      await selectReactById("react-select-21-input", "999999", "999999");
      await selectReactById("react-select-5-input",  "01",     "Ambulatorial");
      await selectReactById("react-select-6-input",  "CLINICA MEDICA", "CLINICA");
      await selectReactById("react-select-7-input",  "Eletivo", "Eletivo");
      await selectReactById("react-select-9-input",  "04 - Consulta", "04 - Consulta");
      await selectReactById("react-select-11-input", "E88", "E88");
      await selectReactById("react-select-16-input", "28381", "28381");
      await selectReactById("react-select-22-input", "999999", "999999");

      setStatus("✅ Cadastro preenchido.");
      alert("✅ Dados cadastrais preenchidos");
    } catch (e) {
      err(e);
      setStatus("❌ Erro no cadastro.");
      alert("Erro no cadastro: " + (e?.message || e));
    }
  }

  // =========================
  // 🧪 PROCEDIMENTOS (tudo aqui)
  // =========================
  function procedureInputEnabled(input) {
    return !!input && !input.disabled && input.getAttribute("aria-disabled") !== "true";
  }

  function findQtyInput() {
    const box = findFieldByLabel("Quantidade");
    if (box) {
      const inp = box.querySelector("input[type='number']");
      if (inp) return inp;
    }
    return document.querySelector("input[type='number']") || null;
  }

  function findAddButton() {
    // no rodapé tem um botão grande "+ Adicionar" (no print)
    const btnText = Array.from(document.querySelectorAll("button"))
      .find(b => norm(b.textContent).toLowerCase() === "adicionar");
    if (btnText) return btnText;

    // fallback: procura botão que contenha "Adicionar"
    return Array.from(document.querySelectorAll("button"))
      .find(b => norm(b.textContent).toLowerCase().includes("adicionar")) || null;
  }

  async function ensureTableSelected() {
    const tableBox = findFieldByLabel("Tabela");
    const tableInput = findReactSelectInputWithin(tableBox);
    if (!tableInput) return { ok: false, reason: "table_input_not_found" };

    await openSelect(tableInput);
    const baseId = baseIdFromInput(tableInput);
    if (!baseId) return { ok: false, reason: "table_baseid_missing" };

    const pick =
      TABLE_PICK_MODE === "text"
        ? await pickOption(baseId, { text: TABLE_OPTION_TEXT, index: 0 })
        : await pickOption(baseId, { index: TABLE_OPTION_INDEX });

    if (!pick.ok) return { ok: false, reason: "table_pick_failed", detail: pick };
    return { ok: true, chosen: pick.chosenText };
  }

  async function fillOneProcedure(code) {
    const tableBox = findFieldByLabel("Tabela");
    const procBox  = findFieldByLabel("Código e descrição");
    const tableInput = findReactSelectInputWithin(tableBox);
    const procInput  = findReactSelectInputWithin(procBox);

    if (!tableInput) return { ok: false, reason: "table_input_not_found" };
    if (!procInput)  return { ok: false, reason: "proc_input_not_found" };

    // garante tabela selecionada se procedimento estiver disabled
    if (!procedureInputEnabled(procInput)) {
      const t = await ensureTableSelected();
      if (!t.ok) return { ok: false, reason: "table_not_selected", detail: t };

      // espera habilitar
      const enabled = await waitFor(() => procedureInputEnabled(procInput) ? true : null, 15000);
      if (!enabled) return { ok: false, reason: "proc_stayed_disabled" };
    }

    // abrir e digitar o código
    await openSelect(procInput);
    await ghostType(procInput, String(code), 14);
    await delay(550);

    // escolher a primeira opção retornada (option-0)
    const procBase = baseIdFromInput(procInput);
    if (!procBase) return { ok: false, reason: "proc_baseid_missing" };

    const pickProc = await pickOption(procBase, { index: 0 });
    if (!pickProc.ok) return { ok: false, reason: "proc_pick_failed", detail: pickProc };

    // quantidade = 1
    const qty = findQtyInput();
    if (!qty) return { ok: false, reason: "qty_not_found" };
    qty.focus();
    qty.value = "";
    fire(qty, "input"); fire(qty, "change");
    await ghostType(qty, QTY_DEFAULT, 10);

    // clicar adicionar
    const addBtn = findAddButton();
    if (!addBtn) return { ok: false, reason: "add_button_not_found" };
    addBtn.click();

    return { ok: true, picked: pickProc.chosenText };
  }

  async function runProcedimentos() {
    try {
      if (PROCS_RUNNING) return;
      PROCS_RUNNING = true;

      const codes = getCodes();
      if (!codes.length) {
        PROCS_RUNNING = false;
        return alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      }

      setStatus(`🧪 Inserindo procedimentos... (0/${codes.length})`);

      // garante tabela no começo
      const t = await ensureTableSelected();
      if (!t.ok) throw new Error("Não consegui selecionar Tabela.");
      log("✅ Tabela:", t.chosen);

      const fails = [];
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        setStatus(`🧪 Inserindo procedimentos... (${i + 1}/${codes.length}) ${code}`);

        const r = await fillOneProcedure(code);
        if (!r.ok) {
          fails.push({ code, reason: r.reason, detail: r.detail || null });
          warn("Falha:", code, r);
          // tenta seguir pro próximo mesmo assim
          await delay(500);
          continue;
        }

        log("✅ Inserido:", code, "->", r.picked);
        await delay(700); // dá tempo do "Adicionar" processar
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

  // =========================
  // Init
  // =========================
  createPanel();
  log("✅ Painel carregado (Cadastro + Procedimentos).");
})();
