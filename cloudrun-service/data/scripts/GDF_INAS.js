/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V3__) return;
  window.__GDF_INAS_V3__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v3";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

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

  // =========================
  // ✅ Seus 7 campos (wrappers) — vamos usar eles como "âncora"
  // Cada um contém um input react-select-XX-input dentro.
  // =========================
  const FIELD_WRAPPERS = {
    // Profissional solicitante*
    prof_solicitante: "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div:nth-child(5) > div:nth-child(1) > div > div > div",
    // Código CBO* (solicitante)
    cbo_solicitante:  "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div:nth-child(7) > div:nth-child(2) > div > div > div",
    // Regime de Atendimento*
    regime:           "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div:nth-child(8) > div:nth-child(3) > div > div > div",
    // Especialidade da guia*
    especialidade:    "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-cOpnSz.kkUYBh > div:nth-child(1) > div > div > div",
    // Caráter do Atendimento*
    carater:          "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div:nth-child(14) > div:nth-child(1) > div > div > div",
    // Tabela* (procedimentos)
    tabela:           "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-eNLTQs.dVUnNT > form > div > div:nth-child(1) > div > div > div",
    // Procedimento* (campo onde entra o código do procedimento)
    procedimento:     "#__next > main > div.sc-NVzZH.zxZuT > form > div.sc-biMVnu.iyhJRT > div.sc-eNLTQs.dVUnNT > form > div > div:nth-child(2) > div > div > div",
  };

  // =========================
  // ✅ Valores que você quer
  // (SEM CPF/carteirinha)
  // =========================
  const VALUES = {
    prof_solicitante: "22416",
    cbo_solicitante:  "999999",
    regime:           "01 – Ambulatorial",
    especialidade:    "CLINICA MEDICA",
    carater:          "1 – Eletivo",
    tabela:           "22",
  };

  // Campo do procedimento vai vir da lista payload.codes (kit)
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = []; // opcional
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

  // =========================
  // ✅ Espera "de verdade" antes do ENTER:
  // 1) digita texto
  // 2) espera o menu de opções aparecer (listbox / option-0)
  // 3) quando aparecer, dá ENTER
  // =========================
  function findInputInsideWrapper(wrapperEl) {
    if (!wrapperEl) return null;
    return wrapperEl.querySelector("input[id^='react-select-'][id$='-input']") || wrapperEl.querySelector("input") || null;
  }

  function baseIdFromInput(input) {
    const id = input?.id || "";
    const m = id.match(/^(react-select-\d+)-input$/);
    return m ? m[1] : null;
  }

  function dropdownIsOpenForInput(input) {
    // React-select geralmente cria uma div com id baseId-listbox
    const baseId = baseIdFromInput(input);
    if (!baseId) return false;
    const listbox = document.getElementById(`${baseId}-listbox`);
    return !!listbox;
  }

  function firstOptionExists(input) {
    const baseId = baseIdFromInput(input);
    if (!baseId) return false;
    return !!document.getElementById(`${baseId}-option-0`);
  }

  async function waitDropdownReady(input, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      // 1) listbox existe ou 2) option-0 existe
      if (dropdownIsOpenForInput(input) || firstOptionExists(input)) return true;
      await delay(120);
    }
    return false;
  }

  async function typeAndEnterWhenLoaded(wrapperSelector, text, {
    typeDelay = 14,
    afterTypeMinDelay = 250,
    dropdownTimeoutMs = 25000,
    afterEnterDelay = 450,
    secondEnter = true,
  } = {}) {
    const wrap = await waitFor(wrapperSelector, 35000);
    if (!wrap) throw new Error("Wrapper não encontrado: " + wrapperSelector);

    const input = findInputInsideWrapper(wrap);
    if (!input) throw new Error("Input não encontrado dentro do wrapper: " + wrapperSelector);

    // clica no wrapper (abre)
    wrap.scrollIntoView?.({ block: "center" });
    await delay(120);
    wrap.click();
    await delay(120);

    input.focus();
    input.click();
    await delay(80);

    // limpa
    setNativeValue(input, "");
    fireInput(input);
    await delay(60);

    // digita SEMPRE
    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(typeDelay);
    }

    // dá uma folga mínima pra iniciar busca
    await delay(afterTypeMinDelay);

    // ✅ AQUI é o que você pediu:
    // esperar o "carregar" (opções aparecerem) ANTES do ENTER
    const ok = await waitDropdownReady(input, dropdownTimeoutMs);
    if (!ok) throw new Error("Não carregou opções a tempo para: " + wrapperSelector);

    // agora sim ENTER
    pressEnter(input);
    await delay(afterEnterDelay);

    // alguns campos só confirmam no 2º ENTER
    if (secondEnter) {
      // espera o dropdown fechar / valor assentar um pouquinho
      await delay(220);
      pressEnter(input);
      await delay(320);
    }

    return true;
  }

  // =========================
  // ✅ Procedimentos: Tabela + Procedimento (mesma regra)
  // =========================
  function findQtyInputNearProcedures() {
    // tenta achar o number dentro do form interno de procedimentos
    const procWrap = document.querySelector(FIELD_WRAPPERS.procedimento);
    const scope = procWrap?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']"));
    return nums.find(n => n.offsetParent !== null) || nums[0] || null;
  }

  function findAddButtonNearProcedures() {
    const procWrap = document.querySelector(FIELD_WRAPPERS.procedimento);
    const scope = procWrap?.closest("form") || document;
    const buttons = Array.from(scope.querySelectorAll("button"));
    const t = (s) => (s || "").toString().trim().toLowerCase();
    return buttons.find(b => t(b.textContent) === "adicionar") ||
           buttons.find(b => t(b.textContent).includes("adicionar")) ||
           null;
  }

  async function ensureTabela22() {
    await typeAndEnterWhenLoaded(FIELD_WRAPPERS.tabela, VALUES.tabela, {
      dropdownTimeoutMs: 30000,
      secondEnter: true
    });
    return true;
  }

  async function insertOneProcedure(code) {
    // procedimento depende da tabela
    await ensureTabela22();

    await typeAndEnterWhenLoaded(FIELD_WRAPPERS.procedimento, code, {
      dropdownTimeoutMs: 35000,     // procedimento costuma demorar mais
      afterTypeMinDelay: 300,       // deixa iniciar a busca
      secondEnter: true
    });

    const qty = findQtyInputNearProcedures();
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(80);
    setNativeValue(qty, "1");
    fireInput(qty);
    await delay(150);

    const addBtn = findAddButtonNearProcedures();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    addBtn.click();
    await delay(900);
    return true;
  }

  // =========================
  // ✅ UI Panel
  // =========================
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
      btn.style.cursor = "not-allowed";
    } else {
      btn.style.background = "#22c55e";
      btn.style.cursor = "pointer";
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
        Beneficiário (CPF/carteirinha) é manual. Depois clique em “Preencher obrigatórios”.
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
    if (st.obrigOk) {
      lockProcs(false);
      setStatus("✅ Obrigatórios já marcados. Pode inserir procedimentos.");
    }
  }

  // =========================
  // ✅ Ações
  // =========================
  async function runObrigatorios() {
    try {
      setStatus("⏳ Preenchendo obrigatórios (espera carregar antes do ENTER)...");
      // 5 campos que você sinalizou (sem CPF/carteirinha)
      await typeAndEnterWhenLoaded(FIELD_WRAPPERS.prof_solicitante, VALUES.prof_solicitante, { dropdownTimeoutMs: 35000 });
      await typeAndEnterWhenLoaded(FIELD_WRAPPERS.cbo_solicitante,  VALUES.cbo_solicitante,  { dropdownTimeoutMs: 35000 });
      await typeAndEnterWhenLoaded(FIELD_WRAPPERS.regime,           VALUES.regime,           { dropdownTimeoutMs: 35000 });
      await typeAndEnterWhenLoaded(FIELD_WRAPPERS.especialidade,    VALUES.especialidade,    { dropdownTimeoutMs: 35000 });
      await typeAndEnterWhenLoaded(FIELD_WRAPPERS.carater,          VALUES.carater,          { dropdownTimeoutMs: 35000 });

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

  async function runProcedimentos() {
    const st = loadSt() || {};
    if (!st.obrigOk) {
      alert("Primeiro clique em ✅ Preencher obrigatórios (guia). Beneficiário é manual.");
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
      setStatus("🧪 Inserindo procedimentos (espera carregar antes do ENTER)...");
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
          await delay(700);
        }

        await delay(450);
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

  // =========================
  // Init
  // =========================
  createPanel();
  log("✅ Runner GDF_INAS carregado (espera carregar opções ANTES do ENTER nos 7 wrappers).");
})();
