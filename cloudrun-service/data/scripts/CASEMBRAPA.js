/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "#gridSolicitacao_gridProcedimentosSimples",
    "#gridSolicitacao_gridProcedimentosSimples #insertButton",
    "input[name='PROCEDIMENTO']",
    "input[name='COBRADOQDE']",
    "#gridSolicitacao_gridProcedimentosSimples #postButton"
  ],
  "actions": { "focus": "#gridSolicitacao_gridProcedimentosSimples" }
}*/

/* CASEMBRAPA.js — Runner do plano (IIFE) ✅
   - Usa window.__HP_PAYLOAD__ (setado pelo popup): { codes, kitKey, planId, detect }
   - Frame filter: só roda no frame que contém a grid/alvos
   - Botão flutuante: executa ao clicar
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // =========================
  // ✅ FRAME FILTER (CRÍTICO)
  // =========================
  const TARGET_SELECTORS = [
    "#gridSolicitacao_gridProcedimentosSimples",
    "#gridSolicitacao_gridProcedimentosSimples #insertButton",
    "#gridSolicitacao_gridProcedimentosSimples #postButton",
    "input[name='PROCEDIMENTO']",
    "input[name='COBRADOQDE']",
  ];

  const HAS_TARGET = TARGET_SELECTORS.some((sel) => {
    try { return !!document.querySelector(sel); } catch { return false; }
  });
  if (!HAS_TARGET) return;

  // base helpers (se existir). senão, fallback minimalista.
  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  function isVisible(el) {
    if (B?.isVisible) return B.isVisible(el);
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function waitForElement(selector, { timeoutMs = 30000, root = document } = {}) {
    if (B?.waitForElement) return B.waitForElement(selector, { timeoutMs, root });
    return new Promise((resolve) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(root.documentElement || root, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
    });
  }

  function fire(el, type) {
    if (B?.fire) return B.fire(el, type);
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function fireKey(el, type, key) {
    if (B?.fireKey) return B.fireKey(el, type, key);
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key, code: key, keyCode: key === "Enter" ? 13 : 0, which: key === "Enter" ? 13 : 0 }));
  }

  async function ghostType(el, text, charDelay = 10) {
    if (B?.ghostType) return B.ghostType(el, text, charDelay);
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    for (const ch of String(text)) {
      el.value += ch;
      fire(el, "input");
      await delay(charDelay);
    }
    fire(el, "change");
    fireKey(el, "keydown", "Enter");
    fireKey(el, "keyup", "Enter");
  }

  async function click(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    el.click();
    await delay(250);
    return true;
  }

  // ⚠️ Caso o portal tenha overlay genérico, você pode plugar aqui depois.
  // Mantive como "no-op" seguro.
  async function waitOverlayOff(timeoutMs = 20000) {
    if (B?.waitOverlayOff) {
      // se você já tem um seletor padrão, pode trocar
      // return B.waitOverlayOff("#dvAguarde", timeoutMs);
      return true;
    }
    // fallback: nada pra esperar
    await delay(50);
    return true;
  }

  // remove antigo
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  // =========================
  // ✅ LÓGICA CASEMBRAPA
  // =========================
  const gridId = "gridSolicitacao_gridProcedimentosSimples";

  function getGrid() {
    return document.getElementById(gridId) || null;
  }

  function getInsertBtn(grid) {
    return grid?.querySelector("#insertButton") || null;
  }

  function getPostBtn(grid) {
    return grid?.querySelector("#postButton") || null;
  }

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia de códigos.");
      return { ok: false, msg: "Lista vazia" };
    }

    const grid = getGrid() || await waitForElement(`#${gridId}`, { timeoutMs: 30000 });
    if (!grid) {
      err("❌ Grid não encontrada:", gridId);
      return { ok: false, msg: "Grid não encontrada" };
    }

    log("▶️ Rodando inserção…", { kit: payload.kitKey, total: list.length });

    for (let i = 0; i < list.length; i++) {
      const code = String(list[i]);
      await waitOverlayOff(20000);

      // novo registro
      const insertBtn = getInsertBtn(grid);
      if (!insertBtn) {
        warn("⚠️ insertButton não encontrado no grid. Abortando.");
        return { ok: false, msg: "insertButton não encontrado" };
      }
      await click(insertBtn);
      await delay(400);

      // campo PROCEDIMENTO
      const proc = await waitForElement("input[name='PROCEDIMENTO']", { timeoutMs: 15000 });
      if (!proc) {
        warn("⚠️ Campo PROCEDIMENTO não apareceu:", code, "(pulando)");
        continue;
      }

      await ghostType(proc, code, 8);

      // quantidade (se existir)
      const qtd = await waitForElement("input[name='COBRADOQDE']", { timeoutMs: 5000 });
      if (qtd) {
        await ghostType(qtd, "1", 5);
      }

      // confirmar/post
      const postBtn = getPostBtn(grid);
      if (!postBtn) {
        warn("⚠️ postButton não encontrado (não confirmou):", code);
        continue;
      }
      await click(postBtn);

      await delay(2500);
      log("✅ Inserido:", code, `(${i + 1}/${list.length})`);
      await delay(900);
    }

    log("🎉 Finalizado!");
    return { ok: true, msg: "Finalizado" };
  }

  // =========================
  // ✅ Botão flutuante
  // =========================
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = []; // fallback se quiser “hardcode” para debug

  const btn = (B?.makeFloatingButton)
    ? B.makeFloatingButton({
        id: "hpRunnerFloatingBtn",
        text: "⚡ Inserir Procedimentos",
        onClick: async () => {
          const list = codesFromPopup.length ? codesFromPopup : defaultCodes;
          if (!list.length) {
            hint.textContent = "Nenhum código carregado. Rode pelo popup.";
            return;
          }
          hint.textContent = `Executando ${list.length}…`;
          await runInsercao(list);
          hint.textContent = "Finalizado ✅";
        }
      })
    : (() => {
        const b = document.createElement("button");
        b.id = "hpRunnerFloatingBtn";
        b.type = "button";
        b.textContent = "⚡ Inserir Procedimentos";
        b.style.cssText = `
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
        document.body.appendChild(b);
        return b;
      })();

  const hint = (B?.makeFloatingHint)
    ? B.makeFloatingHint({
        id: "hpRunnerFloatingHint",
        text: "Abra a tela da solicitação e clique aqui.",
      })
    : (() => {
        const h = document.createElement("div");
        h.id = "hpRunnerFloatingHint";
        h.textContent = "Abra a tela da solicitação e clique aqui.";
        h.style.cssText = `
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
        document.body.appendChild(h);
        return h;
      })();

  if (!B?.makeFloatingButton) {
    btn.onclick = async () => {
      const list = codesFromPopup.length ? codesFromPopup : defaultCodes;
      if (!list.length) {
        hint.textContent = "Nenhum código carregado. Rode pelo popup.";
        return;
      }
      hint.textContent = `Executando ${list.length}…`;
      await runInsercao(list);
      hint.textContent = "Finalizado ✅";
    };
  }

  log("✅ Runner carregado. Payload:", { planId: payload.planId, kitKey: payload.kitKey, codes: codesFromPopup.length });
})();
