/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "section.wf-grid",
    "input[name='PROCEDIMENTO']"
  ],
  "actions": { "focus": "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  // ✅ só roda no frame que tem o grid host
  const host = document.querySelector(GRID_HOST_SEL);
  if (!host) return;

  // ✅ só desenha UI no "frame certo" (o que tem viewport decente)
  const isLikelyVisibleFrame = (() => {
    try {
      // frames "invisíveis" geralmente têm viewport minúsculo
      if (window.innerWidth < 500 || window.innerHeight < 350) return false;
      // se o host não estiver visível, não é o frame que você está vendo
      const r = host.getClientRects();
      if (!r || !r.length) return false;
      return true;
    } catch {
      return true;
    }
  })();

  // helpers
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.getClientRects && el.getClientRects().length);
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await delay(stepMs);
    }
    return null;
  }

  function fireKey(target, type, opts) {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
  }

  async function backpressure(ms = 650) {
    await delay(ms);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }

  // =========================
  // ✅ LOCK
  // =========================
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  // =========================
  // ✅ CLICK/Foco forte no host do grid
  // =========================
  function clickAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("click",     { bubbles: true, clientX: x, clientY: y, button: 0 }));
    return true;
  }

  async function focusGrid() {
    const h = document.querySelector(GRID_HOST_SEL);
    if (!h) return null;

    try { h.scrollIntoView?.({ block: "center" }); } catch {}

    // clique dentro do host (ajuda a “entrar” no shadow)
    const r = h.getBoundingClientRect();
    const cx = Math.max(10, Math.min(window.innerWidth - 10, r.left + r.width * 0.50));
    const cy = Math.max(10, Math.min(window.innerHeight - 10, r.top  + r.height * 0.25));
    clickAt(cx, cy);

    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}

    await delay(120);
    return h;
  }

  // =========================
  // ✅ Espera inputs editáveis
  // =========================
  async function waitEditable(name, timeoutMs = 12000) {
    return waitFor(() => {
      const el = document.querySelector(`input[name='${name}']`);
      if (!el) return null;
      if (!isVisible(el)) return null;
      if (el.disabled) return null;
      if (el.readOnly) return null;
      return el;
    }, timeoutMs);
  }

  async function waitNotEditable(name, timeoutMs = 20000) {
    return waitFor(() => {
      const el = document.querySelector(`input[name='${name}']`);
      if (!el) return true;
      if (!isVisible(el)) return true;
      if (el.disabled) return true;
      if (el.readOnly) return true;
      return false;
    }, timeoutMs);
  }

  async function typeAndEnter(input, value) {
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await backpressure(120);

    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    fireKey(input, "keydown", { key: "Enter", code: "Enter" });
    fireKey(input, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(220);
  }

  // =========================
  // ✅ Inserir linha
  // =========================
  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 900);
    return !!proc;
  }

  async function tryInsertRow() {
    await focusGrid();
    await backpressure(180);

    // 1) Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(300);
    if (await hasEditorSoon()) return true;

    // 2) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup",   { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(300);
    if (await hasEditorSoon()) return true;

    // 3) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(300);
    if (await hasEditorSoon()) return true;

    // 4) fallback coordenada (topo esquerdo da toolbar)
    const h = document.querySelector(GRID_HOST_SEL);
    if (h) {
      const r = h.getBoundingClientRect();
      const x = Math.max(10, Math.min(window.innerWidth - 10, r.left + 120));
      const y = Math.max(10, Math.min(window.innerHeight - 10, r.top + 26));
      clickAt(x, y);
      await backpressure(450);
      if (await hasEditorSoon()) return true;
    }

    return false;
  }

  async function confirmRow() {
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(220);

    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(220);
  }

  // =========================
  // ✅ Run principal
  // =========================
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia (payload.codes).");
      return { ok: false, msg: "Lista vazia" };
    }

    if (window.__HP_RUN_LOCKS__[scope]) return { ok: false, msg: "Já executando" };
    window.__HP_RUN_LOCKS__[scope] = true;

    try {
      log("▶️ Iniciando…", { total: list.length, kit: payload.kitKey });

      for (let i = 0; i < list.length; i++) {
        const code = String(list[i]);

        const inserted = await tryInsertRow();
        if (!inserted) {
          err("❌ Não consegui abrir a linha para inserir.", { code });
          break;
        }

        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          warn("⚠️ PROCEDIMENTO não ficou editável (pulando).", { code });
          await backpressure(900);
          continue;
        }

        await backpressure(250);
        await typeAndEnter(proc, code);
        await backpressure(700);

        const qtd = await waitEditable("COBRADOQDE", 4500);
        if (qtd) {
          await typeAndEnter(qtd, "1");
          await backpressure(650);
        }

        await confirmRow();
        await backpressure(900);
        await waitNotEditable("PROCEDIMENTO", 25000);

        log(`✅ Inserido ${code} (${i + 1}/${list.length})`);
        await backpressure(1200);
      }

      log("🎉 Finalizado!");
      return { ok: true, msg: "Finalizado" };
    } catch (e) {
      err("❌ Erro:", e);
      return { ok: false, msg: String(e?.message || e) };
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // ✅ UI: botão flutuante com watchdog (reaparece se DOM trocar)
  // =========================
  function ensureUI() {
    if (!isLikelyVisibleFrame) return; // não desenha em frame invisível

    let btn = document.getElementById("hpRunnerFloatingBtn");
    let hint = document.getElementById("hpRunnerFloatingHint");

    if (!btn) {
      btn = document.createElement("button");
      btn.id = "hpRunnerFloatingBtn";
      btn.type = "button";
      btn.textContent = "⚡ Inserir Procedimentos";
      btn.style.cssText = `
        position: fixed !important;
        right: 16px !important;
        top: 16px !important;
        z-index: 2147483647 !important;
        padding: 12px 14px !important;
        border-radius: 14px !important;
        border: none !important;
        background: #0d6efd !important;
        color: #fff !important;
        font-weight: 800 !important;
        cursor: pointer !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
        user-select: none !important;
        pointer-events: auto !important;
      `;
      document.documentElement.appendChild(btn);
    }

    if (!hint) {
      hint = document.createElement("div");
      hint.id = "hpRunnerFloatingHint";
      hint.textContent = "Clique para inserir os 55 procedimentos.";
      hint.style.cssText = `
        position: fixed !important;
        right: 16px !important;
        top: 62px !important;
        z-index: 2147483647 !important;
        padding: 8px 10px !important;
        border-radius: 12px !important;
        background: rgba(0,0,0,.65) !important;
        color: rgba(255,255,255,.92) !important;
        font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.20) !important;
        pointer-events: none !important;
      `;
      document.documentElement.appendChild(hint);
    }

    btn.onclick = async () => {
      const list = Array.isArray(payload.codes) ? payload.codes : [];
      if (!list.length) {
        hint.textContent = "Nenhum código no payload (rode pelo popup).";
        return;
      }
      if (window.__HP_RUN_LOCKS__[scope]) {
        hint.textContent = "Já executando…";
        return;
      }
      hint.textContent = `Executando ${list.length}…`;
      const r = await runInsercao(list);
      hint.textContent = r?.ok ? "Finalizado ✅" : `Falhou: ${r?.msg || "erro"}`;
    };
  }

  // watchdog de UI (recria se SPA trocar DOM)
  const uiInterval = setInterval(ensureUI, 800);

  // também observa mudanças fortes
  const mo = new MutationObserver(() => ensureUI());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  ensureUI();

  log("✅ Runner carregado.", {
    href: location.href,
    frame: { w: window.innerWidth, h: window.innerHeight },
    kitKey: payload.kitKey,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0,
    ui: isLikelyVisibleFrame ? "enabled" : "skipped (small/hidden frame)"
  });
})();
