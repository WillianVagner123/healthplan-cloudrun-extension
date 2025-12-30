/*@maskara{
  "mustUrlIncludes": ["Guias", "SpSadt"],
  "detectAny": [
    "div[lookup='true'] input[name='HandleTermoLookupDisplay']",
    "div[lookup='true'] input[name='HandleTermo']",
    "button[ng-click='lookupCtrl.SearchWithButton()']",
    "#modal-lookup"
  ],
  "actions": { "focus": "div[lookup='true'] input[name='HandleTermoLookupDisplay']" }
}*/

(() => {
  const TAG = "STF_MED";
  const LS_KEY  = "HP_STF_MED_STATE_v3";
  const LS_CODES = "HP_STF_MED_CODES"; // fallback: JSON array de códigos

  // =========================
  // ✅ anti dupla injeção
  // =========================
  if (window.__HP_STF_MED_RUNNER_V3__) return;
  window.__HP_STF_MED_RUNNER_V3__ = true;

  // =========================
  // ✅ achar o container do lookup do TERMO (evita ids duplicados)
  // =========================
  const displayAny =
    document.querySelector("div[lookup='true'] input#HandleTermo[name='HandleTermoLookupDisplay']") ||
    document.querySelector("div[lookup='true'] input[name='HandleTermoLookupDisplay']") ||
    document.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']");

  if (!displayAny) return;

  const container =
    displayAny.closest("div[lookup='true']") ||
    displayAny.closest("div[campos-dependencia-extras]") ||
    displayAny.closest(".input-group")?.parentElement ||
    displayAny.parentElement;

  if (!container) return;

  const display =
    container.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']") ||
    container.querySelector("input[name='HandleTermoLookupDisplay']") ||
    displayAny;

  const hidden =
    container.querySelector("input[name='HandleTermo']");

  const btnClear =
    container.querySelector("button[ng-click='lookupCtrl.clearSelected()']") ||
    container.querySelector(".input-group-btn button .fa-times")?.closest("button") ||
    null;

  const btnSearch =
    container.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']") ||
    container.querySelector(".input-group-btn button .fa-search")?.closest("button") ||
    null;

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function log(msg, obj) { obj !== undefined ? console.log(`${TAG}: ${msg}`, obj) : console.log(`${TAG}: ${msg}`); }
  function warn(msg, obj) { obj !== undefined ? console.warn(`${TAG}: ${msg}`, obj) : console.warn(`${TAG}: ${msg}`); }
  function err(msg, obj) { obj !== undefined ? console.error(`${TAG}: ${msg}`, obj) : console.error(`${TAG}: ${msg}`); }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
  }
  function saveState(patch) {
    const s = { ...loadState(), ...patch, updatedAt: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    return s;
  }

  function dispatchInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitFor(fn, { timeout = 12000, step = 150 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch {}
      await delay(step);
    }
    return null;
  }

  function modalEl() {
    const m = document.querySelector("#modal-lookup");
    if (!m) return null;
    const style = window.getComputedStyle(m);
    const open = (style.display !== "none") || m.classList.contains("in");
    return open ? m : null;
  }

  function findRows(scopeRoot) {
    // tenta ser permissivo: Benner usa várias combinações
    const rows = Array.from(scopeRoot.querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr"))
      .filter(r => (r.innerText || "").trim().length > 0);
    return rows;
  }

  function pickRowByCode(rows, code) {
    const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) if (norm(r.innerText).includes(code)) return r;
    return rows[0] || null;
  }

  function findModalOkButton(m) {
    const btns = Array.from(m.querySelectorAll("button, a")).filter(x => {
      const t = (x.innerText || "").trim().toLowerCase();
      const oc = (x.getAttribute("onclick") || "").toLowerCase();
      const ng = (x.getAttribute("ng-click") || "").toLowerCase();
      return (
        /ok|selecionar|confirmar|escolher/.test(t) ||
        oc.includes("lkp_ok") ||
        ng.includes("ok") ||
        ng.includes("select")
      );
    });
    const lkp = btns.find(b => ((b.getAttribute("onclick") || "").toLowerCase().includes("lkp_ok")));
    return lkp || btns[0] || null;
  }

  // =========================
  // ✅ codes provider (sem hardcode)
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
  // ✅ ação: selecionar termo
  // =========================
  async function selectTerm(code) {
    if (!display || !hidden || !btnSearch) return { ok: false, reason: "missing_elements" };

    // limpa via botão (Angular)
    btnClear?.click();
    await delay(60);

    // limpa manual também
    display.focus();
    display.value = "";
    dispatchInput(display);
    await delay(60);

    // digita
    const txt = String(code);
    for (const ch of txt) {
      display.value += ch;
      dispatchInput(display);
      await delay(20);
    }

    // 🔥 sempre aciona busca pela lupa (mais confiável que Enter)
    btnSearch.click();

    // espera modal
    const m = await waitFor(() => modalEl(), { timeout: 8000, step: 120 });
    if (!m) return { ok: false, reason: "modal_not_open" };

    // espera rows dentro do modal
    const rows = await waitFor(() => {
      const r = findRows(m);
      return r.length ? r : null;
    }, { timeout: 12000, step: 150 });

    if (!rows) return { ok: false, reason: "modal_grid_not_found" };

    // zera hidden pra validar commit
    hidden.value = "";
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));

    const row = pickRowByCode(rows, txt);
    if (!row) return { ok: false, reason: "modal_row_not_found" };

    row.scrollIntoView({ block: "center" });
    row.click();
    await delay(120);

    // tenta botão OK/Selecionar se existir
    const okBtn = findModalOkButton(m);
    if (okBtn) okBtn.click();

    // espera hidden preencher
    const got = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: 9000, step: 120 });

    if (got) return { ok: true, handle: got };

    // fallback: dblclick na row
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const got2 = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: 6000, step: 120 });

    if (got2) return { ok: true, handle: got2 };

    return { ok: false, reason: "hidden_not_filled" };
  }

  // =========================
  // ✅ Runner + Watchdog
  // =========================
  let armed = false;
  let running = false;

  async function tick() {
    if (!armed || running) return;
    running = true;

    try {
      const codes = getCodes();
      if (!codes.length) {
        warn("Sem codes (payload/bundle/localStorage). Aguarde o push do background.");
        return;
      }

      const st = loadState();
      const idx = Number.isFinite(st.idx) ? st.idx : 0;

      if (st.done) {
        log("Já finalizado (state.done=true).");
        return;
      }

      if (idx >= codes.length) {
        saveState({ done: true, idx: codes.length });
        log("🎉 Finalizado.", { total: codes.length });
        return;
      }

      const code = codes[idx];
      log(`▶️ (${idx + 1}/${codes.length}) ${code}`);

      const res = await selectTerm(code);

      if (res.ok) {
        saveState({ idx: idx + 1, lastCode: code, lastHandle: res.handle, lastOkAt: Date.now(), done: false, lastReason: null });
        log("✅ Selecionado", { code, handle: res.handle });
        await delay(300);
      } else {
        saveState({ lastCode: code, lastFailAt: Date.now(), lastReason: res.reason });
        warn("❌ Falha (vai tentar novamente)", { code, reason: res.reason });
        await delay(900);
      }
    } catch (e) {
      err("Erro no tick", e);
      await delay(1200);
    } finally {
      running = false;
    }
  }

  function arm() {
    if (armed) return;
    armed = true;

    const st = loadState();
    if (!st.startedAt) saveState({ startedAt: Date.now(), idx: st.idx ?? 0, done: !!st.done });

    log("🛡️ Runner + Watchdog ativos", {
      hasDisplay: !!display,
      hasHidden: !!hidden,
      hasBtnSearch: !!btnSearch,
      hasBtnClear: !!btnClear
    });

    // loop
    setInterval(tick, 450);

    // watchdog (re-render angular / modal)
    const mo = new MutationObserver(() => tick());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  arm();
})();
