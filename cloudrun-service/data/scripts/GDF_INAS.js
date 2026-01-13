/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V11_2__) return;
  window.__GDF_INAS_V11_2__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v11_2";
  const loadSt  = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveSt  = (st) => localStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearSt = () => localStorage.removeItem(STORE_KEY);

  const norm  = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
  const normL = (s) => norm(s).toLowerCase();

  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

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

  // =========================
  // Robust click
  // =========================
  function robustClick(el) {
    if (!el) return false;
    el.scrollIntoView?.({ block: "center" });
    try { el.focus?.(); } catch {}

    const rect = el.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : 1;
    const y = rect ? rect.top + rect.height / 2 : 1;

    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    try { el.dispatchEvent(new MouseEvent("mousemove", opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent("mouseover", opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent("mousedown", opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent("mouseup", opts)); } catch {}
    try { el.dispatchEvent(new MouseEvent("click", opts)); } catch {}

    try { el.click?.(); } catch {}
    return true;
  }

  async function waitNotBusy(scope = document, timeoutMs = 9000) {
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
      await delay(120);
    }
    return false;
  }

  // =========================
  // ✅ Localiza o "bloco" de procedimentos (onde estão Tabela/Procedimento/Qtd/Adicionar)
  // =========================
  function getProcBlock() {
    // tenta achar pelo texto do cabeçalho
    const headers = Array.from(document.querySelectorAll("h1,h2,h3,h4,div,span"))
      .filter(el => isVisible(el) && normL(el.textContent).includes("adicionar procedimento"));

    // pega o mais próximo que tenha inputs e botão "Adicionar"
    for (const h of headers) {
      const scope = h.closest("section") || h.closest("form") || h.parentElement;
      if (!scope) continue;

      const hasReactInputs = scope.querySelectorAll("input[id^='react-select-'][id$='-input']").length >= 2;
      const hasAddBtn = Array.from(scope.querySelectorAll("button")).some(b => normL(b.textContent) === "adicionar");
      if (hasReactInputs && hasAddBtn) return scope;
    }

    // fallback: procura um container que tenha 2 react-select + botão Adicionar
    const candidates = Array.from(document.querySelectorAll("section, form, div"))
      .filter(scope => {
        if (!isVisible(scope)) return false;
        const rs = scope.querySelectorAll("input[id^='react-select-'][id$='-input']");
        if (rs.length < 2) return false;
        const hasAdd = Array.from(scope.querySelectorAll("button")).some(b => normL(b.textContent) === "adicionar");
        return hasAdd;
      });

    // pega o menor (mais “local”)
    candidates.sort((a,b) => a.querySelectorAll("*").length - b.querySelectorAll("*").length);
    return candidates[0] || null;
  }

  function getProcFields() {
    const block = getProcBlock();
    if (!block) return null;

    // Dentro do bloco, os dois primeiros react-select costumam ser:
    // 1) Tabela | 2) Procedimento
    const rsInputs = Array.from(block.querySelectorAll("input[id^='react-select-'][id$='-input']")).filter(isVisible);

    if (rsInputs.length < 2) return null;

    const tableInput = rsInputs[0];
    const procInput  = rsInputs[1];

    const qtyInput = Array.from(block.querySelectorAll("input[type='number']")).filter(isVisible)[0] || null;

    const addBtn = Array.from(block.querySelectorAll("button"))
      .filter(b => isVisible(b) && !b.disabled && normL(b.textContent) === "adicionar")[0] || null;

    return {
      block,
      tableInput,
      procInput,
      qtyInput,
      addBtn
    };
  }

  // =========================
  // SingleValue helpers (React-Select)
  // =========================
  function getSingleValueTextByInput(inputEl) {
    if (!inputEl) return "";
    const root =
      inputEl.closest(".css-b62m3t-container") ||
      inputEl.closest("[class*='container']") ||
      inputEl.parentElement;
    const single = root ? root.querySelector("[class*='singleValue']") : null;
    return norm(single?.textContent || "");
  }

  // =========================
  // ✅ Seleciona opção no react-select (clicando na opção)
  // =========================
async function pickReactSelectOptionByStartsWith(inputEl, queryText, startsWithText, {
  waitOptionsMs = 18000,
  perPollMs = 120,
  afterClickSettleMs = 250,
  settlePollMs = 120,
  settleTimeoutMs = 6000
} = {}) {
  if (!inputEl) throw new Error("inputEl inválido");

  inputEl.scrollIntoView?.({ block: "center" });
  inputEl.focus();
  inputEl.click();
  await delay(120);

  // limpa e digita
  setNativeValue(inputEl, "");
  fireInput(inputEl);
  await delay(80);

  setNativeValue(inputEl, String(queryText));
  fireInput(inputEl);

  const baseId = baseIdFromInputId(inputEl.id);
  if (!baseId) throw new Error("baseId do react-select não encontrado");

  // espera opções
  const t0 = Date.now();
  let opts = [];
  while (Date.now() - t0 < waitOptionsMs) {
    opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
      .filter(o => o && isVisible(o));
    if (opts.length) break;
    await delay(perPollMs);
  }
  if (!opts.length) throw new Error("Sem opções no dropdown");

  const clean = opts.filter(o => norm(o.textContent));
  if (!clean.length) return { ok: false, reason: "blank_options" };

  const target =
    clean.find(o => normL(o.textContent).startsWith(normL(startsWithText))) ||
    clean[0];

  if (!target || !norm(target.textContent)) return { ok: false, reason: "blank_target" };

  target.scrollIntoView?.({ block: "center" });
  await delay(80);

  robustClick(target);
  await delay(afterClickSettleMs);

  // ✅ aguardando "assentar" no singleValue (isso é o timing que faltava)
  const settleStart = Date.now();
  while (Date.now() - settleStart < settleTimeoutMs) {
    const picked = getSingleValueTextByInput(inputEl);
    if (picked && normL(picked).startsWith(normL(startsWithText))) {
      return { ok: true };
    }
    await delay(settlePollMs);
  }

  return { ok: false, reason: "not_settled" };
}


  // =========================
  // ✅ Garantir Tabela 22 (dinâmico)
  // =========================
 let __TABELA_22_OK__ = false;

async function ensureTabela22_fast({ force = false } = {}) {
  const f = getProcFields();
  if (!f?.tableInput) throw new Error("Não achei campo Tabela no bloco de procedimentos.");

  const already = getSingleValueTextByInput(f.tableInput);

  // ✅ se já está certo, não mexe
  if (!force && already.startsWith("22 -")) {
    __TABELA_22_OK__ = true;
    return true;
  }

  // ✅ se já marcamos OK, só revalida sem clicar
  if (!force && __TABELA_22_OK__ && already.startsWith("22 -")) return true;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // re-obter campos a cada tentativa (React re-render)
      const fx = getProcFields();
      if (!fx?.tableInput) throw new Error("Campo Tabela sumiu (re-render).");

      // tenta selecionar 22
      const r = await pickReactSelectOptionByStartsWith(
        fx.tableInput,
        "22",
        "22 -",
        {
          waitOptionsMs: 20000,
          afterClickSettleMs: 350,
          settleTimeoutMs: 8000
        }
      );

      if (!r.ok) throw new Error(`Tabela 22 não assentou (reason=${r.reason})`);

      // ✅ dupla confirmação final
      await delay(250);
      const picked = getSingleValueTextByInput(fx.tableInput);
      if (picked.startsWith("22 -")) {
        __TABELA_22_OK__ = true;
        log("✅ Tabela selecionada:", picked);
        return true;
      }

      throw new Error("Tabela não assentou como 22.");
    } catch (e) {
      warn(`Tabela 22 tentativa ${attempt}/3 falhou:`, e?.message || e);
      await delay(450);
    }
  }

  throw new Error("Não consegui selecionar a Tabela 22.");
}

  // =========================
  // ✅ Limpar Procedimento (sem Enter!)
  // =========================
  function clearProcedureSelectHard(procInputEl) {
    if (!procInputEl) return;

    const root =
      procInputEl.closest(".css-b62m3t-container") ||
      procInputEl.closest("[class*='container']") ||
      procInputEl.parentElement;

    // tenta clicar no X
    const clearBtn = root?.querySelector("[class*='clearIndicator']");
    if (clearBtn && isVisible(clearBtn)) robustClick(clearBtn);

    // garante limpar digitando vazio
    procInputEl.focus();
    setNativeValue(procInputEl, "");
    fireInput(procInputEl);
  }

  // =========================
  // ✅ Confirmar inserção sem duplicar:
  // Conta quantas vezes o "código" aparece na tabela/lista
  // =========================
  function countCodeInList(blockEl, code) {
    if (!blockEl) return 0;
    const text = blockEl.innerText || "";
    const re = new RegExp(String(code).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const m = text.match(re);
    return m ? m.length : 0;
  }

  async function waitCodeCountIncrease(blockEl, code, prevCount, timeoutMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const now = countCodeInList(blockEl, code);
      if (now > prevCount) return true;
      await delay(150);
    }
    return false;
  }

  // =========================
  // ✅ Selecionar Procedimento com retry (sem Enter)
  // =========================
  async function pickProcedureWithRetry(code, {
    cycles = 8,
    perCycleWaitMs = 3500,
    betweenCyclesMs = 320
  } = {}) {
    const f = getProcFields();
    if (!f?.procInput) throw new Error("Não achei campo Procedimento no bloco de procedimentos.");

    const procInput = f.procInput;
    const codeL = String(code).toLowerCase();

    for (let attempt = 1; attempt <= cycles; attempt++) {
      clearProcedureSelectHard(procInput);
      await delay(120);

      // digita o código e espera opções
      procInput.scrollIntoView?.({ block: "center" });
      procInput.focus();
      procInput.click();
      await delay(90);

      setNativeValue(procInput, String(code));
      fireInput(procInput);

      const baseId = baseIdFromInputId(procInput.id);
      if (!baseId) {
        warn(`PROC: baseId não encontrado (${attempt}/${cycles})`);
        await delay(betweenCyclesMs);
        continue;
      }

      const t0 = Date.now();
      let opts = [];
      while (Date.now() - t0 < perCycleWaitMs) {
        opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
          .filter(o => o && isVisible(o));
        if (opts.length) break;
        await delay(120);
      }

      if (!opts.length) {
        warn(`PROC: sem opções (${attempt}/${cycles}) code=${code}`);
        await delay(betweenCyclesMs);
        continue;
      }

      const clean = opts.filter(o => norm(o.textContent));
      if (!clean.length) return { ok: false, reason: "not_found_blank" };

      const target =
        clean.find(o => normL(o.textContent).startsWith(codeL)) ||
        clean.find(o => normL(o.textContent).includes(codeL)) ||
        clean[0];

      if (!target || !norm(target.textContent)) return { ok: false, reason: "not_found_blank_target" };

      robustClick(target);
      await delay(220);

      const picked = getSingleValueTextByInput(procInput);
      if (picked && normL(picked).includes(codeL)) {
        log(`✅ PROC selecionado: ${picked}`);
        return { ok: true };
      }

      warn(`PROC: clique não assentou (${attempt}/${cycles}) code=${code} | single="${picked}"`);
      await delay(betweenCyclesMs);
    }

    return { ok: false, reason: "not_found_after_retries" };
  }

  // =========================
  // ✅ Inserir 1 procedimento (sem duplicar + ids dinâmicos)
  // =========================
  async function insertOneProcedure(code) {
    // Sempre re-obter os campos (IDs mudam!)
    let f = getProcFields();
    if (!f) throw new Error("Não consegui localizar o bloco de procedimentos.");

    await ensureTabela22_fast();

    // re-obter novamente após mexer na tabela (react re-render)
    f = getProcFields();
    if (!f?.procInput) throw new Error("Campo Procedimento não encontrado (re-render).");

    const pick = await pickProcedureWithRetry(code);
    if (!pick.ok) {
      warn(`⏭️ Código ${code} fora do convênio. Pulando... (${pick.reason})`);
      return { skipped: true, code, reason: pick.reason };
    }

    // re-obter (pós seleção)
    f = getProcFields();
    if (!f?.qtyInput) throw new Error("Quantidade não encontrada.");
    if (!f?.addBtn) throw new Error("Botão Adicionar não encontrado.");

    // seta quantidade
    f.qtyInput.focus();
    setNativeValue(f.qtyInput, "");
    fireInput(f.qtyInput);
    await delay(120);
    setNativeValue(f.qtyInput, "1");
    fireInput(f.qtyInput);
    await delay(180);

    // ✅ anti-duplicação: conta o código antes
    const beforeCount = countCodeInList(f.block, code);

    // clica UMA vez
    robustClick(f.addBtn);

    // espera aumentar a contagem do código
    let ok = await waitCodeCountIncrease(f.block, code, beforeCount, 12000);

    if (!ok) {
      // fallback: esperar busy acabar e checar de novo (SEM 2º clique automático)
      await waitNotBusy(f.block, 9000);
      const afterCount = countCodeInList(f.block, code);
      ok = afterCount > beforeCount;
    }

    if (!ok) {
      throw new Error("Não confirmou inclusão após clicar Adicionar (sem duplicar).");
    }

    await delay(260);
    return { skipped: false, code };
  }

  // =========================
  // Obrigatórios (mantido)
  // =========================
  const MANDATORY = {
    prof_solicitante: { id: "react-select-3-input",  text: "22416",  waitBeforeEnterMs: 1600 },
    cbo_solicitante:  { id: "react-select-21-input", text: "999999", waitBeforeEnterMs: 700  },

    regime:           { id: "react-select-5-input",  text: "01 – Ambulatorial", waitBeforeEnterMs: 650  },
    especialidade:    { id: "react-select-6-input",  text: "CLINICA MEDICA",     waitBeforeEnterMs: 1600 },
    carater:          { id: "react-select-7-input",  text: "1 – Eletivo",        waitBeforeEnterMs: 650  },

    tipo_consulta:    { id: "react-select-9-input",  text: "04", waitBeforeEnterMs: 250 },

    cid:              { id: "react-select-11-input", text: "E88", waitBeforeEnterMs: 1600 },

    prof_exec:        { id: "react-select-16-input", text: "22416",  waitBeforeEnterMs: 1600 },
    cbo_exec:         { id: "react-select-22-input", text: "999999", waitBeforeEnterMs: 700  },
  };

  async function fillReactSelectById(id, text, waitBeforeEnterMs = 0) {
    const input = await waitFor(() => document.getElementById(id), 25000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    input.focus();
    input.click();
    await delay(80);

    setNativeValue(input, "");
    fireInput(input);
    await delay(60);

    setNativeValue(input, String(text));
    fireInput(input);

    if (waitBeforeEnterMs) await delay(waitBeforeEnterMs);

    // aqui mantemos Enter porque você disse que nos obrigatórios funciona bem
    input.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter" }));
    input.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter" }));
    await delay(200);
  }

  // =========================
  // Payload codes
  // =========================
  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

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

  // =========================
  // Runs
  // =========================
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
        await fillReactSelectById(cfg.id, cfg.text, cfg.waitBeforeEnterMs || 0);
        await delay(220);
      }

      const st = loadSt() || {};
      st.obrigOk = true;
      st.obrigOkAt = new Date().toISOString();
      saveSt(st);

      lockProcs(false);
      setStatus("✅ Obrigatórios preenchidos.");
      alert("✅ Obrigatórios preenchidos.");
    } catch (e) {
      err(e);
      setStatus("❌ Erro ao preencher obrigatórios.");
      alert("Erro nos obrigatórios: " + (e?.message || e));
    }
  }

  async function runProcedimentos_independente() {
    const codes = getCodes();
    if (!codes.length) {
      alert("Sem códigos: payload.codes vazio e CODES_FALLBACK vazio.");
      return;
    }

    if (runProcedimentos_independente.__running) return;
    runProcedimentos_independente.__running = true;

    try {
      const fails = [];
      const skipped = [];

      for (let i = 0; i < codes.length; i++) {
        const code = String(codes[i]);
        setStatus(`🧪 Inserindo (${i + 1}/${codes.length}) ${code}`);

        try {
          const r = await insertOneProcedure(code);

          if (r?.skipped) {
            skipped.push({ code, reason: r.reason || "not_found" });
            log(`⏭️ Pulado: ${code} (${r.reason || "not_found"})`);
          } else {
            log("✅ Inserido:", code);
          }
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(450);
        }

        await delay(350); // cadência segura
      }

      if (fails.length) {
        setStatus(`⚠️ Finalizado com falhas: ${fails.length}/${codes.length} (pulados: ${skipped.length})`);
        alert("Finalizado com falhas. Veja console (F12) para detalhes.");
        console.table(fails);
        if (skipped.length) console.table(skipped);
      } else {
        setStatus(`🎉 Concluído! Inseridos: ${codes.length - skipped.length} | Pulados: ${skipped.length}`);
        alert(`🎉 Concluído! Inseridos: ${codes.length - skipped.length} | Pulados: ${skipped.length}`);
        if (skipped.length) console.table(skipped);
      }
    } finally {
      runProcedimentos_independente.__running = false;
    }
  }

  async function runProcedimentos() {
    const st = loadSt() || {};
    if (!st.obrigOk) {
      alert("Você não preencheu os obrigatórios. Se quiser rodar mesmo assim, use: Inserir Procedimentos (independente).");
      return;
    }
    return runProcedimentos_independente();
  }

  // =========================
  // Panel
  // =========================
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

      <button id="btnProcs" style="
        width:100%;
        margin-bottom:8px;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#22c55e;
        color:#0b1220;
        font-weight:900
      ">🧪 Inserir Procedimentos</button>

      <button id="btnProcsInd" style="
        width:100%;
        padding:10px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        background:#22c55e;
        color:#0b1220;
        font-weight:900
      ">🧪 Inserir Procedimentos (independente)</button>

      <div id="gdfStatus" style="margin-top:10px;font-size:12px;opacity:.92;line-height:1.35">
        v11.2: IDs dinâmicos + anti-duplicação por contagem do código.
      </div>

      <div style="margin-top:8px;font-size:11px;opacity:.8">
        Se dropdown vier em branco: considera “fora do convênio” e pula.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnObrig").onclick = runObrigatorios;
    panel.querySelector("#btnProcs").onclick = runProcedimentos;
    panel.querySelector("#btnProcsInd").onclick = runProcedimentos_independente;

    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      __TABELA_22_OK__ = false;
      lockProcs(false);
      setStatus("Reset feito.");
    };
  }

  // Init
  createPanel();
  log("✅ GDF_INAS v11.2: IDs dinâmicos + anti-duplicação (sem 2º clique automático).");
})();
