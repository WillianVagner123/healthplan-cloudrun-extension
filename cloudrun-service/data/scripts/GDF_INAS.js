/*@maskara{
  "mustUrlIncludes": ["gdf.maida.health", "/solicitacoes/sp-sadt"],
  "detectAny": ["#__next", "form", "input", "button", "[id^='react-select-']"],
  "actions": {}
}*/

(() => {
  if (window.__GDF_INAS_V12__) return;
  window.__GDF_INAS_V12__ = true;

  // =========================
  // Utils
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GDF_INAS:", ...a);
  const warn = (...a) => console.warn("GDF_INAS:", ...a);
  const err  = (...a) => console.error("GDF_INAS:", ...a);

  const STORE_KEY = "gdf_inas_state_v12";
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

  function keyStroke(el, key, opts = {}) {
    if (!el) return;
    const ev = (type) => new KeyboardEvent(type, { bubbles: true, key, ...opts });
    el.dispatchEvent(ev("keydown"));
    el.dispatchEvent(ev("keypress"));
    el.dispatchEvent(ev("keyup"));
  }

  function pressEnter(el) {
    if (!el) return;
    keyStroke(el, "Enter", { code: "Enter", keyCode: 13, which: 13 });
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
  // ✅ Robust click for React
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
        !!scope.querySelector("[data-loading='true']");
      if (!hasBusy) return true;
      await delay(120);
    }
    return false;
  }

  // =========================
  // Helpers React-select value
  // =========================
  function getSingleValueTextByInputId(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return "";
    const root =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;
    const single = root ? root.querySelector("[class*='singleValue']") : null;
    return norm(single?.textContent || "");
  }

  // =========================
  // CONFIG
  // =========================
  const TABLE_INPUT_ID = "react-select-18-input"; // Tabela*
  const PROC_INPUT_ID  = "react-select-23-input"; // Procedimento*
  const QTY_DEFAULT = "1";

  // cache tabela
  let __TABELA_22_OK__ = false;
  let __LAST_PROC_CODE__ = null;

  const payload = window.__HP_PAYLOAD__ || {};
  const codesFromPayload = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  const CODES_FALLBACK = [];
  const getCodes = () => (codesFromPayload.length ? codesFromPayload : CODES_FALLBACK);

  function tabelaSingleValueText() {
    return getSingleValueTextByInputId(TABLE_INPUT_ID);
  }
  function procSingleValueText() {
    return getSingleValueTextByInputId(PROC_INPUT_ID);
  }

  // =========================
  // ✅ Fill select (generic)
  // =========================
  async function fillReactSelect({
    id,
    text,
    waitBeforeEnterMs = 0,
    waitOptionsMs = 20000,
    clickOption = false,
    optionStartsWith = null,
    optionExact = null,
    postWaitAfterPickMs = 200
  } = {}) {
    const input = await waitFor(() => document.getElementById(id), 50000);
    if (!input) throw new Error(`Campo não encontrado: ${id}`);

    input.scrollIntoView?.({ block: "center" });
    await delay(80);

    input.focus();
    input.click();
    await delay(60);

    setNativeValue(input, "");
    fireInput(input);
    await delay(40);

    let cur = "";
    for (const ch of String(text)) {
      cur += ch;
      setNativeValue(input, cur);
      fireInput(input);
      await delay(0);
    }

    if (waitBeforeEnterMs) await delay(waitBeforeEnterMs);

    const baseId = baseIdFromInputId(id);
    let opts = null;

    const t0 = Date.now();
    while (Date.now() - t0 < waitOptionsMs) {
      if (baseId) {
        opts = Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`))
          .filter(o => o && o.offsetParent !== null);
      }
      if (opts?.length) break;
      await delay(90);
    }

    if (clickOption) {
      if (!opts?.length) throw new Error(`Sem opções visíveis para ${id}`);

      const starts = optionStartsWith ? normL(optionStartsWith) : null;
      const exact  = optionExact ? normL(optionExact) : null;

      const pick =
        (exact ? opts.find(o => normL(o.textContent) === exact) : null) ||
        (starts ? opts.find(o => normL(o.textContent).startsWith(starts)) : null) ||
        opts[0];

      if (!pick || !norm(pick.textContent)) throw new Error(`Opção vazia em ${id}`);
      robustClick(pick);
      await delay(postWaitAfterPickMs);
      return true;
    }

    pressEnter(input);
    await delay(postWaitAfterPickMs);
    return true;
  }

  // =========================
  // ✅ Ensure tabela 22 (não roda toda hora)
  // =========================
  async function ensureTabela22() {
    const cur = tabelaSingleValueText();
    if (cur.startsWith("22 -")) {
      __TABELA_22_OK__ = true;
      return true;
    }
    if (__TABELA_22_OK__) {
      // re-render: às vezes some por 200ms, espera um pouco antes de mexer
      await delay(240);
      const cur2 = tabelaSingleValueText();
      if (cur2.startsWith("22 -")) return true;
      __TABELA_22_OK__ = false;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await fillReactSelect({
          id: TABLE_INPUT_ID,
          text: "22",
          waitBeforeEnterMs: 150,
          waitOptionsMs: 12000,
          clickOption: true,
          optionStartsWith: "22 -",
          postWaitAfterPickMs: 250
        });

        await delay(220);
        const picked = tabelaSingleValueText();
        if (picked.startsWith("22 -")) {
          __TABELA_22_OK__ = true;
          log("✅ Tabela selecionada:", picked);
          return true;
        }
        throw new Error("Tabela não assentou como 22.");
      } catch (e) {
        warn(`Tentativa ${attempt}/2 falhou ao selecionar Tabela 22:`, e?.message || e);
        await delay(260);
      }
    }
    throw new Error("Não consegui selecionar a Tabela 22.");
  }

  // =========================
  // ✅ Clear procedure select HARD
  // =========================
  function clearProcedureSelect() {
    const input = document.getElementById(PROC_INPUT_ID);
    if (!input) return;

    // tenta clicar no "x" do react-select (clear indicator)
    const root =
      input.closest(".css-b62m3t-container") ||
      input.closest("[class*='container']") ||
      input.parentElement;

    const clearBtn =
      root?.querySelector("[class*='clearIndicator']") ||
      root?.querySelector("div[aria-hidden='true']") ||
      null;

    if (clearBtn && isVisible(clearBtn)) {
      robustClick(clearBtn);
    }

    // garantia: ctrl+a + backspace
    input.focus();
    try {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a", code: "KeyA", ctrlKey: true }));
      input.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true, key: "a", code: "KeyA", ctrlKey: true }));
    } catch {}
    keyStroke(input, "Backspace", { code: "Backspace", keyCode: 8, which: 8 });

    setNativeValue(input, "");
    fireInput(input);
  }

  // =========================
  // ✅ Find Add button (works in your layout)
  // =========================
  function isAddButtonCandidate(btn) {
    if (!btn || btn.disabled || !isVisible(btn)) return false;
    const t = normL(btn.textContent);
    if (!t) return false;
    if (t.includes("adicionar procedimento")) return false;
    return (t === "adicionar" || t.includes(" adicionar"));
  }

  function findAddButton() {
    const proc = document.getElementById(PROC_INPUT_ID);
    if (!proc) return null;

    // near search
    let node = proc;
    for (let depth = 0; depth < 14 && node; depth++) {
      const scope = node instanceof Element ? node : null;
      if (scope) {
        const btns = Array.from(scope.querySelectorAll("button")).filter(isAddButtonCandidate);
        const best =
          btns.find(b => normL(b.textContent) === "adicionar") ||
          btns[0];
        if (best) return best;
      }
      node = node.parentElement;
    }

    // global fallback
    const all = Array.from(document.querySelectorAll("button")).filter(isAddButtonCandidate);
    return all.find(b => normL(b.textContent) === "adicionar") || all[0] || null;
  }

  // =========================
  // Rows / anti-duplicate
  // =========================
  function getProcedureRows() {
    const table = document.querySelector("table");
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    return rows;
  }

  function getLastRowCode() {
    const rows = getProcedureRows();
    const last = rows[rows.length - 1];
    if (!last) return "";
    // primeira coluna costuma ser o código
    const firstCell = last.querySelector("td");
    return norm(firstCell?.textContent || "");
  }

  async function waitRowAddedOrLastCode(prevCount, code, timeoutMs = 12000) {
    const t0 = Date.now();
    const codeStr = String(code);
    while (Date.now() - t0 < timeoutMs) {
      const rows = getProcedureRows();
      if (rows.length > prevCount) return true;
      const lastCode = getLastRowCode();
      if (lastCode === codeStr) return true;
      await delay(120);
    }
    return false;
  }

  function findQtyInputNearProcedures() {
    const proc = document.getElementById(PROC_INPUT_ID);
    const scope = proc?.closest("section") || proc?.closest("form") || document;
    const nums = Array.from(scope.querySelectorAll("input[type='number']")).filter(isVisible);
    return nums[0] || null;
  }

  // =========================
  // ✅ Pick procedure WITH hard reset + confirm change
  // =========================
  async function pickProcedure(code, {
    cycles = 7,
    perCycleWaitMs = 3200,
    betweenCyclesMs = 300
  } = {}) {
    const input = await waitFor(() => document.getElementById(PROC_INPUT_ID), 50000);
    if (!input) throw new Error("Campo procedimento não encontrado.");

    const codeL = String(code).toLowerCase();

    for (let attempt = 1; attempt <= cycles; attempt++) {
      clearProcedureSelect();
      await delay(140);

      input.focus();
      input.click();
      await delay(120);

      // digita
      let cur = "";
      for (const ch of String(code)) {
        cur += ch;
        setNativeValue(input, cur);
        fireInput(input);
      }

      // espera opções
      const baseId = baseIdFromInputId(PROC_INPUT_ID);
      let opts = null;
      const t0 = Date.now();
      while (Date.now() - t0 < perCycleWaitMs) {
        opts = baseId
          ? Array.from(document.querySelectorAll(`div[id^='${baseId}-option-']`)).filter(o => o.offsetParent !== null)
          : null;
        if (opts?.length) break;
        await delay(120);
      }

      if (!opts?.length) {
        warn(`PROC: sem opções (${attempt}/${cycles}) code=${code}`);
        await delay(betweenCyclesMs);
        continue;
      }

      // se aparecerem opções vazias -> não tem no convênio
      const clean = opts.filter(o => norm(o.textContent));
      if (!clean.length) return { ok: false, reason: "not_found_blank" };

      const target =
        clean.find(o => normL(o.textContent).startsWith(codeL)) ||
        clean.find(o => normL(o.textContent).includes(codeL)) ||
        clean[0];

      if (!target || !norm(target.textContent)) return { ok: false, reason: "not_found_blank_target" };

      robustClick(target);
      await delay(260);

      // CONFIRMA que mudou de verdade
      const picked = procSingleValueText();
      if (picked && normL(picked).includes(codeL)) {
        log(`✅ PROC selecionado: ${picked}`);
        return { ok: true };
      }

      warn(`PROC: não assentou (${attempt}/${cycles}) code=${code} single="${picked}"`);
      await delay(betweenCyclesMs);
    }

    return { ok: false, reason: "not_found_after_retries" };
  }

  // =========================
  // ✅ Insert ONE
  // =========================
  async function insertOneProcedure(code) {
    // anti-duplicado rápido
    const last = getLastRowCode();
    if (last === String(code) || __LAST_PROC_CODE__ === String(code)) {
      warn(`⏭️ Anti-duplicado: ${code} já parece ser o último. Pulando.`);
      return { skipped: true, code, reason: "duplicate_guard" };
    }

    await ensureTabela22();

    const pick = await pickProcedure(code);
    if (!pick.ok) {
      warn(`⏭️ Código ${code} não disponível. Pulando (${pick.reason}).`);
      return { skipped: true, code, reason: pick.reason };
    }

    const qty = findQtyInputNearProcedures();
    if (!qty) throw new Error("Quantidade não encontrada.");

    qty.focus();
    setNativeValue(qty, "");
    fireInput(qty);
    await delay(120);

    setNativeValue(qty, QTY_DEFAULT);
    fireInput(qty);
    await delay(180);

    const addBtn = findAddButton();
    if (!addBtn) throw new Error("Botão Adicionar não encontrado.");

    const prevCount = getProcedureRows().length;

    robustClick(addBtn);

    let ok = await waitRowAddedOrLastCode(prevCount, code, 12000);
    if (!ok) {
      warn("Adicionar não confirmou no 1º clique. Tentando 2º clique...");
      await delay(420);
      robustClick(addBtn);
      ok = await waitRowAddedOrLastCode(prevCount, code, 12000);
    }

    if (!ok) {
      const proc = document.getElementById(PROC_INPUT_ID);
      const scope = proc?.closest("form") || document;
      await waitNotBusy(scope, 8000);

      // checagem final pelo último código
      const last2 = getLastRowCode();
      if (last2 !== String(code)) {
        throw new Error("Não confirmou inclusão após clicar Adicionar (2 tentativas).");
      }
    }

    __LAST_PROC_CODE__ = String(code);
    await delay(160);
    return { skipped: false, code };
  }

  // =========================
  // UI
  // =========================
  function setStatus(txt) {
    const el = document.getElementById("gdfStatus");
    if (el) el.textContent = txt;
  }

  // =========================
  // Runs
  // =========================
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
          if (r?.skipped) skipped.push({ code, reason: r.reason });
          else log("✅ Inserido:", code);
        } catch (e) {
          fails.push({ code, reason: e?.message || String(e) });
          warn("Falha:", code, e);
          await delay(300);
        }

        await delay(160);
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
        v12: limpa o campo Procedimento de verdade + anti-duplicado.
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#btnProcsInd").onclick = runProcedimentos_independente;

    panel.querySelector("#btnReset").onclick = () => {
      clearSt();
      __TABELA_22_OK__ = false;
      __LAST_PROC_CODE__ = null;
      setStatus("Reset feito.");
    };
  }

  // Init
  createPanel();
  log("✅ GDF_INAS v12: reset hard do Procedimento + confirmação de troca + anti-duplicado.");
})();
