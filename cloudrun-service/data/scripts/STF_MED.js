/*@maskara{
  "mustUrlIncludes": ["Guias", "SpSadt"],
  "detectAny": [
    "#HandleTermo",
    "input[name='HandleTermo']",
    "#modal-lookup"
  ],
  "actions": { "focus": "#HandleTermo" }
}*/

(() => {
  const TAG = "STF_MED";
  const LS_KEY = "HP_STF_MED_STATE_v2";
  const LS_CODES = "HP_STF_MED_CODES";

  // =========================
  // ✅ anti dupla injeção
  // =========================
  if (window.__HP_STF_MED_RUNNER_V2__) return;
  window.__HP_STF_MED_RUNNER_V2__ = true;

  // =========================
  // ✅ achar campo e CONTAINER do lookup (evita id duplicado)
  // =========================
  const display = document.querySelector("#HandleTermo");
  if (!display) return;

  // o container correto é o <div ... lookup="true" ...> que você colou
  const container =
    display.closest("div[lookup='true']") ||
    display.closest("div[campos-dependencia-extras]") ||
    display.closest(".input-group")?.parentElement ||
    display.parentElement;

  if (!container) return;

  const hidden = container.querySelector("input[name='HandleTermo']");
  if (!hidden) return;

  // =========================
  // ✅ utils
  // =========================
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

  function pressEnter(el) {
    const mk = (t) => new KeyboardEvent(t, { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    el.dispatchEvent(mk("keydown"));
    el.dispatchEvent(mk("keypress"));
    el.dispatchEvent(mk("keyup"));
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
    // considera "aberto" se display block OU class "in"
    const style = window.getComputedStyle(m);
    const open = (style.display !== "none") || m.classList.contains("in");
    return open ? m : null;
  }

  function findSearchButton() {
    // botão lupa ao lado do HandleTermo (dentro do mesmo container)
    return container.querySelector(".input-group-btn button .fa-search")?.closest("button") || null;
  }

  function findRows(scopeRoot) {
    // Benner costuma renderizar rows dentro do modal com classes variadas
    return Array.from(scopeRoot.querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr"))
      .filter(r => (r.innerText || "").trim().length > 0);
  }

  function pickRowByCode(rows, code) {
    const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) if (norm(r.innerText).includes(code)) return r;
    return rows[0] || null;
  }

  function findModalOkButton(m) {
    // tenta achar um botão "OK/Selecionar/Confirmar" no modal
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
    // prioriza onclick lkp_ok (quando existe)
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
  // ✅ ação: selecionar termo pelo código
  // =========================
  async function selectTerm(code) {
    // limpa e digita no DISPLAY
    display.focus();
    display.value = "";
    dispatchInput(display);
    await delay(60);

    for (const ch of String(code)) {
      display.value += ch;
      dispatchInput(display);
      await delay(25);
    }

    // 1) tenta Enter
    display.focus();
    pressEnter(display);

    // 2) se não abriu modal, tenta botão lupa
    let m = await waitFor(() => modalEl(), { timeout: 2000, step: 100 });
    if (!m) {
      const btn = findSearchButton();
      if (btn) btn.click();
      m = await waitFor(() => modalEl(), { timeout: 6000, step: 120 });
    }

    // se modal abriu, procurar rows dentro dele
    if (m) {
      const rows = await waitFor(() => {
        const r = findRows(m);
        return r.length ? r : null;
      }, { timeout: 12000, step: 150 });

      if (!rows) return { ok: false, reason: "modal_grid_not_found" };

      // zera hidden para validar “commit”
      hidden.value = "";
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));

      const row = pickRowByCode(rows, String(code));
      if (!row) return { ok: false, reason: "modal_row_not_found" };

      row.scrollIntoView({ block: "center" });
      row.click();

      // tenta OK/Selecionar (quando o Benner exige)
      const okBtn = findModalOkButton(m);
      if (okBtn) okBtn.click();

      // espera hidden preencher OU modal fechar
      const got = await waitFor(() => {
        const v = (hidden.value || "").toString().trim();
        if (v) return v;
        // às vezes fecha e só depois grava; aguarda um pouco
        return null;
      }, { timeout: 8000, step: 120 });

      if (got) return { ok: true, handle: got };

      // fallback: dblclick na row
      row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const got2 = await waitFor(() => {
        const v = (hidden.value || "").toString().trim();
        return v ? v : null;
      }, { timeout: 6000, step: 120 });

      if (got2) return { ok: true, handle: got2 };

      return { ok: false, reason: "hidden_not_filled_after_modal" };
    }

    // se NÃO abriu modal, tenta achar grid “inline” (alguns fluxos fazem isso)
    const rowsInline = await waitFor(() => {
      const r = findRows(document);
      return r.length ? r : null;
    }, { timeout: 5000, step: 150 });

    if (!rowsInline) return { ok: false, reason: "no_modal_no_inline_grid" };

    hidden.value = "";
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));

    const row2 = pickRowByCode(rowsInline, String(code));
    row2?.click();

    const got3 = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: 6000, step: 120 });

    if (got3) return { ok: true, handle: got3 };
    return { ok: false, reason: "inline_hidden_not_filled" };
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
        warn("Sem codes no payload/bundle/localStorage (aguardando push do background).");
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

    log("🛡️ Runner + Watchdog ativos", { container: !!container, modal: !!document.querySelector("#modal-lookup") });

    // loop
    setInterval(tick, 450);

    // watchdog: re-render do Angular / modal
    const mo = new MutationObserver(() => tick());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  arm();
})();
