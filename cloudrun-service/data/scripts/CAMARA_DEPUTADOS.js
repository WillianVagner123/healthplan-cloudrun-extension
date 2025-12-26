// CAMARA DOS DEPUTADOS • Inserção em lote (baseline)
void setTimeout(async () => {
  try {
    const codigos = ["40301087", "40301150", "40301222", "40301273", "40301281", "40301354", "40301362", "40301419", "40301427", "40301508", "40301567", "40301648", "40301729", "40301842", "40301990", "40302113", "40302199", "40302377", "40302520", "40302580", "40302601", "40302610", "40302733", "40302750", "40302830", "40304361", "40304507", "40305465", "40305627", "40312151", "40313310", "40316050", "40316076", "40316106", "40316157", "40316165", "40316203", "40316211", "40316220", "40316246", "40316254", "40316262", "40316270", "40316289", "40316300", "40316335", "40316360", "40316408", "40316416", "40316440", "40316483", "40316505", "40316513", "40316530", "40316572"];
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    for (const code of codigos) {
      const evento = document.getElementsByName("EVENTO")[0];
      if (!evento) {
        alert("Campo EVENTO não encontrado. Ajuste CAMARA_DEPUTADOS.AMBOS.js");
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
      document.querySelector("a[title*='Salvar / Novo']")?.click();
      console.log("✔ CAMARA inserido:", code);
      await delay(1800);
    }

    console.log("🎉 CAMARA finalizado.");
  } catch (e) {
    console.error("❌ CAMARA erro:", e);
  }
}, 0);
