/* STF_MED • Inserção em lote (COMPLETO • avança pela LISTA, não pelo hidden)
   ✅ Resolve: não avança / fica preso no 1º código (hidden_not_filled)
   ✅ Critério de sucesso: o texto "40301087 | ..." aparece na lista de itens solicitados
   ✅ Evita duplicar: se o código já estiver na lista, pula
   Fonte de códigos (sem mexer em background):
     1) window.__HP_RUNNER.payload.codes
     2) window.__HP_BUNDLE.codes
     3) localStorage["HP_STF_MED_CODES"] (JSON array)
*/
(() => {
  const TAG = "STF_MED";
  const LS_CODES = "HP_STF_MED_CODES";
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // ========= CONFIG (aumente se quiser mais lento) =========
  const CONFIG = {
    typeDelayMs: 70,
    afterClearMs: 250,
    afterTypeMs: 350,
    afterSearchClickMs: 550,

    waitModalTimeoutMs: 15000,
    waitGridTimeoutMs: 22000,

    afterRowClickMs: 700,
    afterOkClickMs: 700,

    waitListTimeoutMs: 18000,

    betweenCodesMs: 650,
    retrySameCodeMs: 1200,
    maxRetriesPerCode: 3
  };

  // ========= anti dupla execução =========
  if (window.__HP_STF_MED_FULL__) return;
  window.__HP_STF_MED_FULL__ = true;

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

  // ========= achar lookup do HandleTermo (começando pelo input que você colou) =========
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

    const hidden = container.querySelector("input[name='HandleTermo']") || null;
    const btnClear = container.querySelector("button[ng-click='lookupCtrl.clearSelected()']") || null;
    const btnSearch = container.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']") || null;

    if (!btnSearch) return null;
    return { display, hidden, btnClear, btnSearch };
  }

  // ========= modal =========
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

  // ========= codes source (sem mexer no resto do seu projeto) =========
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

  // ========= ✅ critério REAL: o item apareceu na lista (como "40301087 | ...") =========
  function listHasCode(code) {
    const c = String(code);
    // procura texto em elementos "folha" (sem filhos) para ser rápido e evitar falso positivo
    const leaves = document.querySelectorAll("span, div, td, p, li, label, a");
    const needle = `${c} |`;
    for (const el of leaves) {
      if (el.children && el.children.length) continue;
      const txt = (el.textContent || "").trim();
      if (txt.includes(needle)) return true;
    }
    return false;
  }

  async function waitListHasCode(code) {
    return await waitFor(() => listHasCode(code) ? true : null, {
      timeout: CONFIG.waitListTimeoutMs,
      step: 250
    });
  }

  // ========= selecionar 1 código =========
  async function selectOne(code) {
    const ctx = findLookup();
    if (!ctx) return { ok:false, reason:"lookup_not_found" };

    const { display, hidden, btnClear, btnSearch } = ctx;

    // se já está na lista, não duplica
    if (listHasCode(code)) return { ok:true, via:"already_in_list" };

    // limpar
    btnClear?.click();
    await delay(CONFIG.afterClearMs);

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

    // modal
    const m = await waitFor(() => modalEl(), { timeout: CONFIG.waitModalTimeoutMs, step: 200 });
    if (!m) return { ok:false, reason:"modal_not_open" };

    // grid
    const rows = await waitFor(() => {
      const r = findRows(m);
      return r.length ? r : null;
    }, { timeout: CONFIG.waitGridTimeoutMs, step: 200 });

    if (!rows) return { ok:false, reason:"grid_not_found" };

    // zera hidden se existir (não é mais critério principal)
    if (hidden) {
      hidden.value = "";
      hidden.dispatchEvent(new Event("input", { bubbles:true }));
      hidden.dispatchEvent(new Event("change", { bubbles:true }));
    }

    // escolher row (código ou 1ª)
    const row = pickRowByCode(rows, txt);
    if (!row) return { ok:false, reason:"row_not_found" };

    row.scrollIntoView({ block:"center" });

    // clique mais forte: clica no primeiro TD se existir
    const clickTarget = row.querySelector("td") || row;
    clickTarget.click();
    await delay(CONFIG.afterRowClickMs);

    // confirma (quando existe)
    const okBtn = findOkButton(m);
    if (okBtn) {
      okBtn.click();
      await delay(CONFIG.afterOkClickMs);
    } else {
      // fallback: dblclick
      clickTarget.dispatchEvent(new MouseEvent("dblclick", { bubbles:true }));
      await delay(CONFIG.afterOkClickMs);
    }

    // ✅ sucesso: apareceu na lista
    const okList = await waitListHasCode(code);
    if (okList) return { ok:true, via:"added_to_list" };

    // fallback: hidden preenchido (se acontecer)
    if (hidden && (hidden.value || "").toString().trim()) return { ok:true, via:"hidden_filled" };

    return { ok:false, reason:"not_added_to_list" };
  }

  // ========= MAIN =========
  (async () => {
    const codes = getCodes();
    if (!codes.length) {
      warn(`Sem códigos. Para testar:
localStorage.setItem("${LS_CODES}", JSON.stringify(["40301087","40301150","40301222"]))`);
      return;
    }

    log("Iniciando", { total: codes.length, config: CONFIG });

    for (let i = 0; i < codes.length; i++) {
      const code = String(codes[i]);

      if (listHasCode(code)) {
        log(`⏭️ Já estava na lista: ${code}`);
        continue;
      }

      let ok = false;
      for (let attempt = 1; attempt <= CONFIG.maxRetriesPerCode; attempt++) {
        log(`▶️ (${i+1}/${codes.length}) ${code} (tentativa ${attempt}/${CONFIG.maxRetriesPerCode})`);

        const res = await selectOne(code);
        if (res.ok) {
          ok = true;
          log("✅ OK", { code, via: res.via });
          break;
        } else {
          warn("❌ Falha", { code, reason: res.reason });
          await delay(CONFIG.retrySameCodeMs);
        }
      }

      if (!ok) {
        err("Parando: não conseguiu inserir este código", { code });
        break;
      }

      await delay(CONFIG.betweenCodesMs);
    }

    log("Fim.");
  })();
})();
