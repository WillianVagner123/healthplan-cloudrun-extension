/*@maskara{
  "mustUrlIncludes": ["geap"],
  "detectAny": [
    "#item_medico_1",
    "input#item_medico_1",
    "input[name='item_medico_1']",
    "#button2",
    "input#button2",
    "input[name='button2']",
    "#DvProcedimento",
    "#collapse2"
  ],
  "actions": { "focus": "#item_medico_1" }
}*/

// GEAP.js — Runner do plano (serve para QUALQUER KIT) ✅
// - Recebe payload.codes do popup (kit)
// - Injeta botão flutuante
// - Só roda quando você clicar no botão
// - Espelhado no script “async” que funcionou (aguarde/overlay + waitForElement)

((payload = {}) => {
  // remove antigo
  const old = document.getElementById("hpRunnerFloatingBtn");
  if (old) old.remove();
  const oldHint = document.getElementById("hpRunnerFloatingHint");
  if (oldHint) oldHint.remove();

  /* ================= helpers ================= */

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log  = (...a) => console.log("GEAP:", ...a);
  const warn = (...a) => console.warn("GEAP:", ...a);
  const err  = (...a) => console.error("GEAP:", ...a);

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  // MutationObserver: espera o selector nascer sem polling agressivo
  function waitForElement(selector, { timeoutMs = 60000, root = document } = {}) {
    return new Promise((resolve) => {
      try {
        const found = root.querySelector(selector);
        if (found) return resolve(found);
      } catch {}

      const obs = new MutationObserver(() => {
        try {
          const el = root.querySelector(selector);
          if (el) {
            obs.disconnect();
            resolve(el);
          }
        } catch {}
      });

      const target = root.documentElement || root;
      obs.observe(target, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  // overlay “Aguarde” atrapalha foco e inputs
  async function waitAguardeOff(timeoutMs = 30000) {
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
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }
  function fireKey(el, type, key) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  // digitação “humana” que aciona máscara/validação do portal
  async function ghostType(el, text, charDelay = 18) {
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

    // reforço jQuery (quando o portal usa)
    if (window.jQuery) {
      try {
        const $el = window.jQuery(el);
        $el.val(String(text));
        $el.trigger("input");
        $el.trigger("keyup");
        $el.trigger("change");
        $el.trigger("blur");
      } catch {}
    }
  }

  async function handleBiometriaIfAny() {
    await delay(250);
    const modal = document.getElementById("modalDadosBiometria");
    if (modal && modal.classList.contains("in")) {
      log("⚠️ Modal biometria…");
      const chk = document.getElementById("validacaoCelularEmail");
      if (chk && !chk.checked) chk.click();
      const ok = document.getElementById("btnModalDadosBiometria");
      if (ok) ok.click();
      for (let t = 0; t < 80; t++) {
        if (!modal.classList.contains("in")) break;
        await delay(150);
      }
      log("✔️ Modal fechado.");
    }
  }

  async function ensureProcedimentosOpen() {
    // abre collapse2 se existir
    const div2 = document.getElementById("collapse2");
    const toggle = document.querySelector("a[href='#collapse2']");
    if (toggle && div2 && !div2.classList.contains("in")) {
      toggle.click();
      await delay(1200);
    }

    // garante container principal
    const dv =
      document.getElementById("DvProcedimento") ||
      (await waitForElement("#DvProcedimento", { timeoutMs: 60000 }));
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

  /* ================= progress hook (opcional) ================= */

  const onProgress =
    typeof payload.onProgress === "function" ? payload.onProgress : null;

  function report(p) {
    try { onProgress && onProgress(p); } catch {}
  }

  /* ================= codes (vem do kit) ================= */

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];
  const defaultCodes = []; // vazio por padrão

  /* ================= runner ================= */

  async function runInsercao(codigos) {
    const codes = Array.isArray(codigos) ? codigos : [];
    const total = codes.length;

    if (!total) {
      warn("⚠️ Lista de códigos vazia.");
      report({ idx: 0, total: 0, stage: "empty", ok: false, msg: "Lista vazia" });
      return { ok: false, msg: "Lista vazia" };
    }

    log("▶️ Iniciando…", { total });
    report({ idx: 0, total, stage: "start", ok: true, msg: "Iniciando…" });

    await ensureProcedimentosOpen();

    // espera portal ficar “livre”
    await waitAguardeOff(45000);

    log("Procurando item_medico_1…");
    const campo1 = await waitForElement("#item_medico_1", { timeoutMs: 90000 });
    if (!campo1) {
      const msg = "❌ item_medico_1 não apareceu. Abra Procedimentos/Serviços e tente de novo.";
      err(msg);
      report({ idx: 0, total, stage: "fail", ok: false, msg });
      return { ok: false, msg };
    }

    log("✅ Achou item_medico_1, iniciando…");
    report({ idx: 0, total, stage: "ready", ok: true, msg: "Área detectada" });

    for (let i = 0; i < codes.length; i++) {
      const idx = i + 1;
      const code = codes[i];

      report({ idx, total, code, stage: "line_start", ok: true, msg: `Linha ${idx}/${total}` });

      // overlay off antes de mexer
      await waitAguardeOff(45000);

      // adiciona linha a partir da 2ª
      if (idx > 1) {
        const btnAdd = findBtnAdd();
        if (btnAdd) {
          btnAdd.click();
          await delay(650);
        } else {
          warn("⚠️ button2 não encontrado. Vou tentar seguir sem adicionar linha.");
        }
      }

      // espera campo da linha idx nascer
      const campoSel = `#item_medico_${idx}`;
      let campo = await waitForElement(campoSel, { timeoutMs: 45000 });

      if (!campo) {
        warn("⚠️ Campo não apareceu:", campoSel, "tentando após aguarde…");
        await waitAguardeOff(45000);
        campo = await waitForElement(campoSel, { timeoutMs: 30000 });
      }

      if (!campo) {
        const msg = `⚠️ Pulei linha ${idx} (campo não nasceu)`;
        warn(msg);
        report({ idx, total, code, stage: "field_missing", ok: false, msg });
        continue;
      }

      await ghostType(campo, code, 18);

      const qtdSel = `#qtd_solicitada_${idx}`;
      const qtd = await waitForElement(qtdSel, { timeoutMs: 20000 });
      if (qtd) await ghostType(qtd, "1", 10);

      log(`✅ Inserido ${code} na linha ${idx}`);
      report({ idx, total, code, stage: "inserted", ok: true, msg: `Inserido ${code}` });

      await handleBiometriaIfAny();

      // validações do portal
      await delay(900);
    }

    log("🎉 Finalizado!");
    report({ idx: total, total, stage: "done", ok: true, msg: "Finalizado" });
    return { ok: true, msg: "Finalizado" };
  }

  /* ================= runner global (opcional) ================= */

  window.__HP_RUNNERS__ = window.__HP_RUNNERS__ || {};
  window.__HP_RUNNERS__.GEAP = {
    run: (codes, onProgressFn) => {
      if (typeof onProgressFn === "function") payload.onProgress = onProgressFn;
      return runInsercao(codes);
    }
  };

  /* ================= botão flutuante ================= */

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

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Abra Procedimentos/Serviços e clique aqui.";
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

  btn.onclick = async () => {
    const list = codesFromPopup.length ? codesFromPopup : defaultCodes;

    if (!list.length) {
      warn("⚠️ Nenhum código recebido do popup e defaultCodes vazio.");
      hint.textContent = "Nenhum código carregado. Rode pelo popup.";
      return;
    }

    hint.textContent = `Executando ${list.length} códigos…`;
    await runInsercao(list);
    hint.textContent = "Finalizado ✅";
  };

  document.body.appendChild(btn);
  document.body.appendChild(hint);

  log("✅ Botão flutuante injetado. Clique para rodar.");
});
