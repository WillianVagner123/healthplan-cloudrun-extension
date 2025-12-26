// GAMASAUDE • Inserção em lote de procedimentos
// Fonte: script "gambiarra" que funcionou no portal.
// Dica: se o portal pausar no 'debugger', desative "Pause on debugger statements" no DevTools (ou pressione F8).
void setTimeout(async () => {
  try {
    const codigos = ["40301087", "40301150", "40301222", "40301273", "40301281", "40301354", "40301362", "40301419", "40301427", "40301508", "40301567", "40301648", "40301729", "40301842", "40301990", "40302113", "40302199", "40302377", "40302520", "40302580", "40302601", "40302610", "40302733", "40302750", "40302830", "40304361", "40304507", "40305465", "40305627", "40312151", "40313310", "40316050", "40316076", "40316106", "40316157", "40316165", "40316203", "40316211", "40316220", "40316246", "40316254", "40316262", "40316270", "40316289", "40316300", "40316335", "40316360", "40316408", "40316416", "40316440", "40316483", "40316505", "40316513", "40316530", "40316572"];
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // Abrir seção de procedimentos (se estiver recolhida)
    const toggle = document.querySelector("a[href='#collapse2']");
    const div2   = document.getElementById("collapse2");
    if (toggle && div2 && !div2.classList.contains("in")) {
      toggle.click();
      await delay(2000);
    }

    // Aguarda primeiro campo
    let primeira = null;
    for (let tent = 0; tent < 100; tent++) {
      primeira = document.getElementsByName("item_medico_1")[0] || null;
      if (primeira) break;
      await delay(150);
    }
    if (!primeira) {
      console.error("❌ Timeout aguardando item_medico_1");
      return;
    }

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      // Adiciona nova linha
      if (idx > 1) {
        const btn = document.getElementById("button2");
        if (btn) {
          btn.click();
          await delay(600);
        }
      }

      // Campo do código
      const campo = document.getElementsByName(`item_medico_${idx}`)[0];
      if (campo) {
        campo.value = code;
        campo.dispatchEvent(new Event("input", { bubbles: true }));
        // manter "change" porque o portal usa isso para carregar descrição/validações
        campo.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        console.warn("⚠️ Campo não encontrado:", `item_medico_${idx}`);
      }

      // Quantidade
      const qtd = document.getElementsByName(`qtd_solicitada_${idx}`)[0];
      if (qtd) {
        qtd.value = "1";
        qtd.dispatchEvent(new Event("input", { bubbles: true }));
        qtd.dispatchEvent(new Event("change", { bubbles: true }));
      }

      console.log(`✅ Inserido ${code} no campo ${idx}`);

      // Modal biometria (se aparecer)
      await delay(1000);
      const modal = document.getElementById("modalDadosBiometria");
      if (modal && modal.classList.contains("in")) {
        console.log("⚠️ Modal de Biometria detectado — confirmando...");
        const chk = document.getElementById("validacaoCelularEmail");
        if (chk && !chk.checked) chk.click();
        const ok = document.getElementById("btnModalDadosBiometria");
        if (ok) ok.click();

        // aguarda fechar
        for (let t = 0; t < 30; t++) {
          if (!modal.classList.contains("in")) break;
          await delay(200);
        }
        console.log("✔️ Modal fechado, continuando");
      }

      // tempo do backend carregar descrição/validações
      await delay(6000);
    }

    console.log("🎉 Todos os códigos foram inseridos!");
  } catch (e) {
    console.error("❌ Erro fatal no script:", e);
  }
}, 0);
