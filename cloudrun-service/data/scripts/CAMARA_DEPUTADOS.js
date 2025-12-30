/*@maskara{
  "mustUrlIncludes": ["camara", "camara.leg.br", "deputados"],
  "detectAny": [
    "input[name='EVENTO']",
    "a[title*='Salvar / Novo']",
    "a[title*='Salvar']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

/* CAMARA_DEPUTADOS.js — Runner do plano (IIFE) ✅
   - MESMA ESTRUTURA do GEAP (sem mexer nos IDs globais hpRunnerFloatingBtn/hpRunnerFloatingHint)
   - Usa window.__HP_PAYLOAD__ (setado pelo popup) com: { codes, kitKey, planId, detect }
   - Injeta botão flutuante e roda só ao clicar
*/
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  // base helpers (se existir). senão, fallback minimalista.
  const B = window.__HP_BASE__ || null;

  const delay = B?.delay || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // remove antigo (mantém os mesmos IDs do GEAP)
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

  // Se tiver overlay próprio na Câmara, você pode plugar aqui depois.
  // Mantive neutro pra não "inventar" id de overlay.
  async function waitBusyOff(_timeoutMs = 45000) {
    return true;
  }

  function fire(el, type) {
    if (B?.fire) return B.fire(el, type);
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function fireKey(el, type, key) {
    if (B?.fireKey) return B.fireKey(el, type, key);
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  async function ghostType(el, text, charDelay = 40) {
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
    el.blur();
    fire(el, "blur");
  }

  function findEventoField() {
    return document.querySelector("input[name='EVENTO']") || document.getElementsByName("EVENTO")[0] || null;
  }

  function findBtnSalvarNovo() {
    // mantém exatamente como no baseline: title contém "Salvar / Novo"
    return document.querySelector("a[title*='Salvar / Novo']") || null;
  }

  // codes do kit (popup)
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  // fallback local (se você quiser deixar um “default” no runner)
  const defaultCodes = [
    // "40301087", "40301150" ...
  ];

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      warn("Lista vazia de códigos.");
      return { ok: false, msg: "Lista vazia" };
    }

    log("▶️ Rodando inserção…", { kit: payload.kitKey, total: list.length });

    const evento = await waitForElement("input[name='EVENTO']", { timeoutMs: 90000 });
    if (!evento || !isVisible(evento)) {
      err("❌ Campo EVENTO não encontrado/visível.");
      return { ok: false, msg: "Campo EVENTO não encontrado" };
    }

    const btnSalvarNovo = await waitForElement("a[title*='Salvar / Novo']", { timeoutMs: 45000 });
    if (!btnSalvarNovo) {
      err("❌ Botão 'Salvar / Novo' não encontrado.");
      return { ok: false, msg: "Botão Salvar / Novo não encontrado" };
    }

    for (let i = 0; i < list.length; i++) {
      const code = list[i];

      await waitBusyOff(45000);

      // digita o código no EVENTO
      await ghostType(evento, code, 40);

      // clica salvar/novo
      btnSalvarNovo.click();
      log("✔ CAMARA inserido:", code);

      // espera carregar a próxima tela/limpar (baseline: 1800ms)
      await delay(1800);

      // re-encontra o campo e o botão (evita referência velha após navegação parcial)
      const evento2 = findEventoField() || await waitForElement("input[name='EVENTO']", { timeoutMs: 60000 });
      const btn2 = findBtnSalvarNovo() || await waitForElement("a[title*='Salvar / Novo']", { timeoutMs: 60000 });

      if (!evento2 || !btn2) {
        warn("⚠️ Após salvar, não reencontrei EVENTO ou Salvar/Novo. Parando por segurança.");
        break;
      }
    }

    log("🎉 CAMARA finalizado!");
    return { ok: true, msg: "Finalizado" };
  }

  // botão flutuante (MESMOS IDs do GEAP)
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
        text: "Abra a tela do lançamento e clique aqui.",
      })
    : (() => {
        const h = document.createElement("div");
        h.id = "hpRunnerFloatingHint";
        h.textContent = "Abra a tela do lançamento e clique aqui.";
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
