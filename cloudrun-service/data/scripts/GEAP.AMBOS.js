// GEAP • Inserção em lote de procedimentos (compatível com jquery.mask/validações)
// Dica: se o portal pausar no 'debugger', desative "Pause on debugger statements" no DevTools (ou pressione F8).

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

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    function fire(el, type) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
    function fireKey(el, type, key = "0") {
      el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
    }

    async function typeLikeHuman(el, text, stepMs = 35) {
      el.focus();
      el.value = "";
      fire(el, "input"); fireKey(el, "keyup"); fire(el, "change");
      for (const ch of String(text)) {
        el.value += ch;
        fire(el, "input");
        fireKey(el, "keyup", ch);
        await delay(stepMs);
      }
      fire(el, "change");
    }

    async function setValueMasked(el, value) {
      if (!el) return false;

      const v = String(value);

      // 1) tentativa rápida (value + events)
      el.focus();
      el.value = "";
      fire(el, "input"); fireKey(el, "keyup"); fire(el, "change");
      el.value = v;
      fire(el, "input"); fireKey(el, "keyup"); fire(el, "change");

      // fallback com jQuery (se existir no portal)
      if (window.jQuery) {
        const $el = window.jQuery(el);
        $el.val(v);
        $el.trigger("input");
        $el.trigger("keyup");
        $el.trigger("change");
      }

      await delay(80);

      // 2) se o portal/mask apagou ou alterou, simula digitação
      const finalVal = (el.value || "").replace(/\D/g, "");
      const wantVal = v.replace(/\D/g, "");
      if (!finalVal || finalVal !== wantVal) {
        await typeLikeHuman(el, v, 25);
        await delay(80);
      }

      return true;
    }

    async function waitFor(getter, timeoutMs = 15000, stepMs = 200) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const v = getter();
        if (v) return v;
        await delay(stepMs);
      }
      return null;
    }

    async function maybeHandleBiometria() {
      await delay(500);
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

    // ✅ 1) Abrir seção de procedimentos (se estiver recolhida)
    const toggle = document.querySelector("a[href='#collapse2']");
    const div2 = document.getElementById("collapse2");
    if (toggle && div2 && !div2.classList.contains("in")) {
      toggle.click();
      await delay(1800);
    }

    // ✅ 2) Aguarda primeiro campo existir
    const primeira = await waitFor(
      () => document.getElementsByName("item_medico_1")[0] || null,
      20000,
      150
    );

    if (!primeira) {
      console.error("❌ Timeout aguardando item_medico_1");
      return;
    }

    console.log(`▶️ Iniciando inserção de ${codigos.length} códigos...`);

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      // ✅ 3) Adiciona nova linha
      if (idx > 1) {
        const btn = document.getElementById("button2");
        if (btn) {
          btn.click();
          await delay(600);
        } else {
          console.warn("⚠️ Botão adicionar linha (button2) não encontrado");
        }
      }

      // ✅ 4) Campo do código
      const campo = await waitFor(
        () => document.getElementsByName(`item_medico_${idx}`)[0] || null,
        8000,
        150
      );

      if (!campo) {
        console.warn("⚠️ Campo não encontrado:", `item_medico_${idx}`);
        continue;
      }

      await setValueMasked(campo, code);

      // ✅ 5) Quantidade
      const qtd = await waitFor(
        () => document.getElementsByName(`qtd_solicitada_${idx}`)[0] || null,
        4000,
        150
      );

      if (qtd) {
        await setValueMasked(qtd, "1");
      }

      console.log(`✅ Inserido ${code} na linha ${idx}`);

      // ✅ 6) Se modal de biometria aparecer, confirma
      await maybeHandleBiometria();

      // ✅ 7) tempo para backend/validação carregar descrição
      await delay(2500);
    }

    console.log("🎉 Todos os códigos foram inseridos!");
  } catch (e) {
    console.error("❌ Erro fatal no script:", e);
  }
})();
