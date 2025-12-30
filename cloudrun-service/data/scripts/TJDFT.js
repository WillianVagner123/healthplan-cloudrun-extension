/*@maskara{
  "mustUrlIncludes": ["tjdft", "portalconectasaude.com.br", "/Guias/SpSadt/", "NovaGuiaEletiva"],
  "detectAny": [
    "input#HandleTermo",
    "input[name='HandleTermoLookupDisplay']",
    "button[ng-click='lookupCtrl.SearchWithButton()']",
    "#modal-lookup",
    "tr.dataGridRow"
  ],
  "actions": {}
}*/

(() => {
  const TAG = "TJDFT_MED";

  if (window.__HP_TJDFT_MED_BATCH__) return;
  window.__HP_TJDFT_MED_BATCH__ = true;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const log  = (...a) => console.log(`${TAG}:`, ...a);
  const warn = (...a) => console.warn(`${TAG}:`, ...a);
  const err  = (...a) => console.error(`${TAG}:`, ...a);

  // =========================================================
  // ✅ CÓDIGOS — EXCLUSIVAMENTE DO KIT
  // =========================================================
  const payload = window.__HP_PAYLOAD__ || {};

  const rawCodes =
    payload.codes ??
    payload?.kit?.codes ??
    payload?.selectedKit?.codes ??
    payload?.data?.codes;

  const CODES = Array.isArray(rawCodes)
    ? rawCodes.map(String).filter(Boolean)
    : [];

  if (!CODES.length) {
    warn("Sem codes no payload do KIT. Execute o KIT antes.");
    return;
  }

  // =========================================================
  // ⚡ CONFIG
  // =========================================================
  const CONFIG = {
    typeDelayMs: 30,
    afterClearMs: 120,
    afterTypeMs: 150,

    afterSearchClickMs: 250,
    waitModalTimeoutMs: 9000,
    waitGridTimeoutMs: 9000,

    afterRowClickMs: 250,
    afterOkClickMs: 250,

    afterEnterMs: 250,
    waitRowTimeoutMs: 3000,

    waitInsertedTimeoutMs: 2000,

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
    const inputs = document.querySelectorAll("input.form-control[disabled], input[disabled]");
    return Array.from(inputs).some(i =>
      ((i.value || "") + (i.getAttribute("value") || "")).includes(code)
    );
  }

  async function waitInserted(code) {
    return waitFor(() => hasEvent(code) ? true : null, CONFIG.waitInsertedTimeoutMs);
  }

  // =========================================================
  // 🔎 DETECÇÃO DOS MODOS
  // =========================================================
  function findAngularLookup() {
    const display = document.querySelector("input[name='HandleTermoLookupDisplay']");
    if (!display) return null;

    const box = display.closest("div[lookup='true'], .input-group, .form-group") || display.parentElement;

    return {
      mode: "ANGULAR",
      display,
      clear: box.querySelector("button[ng-click='lookupCtrl.clearSelected()']"),
      search: box.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']")
    };
  }

  function findDirectField() {
    const field = document.querySelector("input#HandleTermo");
    return field ? { mode: "DIRECT", field } : null;
  }

  function modalOpen() {
    const m = document.querySelector("#modal-lookup");
    return (m && getComputedStyle(m).display !== "none") ? m : null;
  }

  function findRows(root) {
    return Array.from((root || document).querySelectorAll(
      "tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr"
    )).filter(r => r.innerText.trim());
  }

  function findOk(root) {
    return Array.from((root || document).querySelectorAll("button,a"))
      .find(b =>
        /ok|selecionar|confirmar/i.test(b.innerText) ||
        (b.getAttribute("onclick") || "").includes("lkp_ok")
      );
  }

  function pressEnter(el) {
    ["keydown","keypress","keyup"].forEach(t =>
      el.dispatchEvent(new KeyboardEvent(t, {
        bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
      }))
    );
  }

  // =========================================================
  // ➕ Inserção de um código
  // =========================================================
  async function insertOne(code) {
    if (processed.has(code) || hasEvent(code)) {
      processed.add(code);
      return { ok: true, via: "already_in_list" };
    }

    // ---------- MODO ANGULAR ----------
    const angular = findAngularLookup();
    if (angular?.search) {
      angular.clear?.click();
      await delay(CONFIG.afterClearMs);

      angular.display.focus();
      angular.display.value = "";
      dispatchInput(angular.display);

      for (const ch of code) {
        angular.display.value += ch;
        dispatchInput(angular.display);
        await delay(CONFIG.typeDelayMs);
      }

      await delay(CONFIG.afterTypeMs);
      angular.search.click();
      await delay(CONFIG.afterSearchClickMs);

      const modal = await waitFor(modalOpen, CONFIG.waitModalTimeoutMs);
      if (!modal) return { ok:false, reason:"modal_not_open" };

      const rows = await waitFor(() => {
        const r = findRows(modal);
        return r.length ? r : null;
      }, CONFIG.waitGridTimeoutMs);

      if (!rows) return { ok:false, reason:"grid_empty" };

      (rows.find(r => r.innerText.includes(code)) || rows[0]).click();
      await delay(CONFIG.afterRowClickMs);

      findOk(modal)?.click();
      await delay(CONFIG.afterOkClickMs);

      processed.add(code);
      if (await waitInserted(code)) return { ok:true, via:"inserted_detected" };
      return { ok:true, via:"confirmed_no_wait" };
    }

    // ---------- MODO DIRECT ----------
    const direct = findDirectField();
    if (!direct) return { ok:false, reason:"field_not_found" };

    const field = direct.field;
    field.focus();
    field.value = "";
    dispatchInput(field);
    await delay(CONFIG.afterClearMs);

    for (const ch of code) {
      field.value += ch;
      dispatchInput(field);
      await delay(35);
    }

    await delay(CONFIG.afterTypeMs);
    pressEnter(field);
    await delay(CONFIG.afterEnterMs);

    const modal = await waitFor(modalOpen, 1200);
    if (modal) {
      const rows = await waitFor(() => {
        const r = findRows(modal);
        return r.length ? r : null;
      }, CONFIG.waitGridTimeoutMs);

      if (!rows) return { ok:false, reason:"grid_empty" };

      (rows.find(r => r.innerText.includes(code)) || rows[0]).click();
      await delay(CONFIG.afterRowClickMs);

      findOk(modal)?.click();
      await delay(CONFIG.afterOkClickMs);
    }

    processed.add(code);
    if (await waitInserted(code)) return { ok:true, via:"inserted_detected" };
    return { ok:true, via:"confirmed_no_wait" };
  }

  // =========================================================
  // ▶️ MAIN
  // =========================================================
  (async () => {
    log("Iniciando", { total: CODES.length });

    for (let i = 0; i < CODES.length; i++) {
      const code = CODES[i];
      let ok = false;

      for (let t = 1; t <= CONFIG.maxRetriesPerCode; t++) {
        log(`▶️ (${i+1}/${CODES.length}) ${code} (tentativa ${t})`);
        const r = await insertOne(code);

        if (r.ok) {
          log("✅ OK", r.via);
          ok = true;
          break;
        }

        warn("❌ Falha", r);
        await delay(CONFIG.retrySameCodeMs);
      }

      if (!ok) {
        err("Abortando no código", code);
        break;
      }

      await delay(CONFIG.betweenCodesMs);
    }

    log("🎉 TJDFT finalizado.");
  })();
})();
