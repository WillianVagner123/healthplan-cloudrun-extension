/*@maskara{
  "mustUrlIncludes": ["geap"],
  "detectAny": [
    "#item_medico_1",
    "input#item_medico_1",
    "input[name='item_medico_1']",
    "#button2",
    "input#button2",
    "input[name='button2']"
  ],
  "actions": { "focus": "#item_medico_1" }
}*/

// GEAP.js — modelo botão flutuante (o que funcionou) ✅
// Agora: recebe (payload) do popup com { codes, onProgress } e roda.
// Também permite rodar manualmente com uma lista default (vazia).

((payload = {}) => {
  // remove antigo
  const old = document.getElementById("hpRunnerFloatingBtn");
  if (old) old.remove();
  const oldHint = document.getElementById("hpRunnerFloatingHint");
  if (oldHint) oldHint.remove();

  // ===== helpers =====
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  }

  async function waitFor(getter, timeoutMs = 30000, stepMs = 200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const v = getter();
        if (v) return v;
      } catch {}
      await delay(stepMs);
    }
    return null;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function fireKey(el, type, key = "a") {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  async function ghostType(el, text, perCharMs = 25) {
    el.focus();
    el.value = "";
    fire(el, "input"); fire(el, "change");

    const s = String(text);
    for (const ch of s) {
      el.value += ch;
      fire(el, "input");
      fireKey(el, "keydown", ch);
      fireKey(el, "keyup", ch);
      await delay(perCharMs);
    }

    fire(el, "change");
    el.blur();
    fire(el, "blur");

    if (window.jQuery) {
      const $el = window.jQuery(el);
      $el.val(s);
      $el.trigger("input");
      $el.trigger("keyup");
      $el.trigger("change");
      $el.trigger("blur");
    }
  }

  function findPrimeiroCampo() {
    return (
      document.getElementById("item_medico_1") ||
      document.querySelector("input#item_medico_1") ||
      document.querySelector("input[name='item_medico_1']") ||
      document.getElementsByName("item_medico_1")[0] ||
      null
    );
  }

  function findBtnAdd() {
    return (
      document.getElementById("button2") ||
      document.querySelector("input#button2") ||
      document.querySelector("input[name='button2']") ||
      document.querySelector("input.btn.btn-primary#button2") ||
      null
    );
  }

  async function clickAdicionarLinha() {
    const btn = findBtnAdd();
    if (btn) {
      btn.click();
      await delay(550);
      return true;
    }

    if (typeof window.IncluirProcedimento === "function") {
      window.IncluirProcedimento("S");
      await delay(550);
      return true;
    }

    console.warn("❌ Não achei button2 (Adicionar Procedimento/Serviço).");
    return false;
  }

  async function handleBiometriaIfAny() {
    await delay(250);
    const modal = document.getElementById("modalDadosBiometria");
    if (modal && modal.classList.contains("in")) {
      console.log("⚠️ Modal biometria detectado…");
      const chk = document.getElementById("validacaoCelularEmail");
      if (chk && !chk.checked) chk.click();
      const ok = document.getElementById("btnModalDadosBiometria");
      if (ok) ok.click();

      for (let t = 0; t < 50; t++) {
        if (!modal.classList.contains("in")) break;
        await delay(200);
      }
      console.log("✔️ Modal fechado");
    }
  }

  // ===== progress hook (opcional) =====
  // onProgress({ idx, total, code, stage, ok, msg })
  const onProgress =
    typeof payload.onProgress === "function" ? payload.onProgress : null;

  function report(p) {
    try { onProgress && onProgress(p); } catch {}
  }

  // ===== lista de códigos vem do popup =====
  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  // Se você clicar no botão sem popup, ele tenta usar isso (vazio por padrão)
  const defaultCodes = [];

  async function runInsercao(codigos) {
    const codes = Array.isArray(codigos) ? codigos : [];
    const total = codes.length;

    report({ idx: 0, total, stage: "start", ok: true, msg: "Iniciando…" });

    console.log("▶️ Procurando item_medico_1…");

    const primeira = await waitFor(() => {
      const el = findPrimeiroCampo();
      return (el && isVisible(el)) ? el : null;
    }, 30000, 200);

    if (!primeira) {
      const msg = "❌ NÃO ACHOU item_medico_1 em 30s. Abra Procedimentos/Serviços e tente de novo.";
      console.error(msg);
      report({ idx: 0, total, stage: "fail", ok: false, msg });
      return { ok: false, msg };
    }

    console.log("✅ Achou item_medico_1, iniciando…");
    report({ idx: 0, total, stage: "ready", ok: true, msg: "Área detectada. Inserindo…" });

    for (let i = 0; i < codes.length; i++) {
      const idx = i + 1;
      const code = codes[i];

      report({ idx, total, code, stage: "line_start", ok: true, msg: `Linha ${idx}/${total}` });

      if (idx > 1) {
        const okAdd = await clickAdicionarLinha();
        if (!okAdd) {
          const msg = `⚠️ Sem botão de adicionar — parando na linha ${idx}`;
          console.warn(msg);
          report({ idx, total, code, stage: "add_fail", ok: false, msg });
          break;
        }
      }

      const campo = await waitFor(() => {
        return (
          document.getElementById(`item_medico_${idx}`) ||
          document.querySelector(`input#item_medico_${idx}`) ||
          document.querySelector(`input[name='item_medico_${idx}']`) ||
          document.getElementsByName(`item_medico_${idx}`)[0] ||
          null
        );
      }, 15000, 200);

      if (!campo) {
        const msg = `⚠️ Campo não apareceu: item_medico_${idx}`;
        console.warn(msg);
        report({ idx, total, code, stage: "field_missing", ok: false, msg });
        continue;
      }

      await ghostType(campo, code, 25);

      const qtd = await waitFor(() => {
        return (
          document.getElementById(`qtd_solicitada_${idx}`) ||
          document.querySelector(`input[name='qtd_solicitada_${idx}']`) ||
          document.getElementsByName(`qtd_solicitada_${idx}`)[0] ||
          null
        );
      }, 6000, 200);

      if (qtd) {
        await ghostType(qtd, "1", 15);
      }

      console.log(`✅ Inserido ${code} na linha ${idx}`);
      report({ idx, total, code, stage: "inserted", ok: true, msg: `✅ Inserido ${code} (${idx}/${total})` });

      await handleBiometriaIfAny();
      await delay(800);
    }

    console.log("🎉 Finalizado!");
    report({ idx: total, total, stage: "done", ok: true, msg: "🎉 Finalizado!" });
    return { ok: true, msg: "Finalizado" };
  }

  // ===== expõe um runner global (para o popup chamar se quiser) =====
  // O popup pode chamar: window.__HP_RUNNERS__.GEAP.run(codes, onProgress)
  window.__HP_RUNNERS__ = window.__HP_RUNNERS__ || {};
  window.__HP_RUNNERS__.GEAP = {
    run: (codes, onProgressFn) => {
      if (typeof onProgressFn === "function") payload.onProgress = onProgressFn;
      return runInsercao(codes);
    }
  };

  // ===== botão flutuante =====
  const btn = document.createElement("button");
  btn.id = "hpRunnerFloatingBtn";
  btn.type = "button";
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText = `
    position: fixed;
    top: 110px;
    right: 18px;
    z-index: 2147483647;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.18);
    background: rgba(14,165,233,.95);
    color: #fff;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    user-select: none;
  `;

  const hint = document.createElement("div");
  hint.id = "hpRunnerFloatingHint";
  hint.textContent = "Abra Procedimentos/Serviços e clique aqui.";
  hint.style.cssText = `
    position: fixed;
    top: 160px;
    right: 18px;
    z-index: 2147483647;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(0,0,0,.65);
    color: rgba(255,255,255,.9);
    font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
  `;

  btn.onclick = async () => {
    const list = codesFromPopup.length ? codesFromPopup : defaultCodes;

    if (!list.length) {
      console.warn("⚠️ Nenhum código recebido do popup e defaultCodes vazio.");
      hint.textContent = "Nenhum código carregado. Rode pelo popup.";
      return;
    }

    hint.textContent = "Executando…";
    await runInsercao(list);
    hint.textContent = "Finalizado ✅";
  };

  document.body.appendChild(btn);
  document.body.appendChild(hint);

  console.log("✅ Botão flutuante injetado. Clique para rodar.");
});
