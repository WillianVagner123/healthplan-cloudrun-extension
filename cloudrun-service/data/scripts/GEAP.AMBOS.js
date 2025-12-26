(async () => {
  try {
    const codigos = [
      "40301087","40301150","40301222","40301273","40301281","40301354","40301362",
      "40301419","40301427","40301508","40301567","40301648","40301729","40301842",
      "40301990","40302113","40302199","40302377","40302520","40302580",
      "40302601","40302610","40302733","40302750","40302830","40304361","40304507",
      "40305465","40305627","40312151","40313310","40316050","40316076","40316106",
      "40316157","40316165","40316203","40316211","40316220","40316246","40316254",
      "40316262","40316270","40316289","40316300","40316335","40316360","40316408",
      "40316416","40316440","40316483","40316505","40316513","40316530","40316572"
    ];

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    /* ================== BUSCA ROBUSTA (DOM + IFRAMES) ================== */

    function findInDoc(doc, idx) {
      return doc.getElementById(`item_medico_${idx}`) ||
             doc.getElementsByName(`item_medico_${idx}`)[0] ||
             doc.querySelector(`input#item_medico_${idx}, input[name='item_medico_${idx}']`);
    }

    async function findField(idx, timeout = 45000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        // documento principal
        let el = findInDoc(document, idx);
        if (el) return el;

        // iframes (mesmo domínio)
        const frames = Array.from(document.querySelectorAll("iframe"));
        for (const f of frames) {
          try {
            const doc = f.contentDocument;
            if (!doc) continue;
            el = findInDoc(doc, idx);
            if (el) return el;
          } catch (_) {}
        }
        await delay(200);
      }
      return null;
    }

    /* ================== EVENTOS ================== */

    function fire(el, type) {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }

    function fireKey(el, type, key) {
      el.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key
      }));
    }

    /* ================== WARM-UP GHOST (#2) ================== */

    async function warmUpGhostType(el) {
      el.scrollIntoView?.({ block: "center" });
      el.click?.();
      el.focus();

      // digita "0"
      fireKey(el, "keydown", "0");
      el.value += "0";
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: "0",
        inputType: "insertText"
      }));
      fireKey(el, "keyup", "0");

      await delay(60);

      // apaga
      fireKey(el, "keydown", "Backspace");
      el.value = el.value.slice(0, -1);
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        data: null,
        inputType: "deleteContentBackward"
      }));
      fireKey(el, "keyup", "Backspace");

      fire(el, "change");
      await delay(120);

      // reforço jQuery
      if (window.jQuery) {
        window.jQuery(el).trigger("input").trigger("change").trigger("blur");
      }
    }

    /* ================== DIGITAÇÃO HUMANA ================== */

    async function humanType(el, text) {
      el.focus();

      // limpa
      el.value = "";
      fire(el, "input");
      fire(el, "change");

      for (const ch of String(text)) {
        fireKey(el, "keydown", ch);
        fireKey(el, "keypress", ch);

        el.value += ch;
        el.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          data: ch,
          inputType: "insertText"
        }));

        fireKey(el, "keyup", ch);
        await delay(25);
      }

      fire(el, "change");
      el.blur();
      fire(el, "blur");

      // reforço jQuery
      if (window.jQuery) {
        window.jQuery(el).val(String(text))
          .trigger("input")
          .trigger("change")
          .trigger("blur");
      }
    }

    /* ================== INÍCIO ================== */

    console.log("⏳ Procurando item_medico_1...");

    const first = await findField(1);
    if (!first) {
      console.error("❌ Não achei item_medico_1. Abra a aba Procedimentos/Serviços antes de rodar.");
      return;
    }

    console.log("✅ Campo encontrado:", first);

    // warm-up no primeiro campo
    await warmUpGhostType(first);

    console.log("▶️ Iniciando inserção...");

    for (let i = 0; i < codigos.length; i++) {
      const idx = i + 1;
      const code = codigos[i];

      if (idx > 1) {
        const btn = document.getElementById("button2") ||
                    document.querySelector("input[name='button2']");
        if (btn) {
          btn.click();
          await delay(700);
        }
      }

      const campo = await findField(idx, 25000);
      if (!campo) {
        console.warn(`⚠️ Campo item_medico_${idx} não encontrado.`);
        continue;
      }

      // warm-up antes de cada digitação
      await warmUpGhostType(campo);
      await humanType(campo, code);

      console.log(`✅ Inserido ${code} na linha ${idx}`);

      // espera descrição preencher, se existir
      const desc = document.getElementById(`nome_item_proc_${idx}`);
      if (desc) {
        const start = Date.now();
        while (Date.now() - start < 15000) {
          if ((desc.value || "").trim()) break;
          await delay(200);
        }
      }

      await delay(600);
    }

    console.log("🎉 Finalizado com sucesso!");

  } catch (e) {
    console.error("❌ Erro fatal no script:", e);
  }
})();
