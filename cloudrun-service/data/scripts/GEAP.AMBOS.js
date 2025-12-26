(async () => {
  try {
    const codigos = [
      "40301087","40301150","40301222","40301273","40301281","40301354","40301362",
      "40301419","40301427","40301508","40301567","40301648","40301729","40301842",
      "40301990","40302113","40302199","40302377","40302520","40302580","40302601",
      "40302610","40302733","40302750","40302830","40304361","40304507","40305465",
      "40305627","40312151","40313310","40316050","40316076","40316106","40316157",
      "40316165","40316203","40316211","40316220","40316246","40316254","40316262",
      "40316270","40316289","40316300","40316335","40316360","40316408","40316416",
      "40316440","40316483","40316505","40316513","40316530","40316572"
    ];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    async function waitFor(getter, timeoutMs = 30000, stepMs = 200) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const v = getter();
        if (v) return v;
        await delay(stepMs);
      }
      return null;
    }

    // ✅ O SELETOR QUE VOCÊ TESTOU E FUNCIONA
    function getItemField(idx) {
      return document.querySelector(`input[name="item_medico_${idx}"]`)
          || document.getElementById(`item_medico_${idx}`)
          || document.querySelector(`input#item_medico_${idx}`);
    }

    function getQtdField(idx) {
      return document.querySelector(`input[name="qtd_solicitada_${idx}"]`)
          || document.getElementById(`qtd_solicitada_${idx}`);
    }

    function getAddBtn() {
      return document.getElementById("button2") || document.querySelector('input[name="button2"]');
    }

    function fire(el, type) {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }

    function key(el, type, key, code = key) {
      el.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key,
        code,
        keyCode: key === "Enter" ? 13 : undefined,
        which:  key === "Enter" ? 13 : undefined
      }));
    }

    // #2 Ghost type: ativa máscaras/validadores
    async function ghostType(el) {
      el.scrollIntoView?.({ block: "center" });
      el.click?.();
      el.focus();

      key(el, "keydown", "0");
      el.value += "0";
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: "0", inputType: "insertText" }));
      key(el, "keyup", "0");

      await delay(60);

      key(el, "keydown", "Backspace");
      el.value = el.value.slice(0, -1);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: null, inputType: "deleteContentBackward" }));
      key(el, "keyup", "Backspace");

      fire(el, "change");
      await delay(120);
    }

    // Digitação humana + Enter/Tab para disparar CarregaGridProcedimento
    async function humanFillCodigo(el, codigo) {
      el.focus();

      // limpa do jeito que o portal sente
      el.value = "";
      fire(el, "input");
      fire(el, "change");
      await delay(80);

      for (const ch of String(codigo)) {
        key(el, "keydown", ch);
        key(el, "keypress", ch);

        el.value += ch;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));

        key(el, "keyup", ch);
        await delay(25);
      }

      // força o onchange do HTML (CarregaGridProcedimento)
      fire(el, "change");

      // muita gente depende de Enter/Tab
      key(el, "keydown", "Enter", "Enter");
      key(el, "keyup", "Enter", "Enter");

      el.blur();
      fire(el, "blur");

      // reforço jQuery (se existir)
      if (window.jQuery) {
        window.jQuery(el).val(String(codigo)).trigger("input").trigger("change").trigger("blur");
      }
    }

    async function humanFillQtd(el, qtd) {
      el.focus();
      el.value = "";
      fire(el, "input");
      await delay(50);

      el.value = String(qtd);
      fire(el, "input");
      fire(el, "change");

      key(el, "keydown", "Enter", "Enter");
      key(el, "keyup", "Enter", "Enter");

      el.blur();
      fire(el, "blur");

      if (window.jQuery) {
        window.jQuery(el).val(String(qtd)).trigger("input").trigger("change").trigger("blur");
      }
    }

    // Modal biometria (se aparecer)
    async function handleBiometriaIfAny() {
      await delay(300);
      const modal = document.getElementById("modalDadosBiometria");
      if (modal && modal.classList.contains("in")) {
        console.log("⚠️ Modal biometria — confirmando...");
        const chk = document.getElementById("validacaoCelularEmail");
        if (chk && !chk.checked) chk.click();
        const ok = document.getElementById("btnModalDadosBiometria");
        if (ok) ok.click();

        for (let t = 0; t < 40; t++) {
          if (!modal.classList.contains("in")) break;
          await delay(200);
        }
        console.log("✔️ Modal fechado");
      }
    }

    // ===================== COMEÇA SEMPRE PELO item_medico_1 =====================

    // (1) garante que a primeira linha exista: tenta achar item_medico_1
    let primeira = getItemField(1);

    // se não existir, clica no button2 para criar
    if (!primeira) {
      const btnAdd = getAddBtn();
      if (!btnAdd) {
        console.error("❌ Não achei button2 (Adicionar Procedimento/Serviço).");
        return;
      }
      btnAdd.click();
      await delay(800);
      primeira = getItemField(1);
    }

    // agora espera de verdade
    primeira = await waitFor(() => getItemField(1), 30000, 200);

    if (!primeira) {
      console.error("❌ item_medico_1 não apareceu. Abra a seção Procedimentos/Serviços e rode novamente.");
      return;
    }

    console.log("✅ item_medico_1 encontrado. Iniciando...");
    await ghostType(primeira);

    const btnAdd = getAddBtn();

    // loop
    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const codigo = codigos[i];

      // cria nova linha (idx>1)
      if (idx > 1 && btnAdd) {
        btnAdd.click();
        await delay(700);
      }

      const campo = await waitFor(() => getItemField(idx), 20000, 200);
      if (!campo) {
        console.warn("⚠️ Campo não apareceu:", `item_medico_${idx}`);
        continue;
      }

      await ghostType(campo);
      await humanFillCodigo(campo, codigo);

      // quantidade
      const qtd = await waitFor(() => getQtdField(idx), 8000, 200);
      if (qtd) await humanFillQtd(qtd, "1");

      console.log(`✅ Inserido ${codigo} na linha ${idx}`);

      await handleBiometriaIfAny();

      // tempo para carregar descrição/validar
      await delay(1200);
    }

    console.log("🎉 Finalizado!");
  } catch (e) {
    console.error("❌ Erro fatal:", e);
  }
})();
