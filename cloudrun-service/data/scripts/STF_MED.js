/*@maskara{
  "mustUrlIncludes": ["benner", "conecta", "portal", "Guias", "SpSadt"],
  "detectAny": [
    "#HandleTermo",
    "input[name='HandleTermo']",
    "[ng-enter-send*='SearchWithEnter']",
    ".input-group button .fa-search",
    "tr.dataGridRow"
  ],
  "actions": { "focus": "#HandleTermo" }
}*/

(() => {
  const TAG = "STF_MED";
  const LS_KEY = "HP_STF_MED_STATE_v1";
  const LS_CODES = "HP_STF_MED_CODES"; // fallback p/ codes (JSON array)

  // =========================
  // ✅ FRAME FILTER (anti-pisca)
  // =========================
  const field = document.getElementById("HandleTermo");
  const hidden = document.querySelector('input[name="HandleTermo"]');
  const HAS_TARGET = !!field && !!hidden;
  if (!HAS_TARGET) return;

  // =========================
  // ✅ Utils
  // =========================
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  const now = () => new Date().toISOString().slice(11, 19);

  function log(msg, obj) {
    if (obj !== undefined) console.log(`${TAG}: ${msg}`, obj);
    else console.log(`${TAG}: ${msg}`);
  }
  function warn(msg, obj) {
    if (obj !== undefined) console.warn(`${TAG}: ${msg}`, obj);
    else console.warn(`${TAG}: ${msg}`);
  }
  function err(msg, obj) {
    if (obj !== undefined) console.error(`${TAG}: ${msg}`, obj);
    else console.error(`${TAG}: ${msg}`);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
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
    const mk = (type) =>
      new KeyboardEvent(type, { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
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

  function findSearchButton() {
    return field.closest(".input-group")?.querySelector("button .fa-search")?.closest("button") || null;
  }

  function findGridRows() {
    // Ajuste leve: alguns grids do Benner mudam classes
    return Array.from(document.querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, tr.ng-scope"))
      .filter(r => (r.innerText || "").trim().length > 0);
  }

  function pickRowByCode(rows, code) {
    const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) {
      if (norm(r.innerText).includes(code)) return r;
    }
    return rows[0] || null;
  }

  // =========================
  // ✅ Codes Provider (sem hardcode)
  // =========================
  function getCodes() {
    // 1) payload direto (padrão runner)
    const p = window.__HP_RUNNER?.payload?.codes;
    if (Array.isArray(p) && p.length) return p.map(String);

    // 2) bundle já injetado no DOM
    const b = window.__HP_BUNDLE?.codes;
    if (Array.isArray(b) && b.length) return b.map(String);

    // 3) fallback localStorage (background pode gravar aqui)
    try {
      const ls = JSON.parse(localStorage.getItem(LS_CODES) || "[]");
      if (Array.isArray(ls) && ls.length) return ls.map(String);
    } catch {}

    return [];
  }

  // =========================
  // ✅ Core action: selecionar termo
  // =========================
  async function selectTermByCode(code) {
    // limpa display
    field.focus();
    field.value = "";
    dispatchInput(field);
    await delay(60);

    // digita (inputmask/uppercase)
    for (const ch of String(code)) {
      field.value += ch;
      dispatchInput(field);
      await delay(25);
    }

    // tenta Enter (ng-enter-send)
    field.focus();
    pressEnter(field);

    // se não abriu grid, tenta botão lupa (SearchWithButton)
    let rows = await waitFor(() => {
      const r = findGridRows();
      return r.length ? r : null;
    }, { timeout: 8000, step: 150 });

    if (!rows || !rows.length) {
      const btn = findSearchButton();
      if (btn) {
        btn.click();
        rows = await waitFor(() => {
          const r = findGridRows();
          return r.length ? r : null;
        }, { timeout: 8000, step: 150 });
      }
    }

    if (!rows || !rows.length) {
      return { ok: false, reason: "grid_not_found" };
    }

    // zera hidden pra validar se selecionou
    hidden.value = "";
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    hidden.dispatchEvent(new Event("change", { bubbles: true }));

    const row = pickRowByCode(rows, String(code));
    if (!row) return { ok: false, reason: "row_not_found" };

    row.scrollIntoView({ block: "center" });
    row.click();

    // espera hidden preencher
    const handle = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: 7000, step: 120 });

    if (handle) return { ok: true, handle };

    // fallback: dblclick
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const handle2 = await waitFor(() => {
      const v = (hidden.value || "").toString().trim();
      return v ? v : null;
    }, { timeout: 6000, step: 120 });

    if (handle2) return { ok: true, handle: handle2 };

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
        warn("Sem codes no payload/bundle/localStorage. (aguardando push do background)");
        running = false;
        return;
      }

      const st = loadState();
      const idx = Number.isFinite(st.idx) ? st.idx : 0;

      if (st.done) {
        log("Já finalizado. (state.done=true)");
        running = false;
        return;
      }

      if (idx >= codes.length) {
        saveState({ done: true, idx: codes.length });
        log("🎉 Finalizado (idx >= total).", { total: codes.length });
        running = false;
        return;
      }

      const code = codes[idx];
      log(`▶️ (${idx + 1}/${codes.length}) ${code}`);

      const res = await selectTermByCode(code);

      if (res.ok) {
        saveState({ idx: idx + 1, lastCode: code, lastHandle: res.handle, lastOkAt: Date.now(), done: false });
        log("✅ Selecionado", { code, handle: res.handle });
        await delay(350);
      } else {
        // não avança idx; watchdog tenta de novo
        saveState({ lastCode: code, lastFailAt: Date.now(), lastReason: res.reason });
        warn("❌ Falha ao selecionar (vai tentar de novo)", { code, reason: res.reason });
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

    // se reinjetou no mesmo doc, não reinicia tudo: mantém state
    const st = loadState();
    if (!st.startedAt) saveState({ startedAt: Date.now(), idx: st.idx ?? 0, done: !!st.done });

    log(`🛡️ Runner + Watchdog ativos`, { time: now() });

    // loop
    setInterval(tick, 450);

    // watchdog: re-render do Angular / troca de DOM (pisca)
    const mo = new MutationObserver(() => tick());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  arm();
})();
