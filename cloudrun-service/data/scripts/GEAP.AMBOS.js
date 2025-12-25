(async () => {
  try {
    const codigos = [
      "40301087","40301150","40301222","40301273","40301281","40301354","40301362","40301419","40301427","40301508",
      "40301567","40301648","40301729","40301842","40301990","40302113","40302199","40302377","40302520","40302580",
      "40302601","40302610","40302733","40302750","40302830","40304361","40304507","40305465","40305627","40312151",
      "40313310","40316050","40316076","40316106","40316157","40316165","40316203","40316211","40316220","40316246",
      "40316254","40316262","40316270","40316289","40316300","40316335","40316360","40316408","40316416","40316440",
      "40316483","40316505","40316513","40316530","40316572"
    ];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    }

    async function waitFor(getter, timeoutMs = 30000, stepMs = 200) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const v = getter();
        if (v) return v;
        await delay(stepMs);
      }
      return null;
    }

    function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
    function fireKey(el, type, key="0") { el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key })); }

    // Preenche de um jeito que aciona onchange/handlers do portal
    async function setField(el, val) {
      if (!el) return false;
      el.focus();

      // limpar
      el.value = "";
      fire(el, "input"); fireKey(el, "keyup"); fire(el, "change");

      // setar
      el.value = String(val);
      fire(el, "input");
      fireKey(el, "keyup", "0");

      // MUITO importante pro seu HTML: onchange chama CarregaGridProcedimento(1)
      fire(el, "change");

      // blur também ajuda em alguns portais
      el.blur();
      fire(el, "blur");

      // se tiver jQuery no portal, reforça triggers
      if (window.jQuery) {
        const $el = window.jQuery(el);
        $el.val(String(val));
        $el.trigger("input");
        $el.trigger("keyup");
        $el.trigger("change");
        $el.trigger("blur");
      }

      return true;
    }

    // Modal biometria (se aparecer)
    async function handleBiometriaIfAny() {
      await delay(400);
      const modal = document.getElementById("modalDadosBiometria");
      if (modal && modal.classList.contains("in")) {
        console.log("⚠️ Modal de Biometria detectado — confirmando...");
        const chk = document.getElementById("validacaoCelularEmail");
        if (chk && !chk.checked) chk.click();
        const ok = document.getElementById("btnModalDadosBiometria");
        if (ok) ok.click();

        // aguarda fechar
        for (let t = 0; t < 40; t++) {
          if (!modal.classList.contains("in")) break;
          await delay(200);
        }
        console.log("✔️ Modal fechado, continuando");
      }
    }

    // 1) Espera o container existir e estar visível
    const dv = await waitFor(() => {
      const el = document.getElementById("DvProcedimento");
      return (el && isVisible(el)) ? el : null;
    }, 45000, 250);

    if (!dv) {
      console.error("❌ DvProcedimento não ficou visível. Abra a tela de Procedimentos antes de rodar.");
      return;
    }

    // 2) Espera o primeiro campo
    const primeira = await waitFor(() => {
      const el = document.getElementById("item_medico_1") || document.getElementsByName("item_medico_1")[0];
      return (el && isVisible(el)) ? el : null;
    }, 30000, 200);

    if (!primeira) {
      console.error("❌ Timeout aguardando item_medico_1 (mesmo com DvProcedimento visível)");
      return;
    }

    // 3) Checa botão adicionar
    const btnAdd = await waitFor(() => {
      const el = document.getElementById("button2") || document.querySelector("input[name='button2']");
      return el || null;
    }, 8000, 200);

    if (!btnAdd) {
      console.warn("⚠️ Botão Adicionar (button2) não encontrado — vou tentar só a primeira linha.");
    }

    console.log(`▶️ Iniciando inserção: ${codigos.length} códigos`);

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      // adiciona linha se idx > 1
      if (idx > 1 && btnAdd) {
        btnAdd.click();
        await delay(700);
      }

      // espera campo da linha idx
      const campo = await waitFor(() => {
        const el = document.getElementById(`item_medico_${idx}`) || document.getElementsByName(`item_medico_${idx}`)[0];
        return el || null;
      }, 15000, 200);

      if (!campo) {
        console.warn("⚠️ Campo não apareceu:", `item_medico_${idx}`);
        continue;
      }

      await setField(campo, code);

      // quantidade
      const qtd = await waitFor(() => {
        const el = document.getElementById(`qtd_solicitada_${idx}`) || document.getElementsByName(`qtd_solicitada_${idx}`)[0];
        return el || null;
      }, 8000, 200);

      if (qtd) {
        await setField(qtd, "1");
      }

      console.log(`✅ Inserido ${code} na linha ${idx}`);

      await handleBiometriaIfAny();

      // tempo pro portal carregar descrição/validar (CarregaGridProcedimento/ChecaCodProcedimento)
      await delay(1200);
    }

    console.log("🎉 Finalizado!");
  } catch (e) {
    console.error("❌ Erro fatal:", e);
  }
})();
