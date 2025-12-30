/*@maskara{
  "mustUrlIncludes": ["tjdft", "/Guias/SpSadt/", "NovaGuiaEletiva"],
  "detectAny": [
    "input#HandleTermo",
    "input#HandleTermo[name='HandleTermoLookupDisplay']",
    "input[name='HandleTermoLookupDisplay']",
    "button[ng-click='lookupCtrl.SearchWithButton()']",
    "#modal-lookup",
    "tr.dataGridRow",
    "div[ng-repeat='item in eventos']"
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
  // ✅ CÓDIGOS — DO PAYLOAD (preferência) OU fallback (baseline)
  // =========================================================
  const payload = window.__HP_PAYLOAD__ || {};
  const fallbackCodes = [
    "40301087","40301150","40301222","40301273","40301281","40301354","40301362","40301419","40301427","40301508",
    "40301567","40301648","40301729","40301842","40301990","40302113","40302199","40302377","40302520","40302580",
    "40302601","40302610","40302733","40302750","40302830","40304361","40304507","40305465","40305627","40312151",
    "40313310","40316050","40316076","40316106","40316157","40316165","40316203","40316211","40316220","40316246",
    "40316254","40316262","40316270","40316289","40316300","40316335","40316360","40316408","40316416","40316440",
    "40316483","40316505","40316513","40316530","40316572"
  ];

  const CODES = Array.isArray(payload.codes) && payload.codes.length
    ? payload.codes.map(String)
    : fallbackCodes;

  // =========================================================
  // ⚡ CONFIG (rápido, mas robusto)
  // =========================================================
  const CONFIG = {
    typeDelayMs: 25,
    afterClearMs: 120,
    afterTypeMs: 150,

    // modo A (lookup angular)
    afterSearchClickMs: 250,
    waitModalTimeoutMs: 9000,
    waitGridTimeoutMs: 9000,
    afterRowClickMs: 250,
    afterOkClickMs: 250,

    // modo B (campo direto + enter)
    afterEnterMs: 250,
    waitRowTimeoutMs: 9000,

    // confirmação
    waitInsertedTimeoutMs: 7000,

    betweenCodesMs: 200,
    retrySameCodeMs: 550,
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
    // já inserido na lista (inputs disabled com texto)
    const inputs = document.querySelectorAll("input.form-control[disabled], input[disabled].form-control");
    return Array.from(inputs).some(i => ((i.value || "") + (i.getAttribute("value") || "")).includes(code));
  }

  async function waitInserted(code) {
    return waitFor(() => (hasEvent(code) ? true : null), CONFIG.waitInsertedTimeoutMs);
  }

  // ---------- Modo A: Lookup Angular (display + modal-lookup) ----------
  function findLookupAngular() {
    const display =
      document.querySelector("input[name='HandleTermoLookupDisplay']") ||
      document.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']");

    if (!display) return null;

    const box = display.closest("div[lookup='true'], .input-group, .form-group") || display.parentElement;

    return {
      mode: "ANGULAR",
      display,
      hidden: box.querySelector("input[name='HandleTermo'], input#HandleTermo"),
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

  function findRows(root) {
    // tenta no modal, senão na página
    return Array.from((root || document).querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr"))
      .filter(r => r && r.innerText && r.innerText.trim());
  }

  function findOk(root) {
    return Array.from((root || document).querySelectorAll("button,a"))
      .find(b =>
        /ok|selecionar|confirmar/i.test((b.innerText || "").trim()) ||
        ((b.getAttribute("onclick") || "").includes("lkp_ok"))
      );
  }

  // ---------- Modo B: Campo direto (#HandleTermo) + Enter ----------
  function findDirectField() {
    const f = document.querySelector("input#HandleTermo");
    if (!f) return null;
    return { mode: "DIRECT", field: f };
  }

  function pressEnter(el) {
    // algumas telas respondem melhor a keydown/keyup
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
  }

  // =========================================================
  // Inserção de 1 código (auto-detecta modo do TJDFT)
  // =========================================================
  async function insertOne(code) {
    if (processed.has(code) || hasEvent(code)) {
      processed.add(code);
      return { ok: true, via: "already_in_list" };
    }

    // 1) tenta modo Angular (mais “parecido” com seu STF_MED)
    const angular = findLookupAngular();
    if (angular && angular.search) {
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
        return r && r.length ? r : null;
      }, CONFIG.waitGridTimeoutMs);

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

    // 2) fallback: modo DIRECT (#HandleTermo + Enter)
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
      await delay(Math.max(CONFIG.typeDelayMs, 30)); // um pouco mais “humano” pro modo direct
    }

    await delay(CONFIG.afterTypeMs);
    pressEnter(field);
    await delay(CONFIG.afterEnterMs);

    // se abrir modal, trata como modal também
    const maybeModal = await waitFor(modalOpen, 1200, 120);
    if (maybeModal) {
      const rows = await waitFor(() => {
        const r = findRows(maybeModal);
        return r && r.length ? r : null;
      }, CONFIG.waitGridTimeoutMs);

      if (!rows || !rows.length) return { ok:false, reason:"grid_empty" };

      const row = rows.find(r => r.innerText.includes(code)) || rows[0];
      row.click();
      await delay(CONFIG.afterRowClickMs);

      findOk(maybeModal)?.click();
      await delay(CONFIG.afterOkClickMs);

      processed.add(code);

      if (await waitInserted(code)) return { ok:true, via:"inserted_detected" };
      return { ok:true, via:"confirmed_no_wait" };
    }

    // se NÃO abrir modal: tenta clicar primeira linha de resultado na própria página
    const pageRows = await waitFor(() => {
      const r = findRows(document);
      return r && r.length ? r : null;
    }, CONFIG.waitRowTimeoutMs);

    if (pageRows && pageRows.length) {
      const row = pageRows.find(r => r.innerText.includes(code)) || pageRows[0];
      row.click();
      await delay(CONFIG.afterRowClickMs);
    } else {
      warn("Sem resultado visível (sem modal) para:", code);
      // não aborta ainda, pois às vezes a seleção é automática
    }

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

    log("🎉 TJDFT finalizado.");
  })();
})();
