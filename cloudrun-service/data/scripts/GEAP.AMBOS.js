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

    async function waitFor(getter, timeoutMs = 45000, stepMs = 200) {
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

    async function setField(el, val) {
      if (!el) return false;
      el.focus();

      // limpar + eventos
      el.value = "";
      fire(el, "input"); fireKey(el, "keyup"); fire(el, "change");

      // setar + eventos
      el.value = String(val);
      fire(el, "input");
      fireKey(el, "keyup", "0");
      fire(el, "change");

      // blur ajuda a disparar onblur/onchange do portal
      el.blur();
      fire(el, "blur");

      // reforço com jQuery (se existir)
      if (window.jQuery) {
        const $el = window.jQuery(el);
        $el.val(String(val)).trigger("input").trigger("keyup").trigger("change").trigger("blur");
      }

      return true;
    }

    async function handleBiometriaIfAny() {
      await delay(400);
      const modal = document.getElementById("modalDadosBiometria");
      if (modal && modal.classList.contains("in")) {
        console.log("⚠️ Modal de Biometria detectado — confirmando...");
        const chk = document.getElementById("validacaoCelularEmail");
        if (chk && !chk.checked) chk.click();
        const ok = document.getElementById("btnModalDadosBiometria");
        if (ok) ok.click();

        for (let t = 0; t < 40; t++) {
          if (!modal.classList.contains("in")) break;
          await delay(200);
        }
        console.log("✔️ Modal fechado, continuando");
      }
    }

    // ✅ tenta “abrir” a seção de Procedimentos (sem travar)
    try {
      const cand = Array.from(document.querySelectorAll("button,a,div,span"))
        .find(el => (el.textContent || "").trim().toLowerCase().includes("procedimento"));
      if (cand && cand.click) cand.click();
    } catch {}
    await delay(600);

    // ✅ Busca robusta do PRIMEIRO campo
    function findPrimeiroCampo() {
      // 1) id
      let el = document.getElementById("item_medico_1");
      if (el) return el;

      // 2) name
      el = document.getElementsByName("item_medico_1")[0];
      if (el) return el;

      // 3) querySelector id/name
      el = document.querySelector("input#item_medico_1, input[name='item_medico_1']");
      if (el) return el;

      // 4) dentro da tabela de procedimentos (se existir)
      const tabela = document.querySelector("#TbProcedimento") ||
                     document.querySelector("table[id*='Procedimento']") ||
                     document.querySelector("table");
      if (tabela) {
        const inputs = tabela.querySelectorAll("input[type='text'], input:not([type])");
        if (inputs.length) return inputs[0];
      }

      // 5) fallback: primeiro input de texto visível
      const visiveis = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"))
        .filter(i => i.offsetParent !== null);
      if (visiveis.length) return visiveis[0];

      return null;
    }

    const primeira = await waitFor(() => findPrimeiroCampo(), 45000, 200);
    if (!primeira) {
      console.error("❌ Campo de código não encontrado. Abra a seção de Procedimentos/Serviços e tente novamente.");
      return;
    }

    console.log("✅ Campo detectado:", {
      id: primeira.id || "",
      name: primeira.name || "",
      placeholder: primeira.placeholder || ""
    });

    // ✅ botão adicionar
    const btnAdd = await waitFor(() =>
      document.getElementById("button2") ||
      document.querySelector("input[name='button2']") ||
      null
    , 20000, 200);

    if (!btnAdd) {
      console.warn("⚠️ Botão Adicionar (button2) não encontrado — vou tentar só a linha 1.");
    }

    console.log(`▶️ Iniciando inserção: ${codigos.length} códigos`);

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      if (idx > 1 && btnAdd) {
        btnAdd.click();
        await delay(700);
      }

      // campo do código (linha idx)
      const campo = await waitFor(() =>
        document.getElementById(`item_medico_${idx}`) ||
        document.getElementsByName(`item_medico_${idx}`)[0] ||
        null
      , 25000, 200);

      if (!campo) {
        console.warn("⚠️ Campo não apareceu:", `item_medico_${idx}`);
        continue;
      }

      await setField(campo, code);

      // quantidade (linha idx)
      const qtd = await waitFor(() =>
        document.getElementById(`qtd_solicitada_${idx}`) ||
        document.getElementsByName(`qtd_solicitada_${idx}`)[0] ||
        null
      , 12000, 200);

      if (qtd) {
        await setField(qtd, "1");
      }

      console.log(`✅ Inserido ${code} na linha ${idx}`);

      await handleBiometriaIfAny();

      // espera descrição preencher (se existir)
      const desc = document.getElementById(`nome_item_proc_${idx}`);
      if (desc) {
        await waitFor(() => ((desc.value || "").trim() ? true : null), 15000, 200);
      }

      // tempo extra pro portal validar
      await delay(600);
    }

    console.log("🎉 Finalizado!");
  } catch (e) {
    console.error("❌ Erro fatal:", e);
  }
})();
