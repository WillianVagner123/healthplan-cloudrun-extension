/*@maskara{
  "mustUrlIncludes": ["portalconectasaude.com.br", "/Guias/SpSadt/", "NovaGuiaEletiva"],
  "detectAny": [
    "input#HandleTermo[name='HandleTermoLookupDisplay']",
    "button[ng-click='lookupCtrl.SearchWithButton()']",
    "div[ng-repeat='item in eventos']"
  ],
  "actions": {}
}*/

/**
 * STF_MED • Inserção em lote (COMPLETO • padrão GDF_INAS)
 * ✅ Puxa SOMENTE do payload: window.__HP_PAYLOAD__.codes
 * ✅ Não mexe em background / outros códigos
 * ✅ Não duplica: trava por código (processed Set) + checa lista existente
 * ✅ Seleciona no modal (lupa) e valida inserção pelo DOM real dos itens (ng-repeat eventos)
 *
 * Como usar:
 * 1) Execute o KIT pelo Maskara (pra preencher window.__HP_PAYLOAD__.codes)
 * 2) Abra a tela NovaGuiaEletiva (SP-SADT)
 * 3) Rode este script
 */
(() => {
  const TAG = "STF_MED";

  if (window.__HP_STF_MED_GDFSTYLE__) return;
  window.__HP_STF_MED_GDFSTYLE__ = true;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const log  = (...a) => console.log(`${TAG}:`, ...a);
  const warn = (...a) => console.warn(`${TAG}:`, ...a);
  const err  = (...a) => console.error(`${TAG}:`, ...a);

  // =========================================================
  // ✅ CÓDIGOS — IGUAL AO GDF_INAS (somente payload)
  // =========================================================
  const payload = window.__HP_PAYLOAD__ || {};
  const CODES = Array.isArray(payload.codes) ? payload.codes.map(String) : [];

  if (!CODES.length) {
    warn("Sem codes em window.__HP_PAYLOAD__.codes. Execute o KIT (Maskara) e tente de novo.", { payload });
    return;
  }

  // =========================================================
  // ✅ CONFIG (timings) — pode aumentar se quiser mais lento
  // =========================================================
  const CONFIG = {
    typeDelayMs: 70,
    afterClearMs: 250,
    afterTypeMs: 350,
    afterSearchClickMs: 550,

    waitModalTimeoutMs: 20000,
    waitGridTimeoutMs: 25000,

    afterRowClickMs: 700,
    afterOkClickMs: 700,

    waitInsertedTimeoutMs: 25000,

    betweenCodesMs: 650,
    retrySameCodeMs: 1200,
    maxRetriesPerCode: 2, // com lock por código, não precisa insistir muito
  };

  // =========================================================
  // ✅ LOCK (não duplica nunca na mesma execução)
  // =========================================================
  const processed = new Set();

  // =========================================================
  // ✅ Helpers
  // =========================================================
  function dispatchInput(el){
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
  }

  async function waitFor(getter, timeoutMs = 15000, stepMs = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try {
        const v = (typeof getter === "function") ? getter() : document.querySelector(getter);
        if (v) return v;
      } catch {}
      await delay(stepMs);
    }
    return null;
  }

  // =========================================================
  // ✅ DETECTOR REAL (seu HTML dos itens inseridos)
  // - input disabled com value "40301087 | ..."
  // =========================================================
  function hasEventItemCode(code) {
    const c = String(code);
    const inputs = document.querySelectorAll("div[ng-repeat='item in eventos'] input.form-control[disabled]");
    for (const inp of inputs) {
      const v = (inp.value || "").trim();
      if (v.includes(c)) return true;
    }
    // fallback (às vezes o atributo ng-repeat não aparece literal)
    const inputs2 = document.querySelectorAll("input.form-control[disabled]");
    for (const inp of inputs2) {
      const v = (inp.value || "").trim();
      if (v.includes(c) && v.includes("|")) return true;
    }
    return false;
  }

  async function waitInserted(code) {
    return await waitFor(() => (hasEventItemCode(code) ? true : null), CONFIG.waitInsertedTimeoutMs, 250);
  }

  // =========================================================
  // ✅ Lookup HandleTermo (campo + botões)
  // =========================================================
  function findLookup() {
    const display =
      document.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']") ||
      document.querySelector("input[name='HandleTermoLookupDisplay']");

    if (!display) return null;

    const container =
      display.closest("div[lookup='true']") ||
      display.closest("div[campos-dependencia-extras]") ||
      display.closest(".input-group")?.parentElement ||
      display.parentElement;

    if (!container) return null;

    const hidden   = container.querySelector("input[name='HandleTermo']") || null;
    const btnClear = container.querySelector("button[ng-click='lookupCtrl.clearSelected()']") || null;
    const btnSearch= container.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']") || null;

    if (!btnSearch) return null;

    return { display, hidden, btnClear, btnSearch };
  }

  // =========================================================
  // ✅ Modal lookup
  // =========================================================
  function modalEl() {
    const m = document.querySelector("#modal-lookup");
    if (!m) return null;
    const style = getComputedStyle(m);
    const open = (style.display !== "none") || m.classList.contains("in");
    return open ? m : null;
  }

  function findRows(scopeRoot) {
    return Array.from(scopeRoot.querySelectorAll(
      "tr.dataGridRow, tr.dataGridRow.ng-scope, .modal-content table tbody tr, table tbody tr"
    )).filter(r => (r.innerText || "").trim().length > 0);
  }

  function pickRowByCode(rows, code) {
    const c = String(code);
    const norm = s => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) if (norm(r.innerText).includes(c)) return r;
    return rows[0] || null;
  }

  function findOkButton(m) {
    const btns = Array.from(m.querySelectorAll("button,a"));
    return btns.find(b => {
      const t = (b.innerText || "").trim().toLowerCase();
      const oc = (b.getAttribute("onclick") || "").toLowerCase();
      const ng = (b.getAttribute("ng-click") || "").toLowerCase();
      return /ok|selecionar|confirmar|escolher|aplicar/.test(t) || oc.includes("lkp_ok") || ng.includes("ok") || ng.includes("select");
    }) || null;
  }

  // =========================================================
  // ✅ Inserir 1 código
  // =========================================================
  async function insertOne(code) {
    const c = String(code);

    // lock: se já processou nesta execução, não tenta de novo
    if (processed.has(c)) return { ok:true, via:"already_processed" };

    // se já existe na lista (antes de mexer em nada), pula
    if (hasEventItemCode(c)) {
      processed.add(c);
      return { ok:true, via:"already_in_list" };
    }

    const ctx = findLookup();
    if (!ctx) return { ok:false, reason:"lookup_not_found" };

    const { display, hidden, btnClear, btnSearch } = ctx;

    // limpar
    btnClear?.click();
    await delay(CONFIG.afterClearMs);

    display.focus();
    display.value = "";
    dispatchInput(display);
    await delay(150);

    // digitar
    for (const ch of c) {
      display.value += ch;
      dispatchInput(display);
      await delay(CONFIG.typeDelayMs);
    }
    await delay(CONFIG.afterTypeMs);

    // lupa
    btnSearch.click();
    await delay(CONFIG.afterSearchClickMs);

    // modal
    const m = await waitFor(() => modalEl(), CONFIG.waitModalTimeoutMs, 200);
    if (!m) return { ok:false, reason:"modal_not_open" };

    // grid
    const rows = await waitFor(() => {
      const r = findRows(m);
      return r.length ? r : null;
    }, CONFIG.waitGridTimeoutMs, 200);

    if (!rows) return { ok:false, reason:"grid_not_found" };

    // zera hidden (não é critério, mas ajuda em algumas telas)
    if (hidden) {
      hidden.value = "";
      hidden.dispatchEvent(new Event("input", { bubbles:true }));
      hidden.dispatchEvent(new Event("change", { bubbles:true }));
    }

    const row = pickRowByCode(rows, c);
    if (!row) return { ok:false, reason:"row_not_found" };

    row.scrollIntoView({ block:"center" });

    const clickTarget = row.querySelector("a") || row.querySelector("td") || row;
    clickTarget.click();
    await delay(CONFIG.afterRowClickMs);

    const okBtn = findOkButton(m);
    if (okBtn) {
      okBtn.click();
      await delay(CONFIG.afterOkClickMs);
    } else {
      // fallback
      clickTarget.dispatchEvent(new MouseEvent("dblclick", { bubbles:true }));
      await delay(CONFIG.afterOkClickMs);
    }

    // ✅ LOCK logo após confirmar no modal (evita duplicar por timing Angular)
    processed.add(c);

    // confirmar pelo DOM real
    const okInserted = await waitInserted(c);
    if (okInserted) return { ok:true, via:"inserted_detected" };

    // fallback: se hidden preencheu
    if (hidden && (hidden.value || "").toString().trim()) return { ok:true, via:"hidden_filled" };

    // mesmo que o detector falhe, NÃO duplica (já está no Set)
    return { ok:true, via:"confirmed_modal_but_not_detected" };
  }

  // =========================================================
  // ✅ MAIN
  // =========================================================
  (async () => {
    log("Iniciando", { total: CODES.length, config: CONFIG });

    for (let i = 0; i < CODES.length; i++) {
      const code = String(CODES[i]);

      // pular se já existe na lista
      if (hasEventItemCode(code)) {
        processed.add(code);
        log(`⏭️ (${i+1}/${CODES.length}) já estava na lista: ${code}`);
        continue;
      }

      let done = false;
      for (let attempt = 1; attempt <= CONFIG.maxRetriesPerCode; attempt++) {
        log(`▶️ (${i+1}/${CODES.length}) ${code} (tentativa ${attempt}/${CONFIG.maxRetriesPerCode})`);

        const r = await insertOne(code);
        if (r.ok) {
          log("✅ OK", { code, via: r.via });
          done = true;
          break;
        } else {
          warn("❌ Falha", { code, reason: r.reason });
          await delay(CONFIG.retrySameCodeMs);
        }
      }

      if (!done) {
        err("Parando: não consegui inserir este código", { code });
        break;
      }

      await delay(CONFIG.betweenCodesMs);
    }

    log("🎉 Fim.");
  })();

})();
