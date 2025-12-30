/* STF_MED • Runner (intervalos maiores + commit mais forte)
   - Usa localStorage["HP_STF_MED_CODES"] (JSON array) OU window.__HP_RUNNER.payload.codes OU window.__HP_BUNDLE.codes
   - Clica na lupa (SearchWithButton)
   - Espera modal #modal-lookup, clica row, tenta OK/Selecionar, espera hidden preencher
   - Intervalos MAIORES (ajustáveis no CONFIG)
*/
(() => {
  const TAG = "STF_MED";

  // =========================
  // ✅ CONFIG (AUMENTE AQUI)
  // =========================
  const CONFIG = {
    // digitação
    typeDelayMs: 70,         // antes era 20-25
    afterClearMs: 250,
    afterTypeMs: 350,
    // lookup / modal
    afterSearchClickMs: 500,
    waitModalTimeoutMs: 15000,
    waitGridTimeoutMs: 20000,
    afterRowClickMs: 600,
    afterOkClickMs: 600,
    waitHiddenTimeoutMs: 20000,
    // runner
    betweenCodesMs: 900,
    retrySameCodeMs: 1500,
    maxRetriesPerCode: 3
  };

  const LS_CODES = "HP_STF_MED_CODES";
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // anti dupla execução
  if (window.__HP_STF_MED_SLOW__) return;
  window.__HP_STF_MED_SLOW__ = true;

  function log(m, o){ o!==undefined?console.log(`${TAG}: ${m}`,o):console.log(`${TAG}: ${m}`); }
  function warn(m, o){ o!==undefined?console.warn(`${TAG}: ${m}`,o):console.warn(`${TAG}: ${m}`); }
  function err(m, o){ o!==undefined?console.error(`${TAG}: ${m}`,o):console.error(`${TAG}: ${m}`); }

  function dispatchInput(el){
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
  }

  async function waitFor(fn, {timeout=12000, step=200}={}){
    const t0 = Date.now();
    while (Date.now()-t0 < timeout){
      try { const v = fn(); if (v) return v; } catch {}
      await delay(step);
    }
    return null;
  }

  // =========================
  // ✅ lookup discovery (começa por HandleTermoLookupDisplay)
  // =========================
  function findLookup() {
    const display =
      document.querySelector("div[lookup='true'] input#HandleTermo[name='HandleTermoLookupDisplay']") ||
      document.querySelector("div[lookup='true'] input[name='HandleTermoLookupDisplay']") ||
      document.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']") ||
      document.querySelector("input[name='HandleTermoLookupDisplay']");

    if (!display) return null;

    const container =
      display.closest("div[lookup='true']") ||
      display.closest("div[campos-dependencia-extras]") ||
      display.closest(".input-group")?.parentElement ||
      display.parentElement;

    if (!container) return null;

    const hidden = container.querySelector("input[name='HandleTermo']");
    if (!hidden) return null;

    const btnClear =
      container.querySelector("button[ng-click='lookupCtrl.clearSelected()']") ||
      container.querySelector(".input-group-btn button .fa-times")?.closest("button") ||
      null;

    const btnSearch =
      container.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']") ||
      container.querySelector(".input-group-btn button .fa-search")?.closest("button") ||
      null;

    return { container, display, hidden, btnClear, btnSearch };
  }

  // =========================
  // ✅ modal / rows / ok
  // =========================
  function modalEl() {
    const m = document.querySelector("#modal-lookup");
    if (!m) return null;
    const style = getComputedStyle(m);
    const open = (style.display !== "none") || m.classList.contains("in");
    return open ? m : null;
  }

  function findRows(scopeRoot) {
    // bem permissivo (Benner varia)
    return Array.from(scopeRoot.querySelectorAll(
      "tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr, .modal-content table tbody tr"
    )).filter(r => (r.innerText || "").trim().length > 0);
  }

  function pickRowByCode(rows, code) {
    const c = String(code);
    const norm = s => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) {
      const txt = norm(r.innerText);
      if (txt.includes(c)) return r;
    }
    return rows[0] || null;
  }

  function findOkButton(m) {
    const btns = Array.from(m.querySelectorAll("button,a"));
    const ok = btns.find(b => {
      const t = (b.innerText || "").trim().toLowerCase();
      const oc = (b.getAttribute("onclick") || "").toLowerCase();
      const ng = (b.getAttribute("ng-click") || "").toLowerCase();
      return /ok|selecionar|confirmar|escolher/.test(t) || oc.includes("lkp_ok") || ng.includes("ok") || ng.includes("select");
    });
    return ok || null;
  }

  // =========================
  // ✅ codes source (sem mexer em background)
  // =========================
  function getCodes() {
    const p = window.__HP_RUNNER?.payload?.codes;
    if (Array.isArray(p) && p.length) return p.map(String);

    const b = window.__HP_BUNDLE?.codes;
    if (Array.isArray(b) && b.length) return b.map(String);

    try {
      const ls = JSON.parse(localStorage.getItem(LS_CODES) || "[]");
      if (Array.isArray(ls) && ls.length) return ls.map(String);
    } catch {}

    return [];
  }

  // =========================
  // ✅ selection (mais lenta + commit forte)
  // =========================
  async function selectOne(code) {
    const ctx = findLookup();
    if (!ctx) return { ok:false, reason:"lookup_not_found" };

    const { display, hidden, btnClear, btnSearch } = ctx;
    if (!btnSearch) return { ok:false, reason:"btn_search_not_found" };

    // limpar (Angular)
    btnClear?.click();
    await delay(CONFIG.afterClearMs);

    // limpar display manual
    display.focus();
    display.value = "";
    dispatchInput(display);
    await delay(150);

    // digitar devagar
    const txt = String(code);
    for (const ch of txt) {
      display.value += ch;
      dispatchInput(display);
      await delay(CONFIG.typeDelayMs);
    }

    await delay(CONFIG.afterTypeMs);

    // clicar lupa
    btnSearch.click();
    await delay(CONFIG.afterSearchClickMs);

    // esperar modal abrir
    const m = await waitFor(() => modalEl(), { timeout: CONFIG.waitModalTimeoutMs, step: 200 });
    if (!m) return { ok:false, reason:"modal_not_open" };

    // esperar grid
    const rows = await waitFor(() => {
      const r = findRows(m);
      return r.length ? r : null;
    }, { timeout: CONFIG.waitGridTimeoutMs, step: 200 });

    if (!rows) return { ok:false, reason:"grid_not_found" };

    // zera hidden pra validar
    hidden.value = "";
    hidden.dispatchEvent(new Event("input", { bubbles:true }));
    hidden.dispatchEvent(new Event("change", { bubbles:true }));

    // escolher row
    const row = pickRowByCode(rows, txt);
    if (!row) return { ok:false, reason:"row_not_found" };

    row.scrollIntoView({ block:"center" });
    row.click();
    await delay(CONFIG.afterRowClickMs);

    // confirmar no modal se existir
    const okBtn = findOkButton(m);
    if (okBtn) {
      okBtn.click();
      await delay(CONFIG.afterOkClickMs);
    } else {
      // fallback: dblclick
      row.dispatchEvent(new MouseEvent("dblclick", { bubbles:true }));
      await delay(CONFIG.afterOkClickMs);
    }

    // esperar hidden preencher (mais tempo)
    const got = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: CONFIG.waitHiddenTimeoutMs, step: 200 });

    if (got) return { ok:true, handle: got };

    return { ok:false, reason:"hidden_not_filled" };
  }

  // =========================
  // ✅ main
  // =========================
  (async () => {
    const codes = getCodes();
    if (!codes.length) {
      warn(`Sem códigos. Teste rápido:
localStorage.setItem("${LS_CODES}", JSON.stringify(["40301087","40301150","40301222"]))`);
      return;
    }

    log("Iniciando", { total: codes.length, config: CONFIG });

    for (let i = 0; i < codes.length; i++) {
      const code = String(codes[i]);
      let ok = false;

      for (let attempt = 1; attempt <= CONFIG.maxRetriesPerCode; attempt++) {
        log(`▶️ (${i+1}/${codes.length}) ${code} (tentativa ${attempt}/${CONFIG.maxRetriesPerCode})`);

        const res = await selectOne(code);
        if (res.ok) {
          ok = true;
          log("✅ Selecionado", { code, handle: res.handle });
          break;
        } else {
          warn("❌ Falha", { code, reason: res.reason });
          await delay(CONFIG.retrySameCodeMs);
        }
      }

      if (!ok) {
        err("Parando: não conseguiu selecionar mesmo com retries", { code });
        break;
      }

      await delay(CONFIG.betweenCodesMs);
    }

    log("Fim.");
  })();
})();
