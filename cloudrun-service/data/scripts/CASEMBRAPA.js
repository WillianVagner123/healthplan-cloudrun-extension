/*@maskara{
  "mustUrlIncludes": ["casembrapa", "prestador.casem..."],
  "detectAny": [
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "section.wf-grid__title-bar",
    "input[name='PROCEDIMENTO']"
  ],
  "actions": { "focus": "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']" }
}*/

/* CASEMBRAPA.js — Runner (IIFE) ✅
   - Closed Shadow DOM: não dá pra querySelector no botão “Inserir”
   - Estratégia:
     1) focar no frame/grid
     2) usar atalho (Insert/Ctrl+N/Alt+I)
     3) fallback: clique por coordenada na área do "+" (se necessário)
   - Usa window.__HP_PAYLOAD__ com { codes, kitKey, planId, detect }
*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // =========================
  // ✅ FRAME FILTER (FORTE)
  // =========================
  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";
  const gridHost = document.querySelector(GRID_HOST_SEL);
  if (!gridHost) return;

  // opcional: reforçar pelo domínio (se quiser)
  // if (!/casembrapa/i.test(location.href)) return;

  // =========================
  // ✅ LOCK (anti-duplo run)
  // =========================
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope]) {
    console.log(scope + ":", "⛔ já em execução (ignorado)");
    return;
  }
  window.__HP_RUN_LOCKS__[scope] = false; // só trava quando clicar

  // base helpers (se existir). senão, fallback.
  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  function remove(id) { const el = document.getElementById(id); if (el) el.remove(); }
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

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
  // ✅ “FOCUS REAL” NO FRAME
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
    const host = document.querySelector(GRID_HOST_SEL);
    if (!host) return null;

    try { host.scrollIntoView?.({ block: "center" }); } catch {}

    // clique no centro do host (ajuda a “entrar” no componente shadow)
    const r = host.getBoundingClientRect();
    const cx = Math.max(5, Math.min(window.innerWidth - 5, r.left + r.width * 0.50));
    const cy = Math.max(5, Math.min(window.innerHeight - 5, r.top  + r.height * 0.30));
    clickAt(cx, cy);

    // também tenta clicar no próprio host (às vezes propaga)
    try { host.click?.(); } catch {}

    // garante foco no documento do frame
    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}

    await delay(120);
    return host;
  }

  // =========================
  // ✅ ESPERA CAMPOS “EDITÁVEIS”
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

    // Enter
    fireKey(input, "keydown", { key: "Enter", code: "Enter" });
    fireKey(input, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(220);
  }

  // =========================
  // ✅ INSERIR LINHA (ATALHOS + FALLBACK COORD)
  // =========================
  async function tryInsertRow() {
    await focusGrid();
    await backpressure(180);

    // helper: verifica se já abriu editor
    const hasEditor = async () => {
      const proc = await waitEditable("PROCEDIMENTO", 900);
      return !!proc;
    };

    // 1) Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(300);
    if (await hasEditor()) return true;

    // 2) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup",   { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(300);
    if (await hasEditor()) return true;

    // 3) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(300);
    if (await hasEditor()) return true;

    // 4) FALLBACK: clique por coordenada onde normalmente fica o "+" (toolbar da grid)
    //    (isso é heurística, mas ajuda muito quando atalho não funciona)
    const host = document.querySelector(GRID_HOST_SEL);
    if (host) {
      const r = host.getBoundingClientRect();
      // topo esquerdo da grid (onde fica a barra de ícones). Ajuste fino se precisar.
      const x = Math.max(5, Math.min(window.innerWidth - 5, r.left + 120));
      const y = Math.max(5, Math.min(window.innerHeight - 5, r.top + 26));
      clickAt(x, y);
      await backpressure(450);
      if (await hasEditor()) return true;
    }

    return false;
  }

  async function confirmRow() {
    // Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(220);

    // Ctrl+Enter (alguns grids confirmam assim)
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(220);
  }

  // =========================
  // ✅ RUN PRINCIPAL
  // =========================
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia (payload.codes).");
      return { ok: false, msg: "Lista vazia" };
    }

    // lock ON
    window.__HP_RUN_LOCKS__[scope] = true;

    try {
      log("▶️ Iniciando…", { total: list.length, kit: payload.kitKey, planId: payload.planId });

      for (let i = 0; i < list.length; i++) {
        const code = String(list[i]);

        // inserir
        const inserted = await tryInsertRow();
        if (!inserted) {
          err("❌ Não consegui abrir a linha para inserir (frame/foco/atalho).", { code });
          break;
        }

        // PROCEDIMENTO editável
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          warn("⚠️ PROCEDIMENTO não ficou editável (pulando).", { code });
          await backpressure(900);
          continue;
        }

        await backpressure(250);
        await typeAndEnter(proc, code);
        await backpressure(700);

        // quantidade (se surgir)
        const qtd = await waitEditable("COBRADOQDE", 4500);
        if (qtd) {
          await typeAndEnter(qtd, "1");
          await backpressure(650);
        }

        // confirmar + esperar salvar (voltar readonly/disabled)
        await confirmRow();
        await backpressure(900);
        await waitNotEditable("PROCEDIMENTO", 25000);

        log(`✅ Inserido ${code} (${i + 1}/${list.length})`);
        await backpressure(1200); // descanso grande = menos “data channel busy”
      }

      log("🎉 Finalizado!");
      return { ok: true, msg: "Finalizado" };
    } catch (e) {
      err("❌ Erro:", e);
      return { ok: false, msg: String(e?.message || e) };
    } finally {
      // lock OFF
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // ✅ BOTÃO FLUTUANTE
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  const btn = document.createElement("button");
  btn.id = "hpRunnerFloatingBtn";
  btn.type = "button";
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    padding: 12px 14px;
    border-radius: 14px;
    border: none;
    background: #0d6efd;
    color: #fff;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(0,0,0,.25);
    user-select: none;
  `;
  document.body.appendChild(btn);

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Abra a grid “Demais Procedimentos” e clique aqui.";
  hint.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 62px;
    z-index: 2147483647;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(0,0,0,.65);
    color: rgba(255,255,255,.92);
    font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
    box-shadow: 0 10px 24px rgba(0,0,0,.20);
  `;
  document.body.appendChild(hint);

  btn.onclick = async () => {
    if (window.__HP_RUN_LOCKS__[scope]) {
      hint.textContent = "Já executando…";
      return;
    }
    const list = codesFromPopup;
    if (!list.length) {
      hint.textContent = "Nenhum código no payload. Rode pelo popup.";
      return;
    }
    hint.textContent = `Executando ${list.length}…`;
    const r = await runInsercao(list);
    hint.textContent = r?.ok ? "Finalizado ✅" : `Falhou: ${r?.msg || "erro"}`;
  };

  log("✅ Runner carregado no frame certo.", {
    href: location.href,
    kitKey: payload.kitKey,
    codes: codesFromPopup.length
  });
})();

