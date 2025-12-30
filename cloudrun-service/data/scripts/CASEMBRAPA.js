/*@maskara{
  "mustUrlIncludes": ["gama", "gamsaude", "gama-saude", "gama_saude", "gama", "saude"],
  "detectAny": [
    "#DvProcedimento",
    "#collapse2",
    "#item_medico_1",
    "input#item_medico_1",
    "input[name='item_medico_1']",
    "#button2",
    "input#button2",
    "input[name='button2']",
    "#qtd_solicitada_1",
    "input[name='qtd_solicitada_1']",
    "#modalDadosBiometria",
    "#validacaoCelularEmail",
    "#btnModalDadosBiometria"
  ],
  "actions": { "focus": "#item_medico_1" }
}*/

/* GAMASAUDE.js — Runner do plano (IIFE) ✅
   - Executa automaticamente ao ser injetado (mas SÓ roda ao clicar no botão)
   - Usa window.__HP_PAYLOAD__ (setado pelo popup) com: { codes, kitKey, planId, detect }
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "GAMASAUDE";

  // =========================
  // ✅ FRAME FILTER (CRÍTICO)
  // =========================
  const TARGET_SELECTORS = [
    "#DvProcedimento",
    "#collapse2",
    "#item_medico_1",
    "input#item_medico_1",
    "input[name='item_medico_1']",
    "#button2",
    "input#button2",
    "input[name='button2']",
    "#qtd_solicitada_1",
    "input[name='qtd_solicitada_1']",
    "#modalDadosBiometria",
  ];

  const HAS_TARGET = TARGET_SELECTORS.some((sel) => {
    try { return !!document.querySelector(sel); } catch { return false; }
  });

  if (!HAS_TARGET) return; // não é o frame certo

  // Base helpers (se existir). Senão, fallback.
  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope  ? B.logScope(scope, ...a)  : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope  ? B.errScope(scope, ...a)  : console.error(scope + ":", ...a));

  // Debug leve (confirma frame)
  try {
    const isTop = (window.top === window);
    const fe = window.frameElement;
    log("🧩 Frame OK", {
      href: location.href,
      isTop,
      frameId: fe?.id || null,
      frameName: window.name || null
    });
  } catch {}

  // remove UI antiga (reinjeção)
  const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };
  remove("hpRunnerFloatingBtn");
  remove("hpRunnerFloatingHint");

  function isVisible(el) {
    if (B?.isVisible) return B.isVisible(el);
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function waitForElement(selector, { timeoutMs = 60000, root = document } = {}) {
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

  async function waitAguardeOff(timeoutMs = 45000) {
    if (B?.waitOverlayOff) return B.waitOverlayOff("#dvAguarde", timeoutMs);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const dv = document.getElementById("dvAguarde");
      const on = dv && isVisible(dv) && getComputedStyle(dv).display !== "none";
      if (!on) return true;
      await delay(150);
    }
    return false;
  }

  function fire(el, type) {
    if (B?.fire) return B.fire(el, type);
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function fireKey(el, type, key) {
    if (B?.fireKey) return B.fireKey(el, type, key);
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  // Mantém “change” (IMPORTANTE: portal depende disso pra descrição/validações)
  async function ghostType(el, text, charDelay = 18) {
    if (B?.ghostType) return B.ghostType(el, text, charDelay);

    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");

    for (const ch of String(text)) {
      el.value += ch;
      fire(el, "input");
      fireKey(el, "keydown", ch);
      fireKey(el, "keyup", ch);
      await delay(charDelay);
    }

    fire(el, "change");
    fireKey(el, "keydown", "Enter");
    fireKey(el, "keyup", "Enter");

    el.blur();
    fire(el, "blur");
  }

  async function ensureProcedimentosOpen() {
    const div2 = document.getElementById("collapse2");
    const toggle = document.querySelector("a[href='#collapse2']");
    if (toggle && div2 && !div2.classList.contains("in")) {
      toggle.click();
      await delay(1200);
    }

    const dv = document.getElementById("DvProcedimento")
      || await waitForElement("#DvProcedimento", { timeoutMs: 60000 });

    return dv || null;
  }

  function findBtnAdd() {
    return (
      document.getElementById("button2") ||
      document.querySelector("input#button2") ||
      document.querySelector("input[name='button2']") ||
      null
    );
  }

  async function handleBiometriaIfAny() {
    await delay(250);
    const modal = document.getElementById("modalDadosBiometria");
    if (modal && modal.classList.contains("in")) {
      log("⚠️ Modal de Biometria detectado — confirmando...");
      const chk = document.getElementById("validacaoCelularEmail");
      if (chk && !chk.checked) chk.click();
      const ok = document.getElementById("btnModalDadosBiometria");
      if (ok) ok.click();

      for (let t = 0; t < 80; t++) {
        if (!modal.classList.contains("in")) break;
        await delay(150);
      }
      log("✔️ Modal fechado, continuando");
    }
  }

  // Codes vindos do popup
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  // Se quiser fallback hardcoded, coloque aqui:
  const defaultCodes = [
    // "40301087", "40301150", ...
  ];

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia de códigos.");
      return { ok: false, msg: "Lista vazia" };
    }

    log("▶️ Rodando inserção…", { kit: payload.kitKey, total: list.length });

    await ensureProcedimentosOpen();
    await waitAguardeOff(45000);

    // Âncora
    const campo1 = await waitForElement("#item_medico_1, input[name='item_medico_1']", { timeoutMs: 90000 });
    if (!campo1) {
      err("❌ item_medico_1 não apareceu. Abra Procedimentos/Serviços.");
      return { ok: false, msg: "item_medico_1 não apareceu" };
    }

    // “Acorda” a grid
    await ghostType(campo1, "0", 10);
    await delay(250);
    campo1.value = "";
    fire(campo1, "input");
    fire(campo1, "change");

    const btnAdd0 = findBtnAdd();
    if (!btnAdd0) warn("⚠️ button2 não encontrado. Pode limitar a 1 linha.");

    for (let i = 0; i < list.length; i++) {
      const idx = i + 1;
      const code = list[i];

      await waitAguardeOff(45000);

      // Adiciona nova linha
      if (idx > 1) {
        const btnAdd = findBtnAdd();
        if (btnAdd) {
          btnAdd.click();
          await waitAguardeOff(45000);
          await delay(250);
        }
      }

      // Campo do código
      const campoSel = `#item_medico_${idx}, input[name='item_medico_${idx}']`;
      const campo = await waitForElement(campoSel, { timeoutMs: 60000 });

      if (!campo) {
        warn("⚠️ Campo não nasceu:", campoSel, "(pulando linha)", idx);
        continue;
      }

      await ghostType(campo, code, 18);

      // Quantidade
      const qtdSel = `#qtd_solicitada_${idx}, input[name='qtd_solicitada_${idx}']`;
      const qtd = await waitForElement(qtdSel, { timeoutMs: 20000 });
      if (qtd) {
        await ghostType(qtd, "1", 10);
      } else {
        warn("⚠️ Quantidade não encontrada:", qtdSel);
      }

      log("✅ Inserido", code, "linha", idx);

      // Modal biometria (se aparecer)
      await handleBiometriaIfAny();

      // tempo do backend (igual seu script: 6000ms)
      await delay(6000);
    }

    log("🎉 Todos os códigos foram inseridos!");
    return { ok: true, msg: "Finalizado" };
  }

  // UI — botão flutuante
  const btn = (B?.makeFloatingButton)
    ? B.makeFloatingButton({
        id: "hpRunnerFloatingBtn",
        text: "⚡ Inserir Procedimentos",
        onClick: async () => {
          const list = codesFromPopup.length ? codesFromPopup : defaultCodes;
          if (!list.length) return;
          await runInsercao(list);
        }
      })
    : (() => {
        const b = document.createElement("button");
        b.id = "hpRunnerFloatingBtn";
        b.type = "button";
        b.textContent = "⚡ Inserir Procedimentos";
        b.style.cssText = `
          position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
          padding: 12px 14px; border-radius: 14px; border: none;
          background: #0d6efd; color: #fff; font-weight: 800; cursor: pointer;
          box-shadow: 0 10px 24px rgba(0,0,0,.25); user-select: none;
        `;
        document.body.appendChild(b);
        return b;
      })();

  const hint = (B?.makeFloatingHint)
    ? B.makeFloatingHint({
        id: "hpRunnerFloatingHint",
        text: "Abra Procedimentos/Serviços e clique aqui.",
      })
    : (() => {
        const h = document.createElement("div");
        h.id = "hpRunnerFloatingHint";
        h.textContent = "Abra Procedimentos/Serviços e clique aqui.";
        h.style.cssText = `
          position: fixed; right: 16px; bottom: 62px; z-index: 2147483647;
          padding: 8px 10px; border-radius: 12px;
          background: rgba(0,0,0,.65); color: rgba(255,255,255,.92);
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

  log("✅ Runner carregado. Payload:", {
    planId: payload.planId,
    kitKey: payload.kitKey,
    codes: codesFromPopup.length
  });
})();
