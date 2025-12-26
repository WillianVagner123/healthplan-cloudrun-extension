(() => {
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

    // MUITO importante: aciona onchange do portal
    fire(el, "change");
    el.blur();
    fire(el, "blur");

    // reforço se tiver jQuery no portal
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
    // NÃO cachear. Procurar sempre.
    return (
      document.getElementById("button2") ||
      document.querySelector("input#button2") ||
      document.querySelector("input[name='button2']") ||
      document.querySelector("input.btn.btn-primary#button2") ||
      null
    );
  }

  async function clickAdicionarLinha() {
    // 1) tenta o botão
    const btn = findBtnAdd();
    if (btn) {
      btn.click();
      await delay(550);
      return true;
    }

    // 2) fallback: chama a função do portal (se existir)
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

  async function runInsercao() {
    const codigos = [
      "40301087","40301150","40301222","40301273","40301281","40301354","40301362","40301419","40301427","40301508",
      "40301567","40301648","40301729","40301842","40301990","40302113","40302199","40302377","40302520","40302580",
      "40302601","40302610","40302733","40302750","40302830","40304361","40304507","40305465","40305627","40312151",
      "40313310","40316050","40316076","40316106","40316157","40316165","40316203","40316211","40316220","40316246",
      "40316254","40316262","40316270","40316289","40316300","40316335","40316360","40316408","40316416","40316440",
      "40316483","40316505","40316513","40316530","40316572"
    ];

    console.log("▶️ Procurando item_medico_1…");

    // espera o primeiro campo aparecer (do jeito mais direto possível)
    const primeira = await waitFor(() => {
      const el = findPrimeiroCampo();
      return (el && isVisible(el)) ? el : null;
    }, 30000, 200);

    if (!primeira) {
      console.error("❌ NÃO ACHOU item_medico_1 em 30s. Abra a área Procedimentos/Serviços e tente de novo.");
      return;
    }

    console.log("✅ Achou item_medico_1, iniciando…");

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      // se não é a primeira linha, cria nova linha (busca o botão toda vez)
      if (idx > 1) {
        const ok = await clickAdicionarLinha();
        if (!ok) {
          console.warn("⚠️ Sem botão de adicionar — parando na linha", idx);
          break;
        }
      }

      // pega o campo da linha atual
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
        console.warn("⚠️ Campo não apareceu:", `item_medico_${idx}`);
        continue;
      }

      await ghostType(campo, code, 25);

      // quantidade
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

      await handleBiometriaIfAny();

      // deixa o portal processar (CarregaGridProcedimento / validações)
      await delay(800);
    }

    console.log("🎉 Finalizado!");
  }

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

  btn.onclick = () => runInsercao();

  document.body.appendChild(btn);
  document.body.appendChild(hint);

  console.log("✅ Botão flutuante injetado. Clique para rodar.");
})();
