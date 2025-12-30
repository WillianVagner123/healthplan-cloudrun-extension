/*@maskara{
  "mustUrlIncludes": ["portalconectasaude.com.br", "/Guias/SpSadt/", "NovaGuiaEletiva"],
  "detectAny": [
    "input#HandleTermo[name='HandleTermoLookupDisplay']",
    "button[ng-click='lookupCtrl.SearchWithButton()']",
    "div[ng-repeat='item in eventos']"
  ],
  "actions": {}
}*/

(() => {
  const TAG = "STF_MED";

  if (window.__HP_STF_MED_FAST__) return;
  window.__HP_STF_MED_FAST__ = true;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const log  = (...a) => console.log(`${TAG}:`, ...a);
  const warn = (...a) => console.warn(`${TAG}:`, ...a);
  const err  = (...a) => console.error(`${TAG}:`, ...a);

  // =========================================================
  // ✅ CÓDIGOS — SOMENTE DO PAYLOAD (igual GDF_INAS)
  // =========================================================
  const payload = window.__HP_PAYLOAD__ || {};
  const CODES = Array.isArray(payload.codes) ? payload.codes.map(String) : [];

  if (!CODES.length) {
    warn("Sem codes em window.__HP_PAYLOAD__.codes. Execute o KIT antes.");
    return;
  }

  // =========================================================
  // ⚡ CONFIGURAÇÃO OTIMIZADA (RÁPIDA)
  // =========================================================
  const CONFIG = {
    typeDelayMs: 25,
    afterClearMs: 120,
    afterTypeMs: 150,
    afterSearchClickMs: 250,

    waitModalTimeoutMs: 8000,
    waitGridTimeoutMs: 8000,

    afterRowClickMs: 300,
    afterOkClickMs: 300,

    waitInsertedTimeoutMs: 6000,

    betweenCodesMs: 200,
    retrySameCodeMs: 500,
    maxRetriesPerCode: 2,
  };

  const processed = new Set();

  // =========================================================
  // Helpers
  // =========================================================
  const fire = (el, t) => el?.dispatchEvent(new Event(t, { bubbles: true }));
  const dispatchInput = (el) => { fire(el,"input"); fire(el,"change"); };

  async function waitFor(fn, timeout = 8000, step = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await delay(step);
    }
    return null;
  }

  function hasEvent(code) {
    const inputs = document.querySelectorAll("input.form-control[disabled]");
    return Array.from(inputs).some(i => (i.value || "").includes(code));
  }

  async function waitInserted(code) {
    return waitFor(() => hasEvent(code) ? true : null, CONFIG.waitInsertedTimeoutMs);
  }

  function findLookup() {
    const display = document.querySelector("input[name='HandleTermoLookupDisplay']");
    if (!display) return null;

    const box = display.closest("div[lookup='true'], .input-group") || display.parentElement;
    return {
      display,
      hidden: box.querySelector("input[name='HandleTermo']"),
      clear:  box.querySelector("button[ng-click='lookupCtrl.clearSelected()']"),
      search: box.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']")
    };
  }

  function modalOpen() {
    const m = document.querySelector("#modal-lookup");
    if (!m) return null;
    if (getComputedStyle(m).display !== "none") return m;
    return null;
  }

  function findRows(m) {
    return Array.from(m.querySelectorAll("tr.dataGridRow, table tbody tr"))
      .filter(r => r.innerText.trim());
  }

  function findOk(m) {
    return Array.from(m.querySelectorAll("button,a"))
      .find(b => /ok|selecionar|confirmar/i.test(b.innerText)
        || (b.getAttribute("onclick") || "").includes("lkp_ok"));
  }

  // =========================================================
  // Inserção de 1 código
  // =========================================================
  async function insertOne(code) {
    if (processed.has(code) || hasEvent(code)) {
      processed.add(code);
      return { ok: true, via: "already_in_list" };
    }

    const ctx = findLookup();
    if (!ctx) return { ok:false, reason:"lookup_not_found" };

    ctx.clear?.click();
    await delay(CONFIG.afterClearMs);

    ctx.display.focus();
    ctx.display.value = "";
    dispatchInput(ctx.display);

    for (const ch of code) {
      ctx.display.value += ch;
      dispatchInput(ctx.display);
      await delay(CONFIG.typeDelayMs);
    }

    await delay(CONFIG.afterTypeMs);
    ctx.search.click();
    await delay(CONFIG.afterSearchClickMs);

    const modal = await waitFor(modalOpen, CONFIG.waitModalTimeoutMs);
    if (!modal) return { ok:false, reason:"modal_not_open" };

    const rows = await waitFor(() => findRows(modal), CONFIG.waitGridTimeoutMs);
    if (!rows || !rows.length) return { ok:false, reason:"grid_empty" };

    const row = rows.find(r => r.innerText.includes(code)) || rows[0];
    row.click();
    await delay(CONFIG.afterRowClickMs);

    findOk(modal)?.click();
    await delay(CONFIG.afterOkClickMs);

    processed.add(code);

    if (await waitInserted(code)) return { ok:true, via:"inserted_detected" };

    return { ok:true, via:"confirmed_no_wait" };
  }

  // =========================================================
  // MAIN
  // =========================================================
  (async () => {
    log("Iniciando", { total: CODES.length, config: CONFIG });

    for (let i = 0; i < CODES.length; i++) {
      const code = CODES[i];

      let success = false;
      for (let t = 1; t <= CONFIG.maxRetriesPerCode; t++) {
        log(`▶️ (${i+1}/${CODES.length}) ${code} (tentativa ${t}/${CONFIG.maxRetriesPerCode})`);
        const r = await insertOne(code);
        if (r.ok) {
          log("✅ OK", { code, via: r.via });
          success = true;
          break;
        }
        warn("❌ Falha", r);
        await delay(CONFIG.retrySameCodeMs);
      }

      if (!success) {
        err("Abortando no código", code);
        break;
      }

      await delay(CONFIG.betweenCodesMs);
    }

    log("🎉 Fim.");
  })();
})();
