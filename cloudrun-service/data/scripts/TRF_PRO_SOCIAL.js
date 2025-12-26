// TRF PRO SOCIAL • Inserção em lote (baseline)
void setTimeout(async () => {
  try {
    const codigos = ["40301087", "40301150", "40301222", "40301273", "40301281", "40301354", "40301362", "40301419", "40301427", "40301508", "40301567", "40301648", "40301729", "40301842", "40301990", "40302113", "40302199", "40302377", "40302520", "40302580", "40302601", "40302610", "40302733", "40302750", "40302830", "40304361", "40304507", "40305465", "40305627", "40312151", "40313310", "40316050", "40316076", "40316106", "40316157", "40316165", "40316203", "40316211", "40316220", "40316246", "40316254", "40316262", "40316270", "40316289", "40316300", "40316335", "40316360", "40316408", "40316416", "40316440", "40316483", "40316505", "40316513", "40316530", "40316572"];
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < codigos.length; i++) {
      const code = codigos[i];

      const evento = document.getElementsByName("EVENTO")[0];
      if (!evento) {
        alert("Campo EVENTO não encontrado. Ajuste TRF_PRO_SOCIAL.AMBOS.js");
        return;
      }

      evento.focus();
      evento.value = "";
      evento.dispatchEvent(new Event("input", { bubbles: true }));
      for (const ch of code) {
        evento.value += ch;
        evento.dispatchEvent(new Event("input", { bubbles: true }));
        await delay(40);
      }
      evento.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
      await delay(1500);

      const codTab = document.getElementsByName("CODIGOTABELA")[0];
      if (codTab) {
        codTab.value = "22";
        codTab.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document.getElementById("CODIGOTABELA_btn")?.click();
      await delay(1200);

      document.getElementById("GRAU_btn")?.click();
      await delay(1200);

      // Salvar / Novo
      if (i === codigos.length - 1) {
        document.querySelector("a[accesskey='S']")?.click();
      } else {
        document.querySelector("a[accesskey='N']")?.click();
      }

      console.log("✔ TRF inserido:", code);
      await delay(1600);
    }

    console.log("🎉 TRF finalizado.");
  } catch (e) {
    console.error("❌ TRF erro:", e);
  }
}, 0);
