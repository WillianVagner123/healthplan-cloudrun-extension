// TRT • Inserção em lote (baseline)
// Tenta achar um input de procedimento e um botão de confirmação.
// Ajuste seletor se necessário.
(async () => {
  const codigos = ["40301087", "40301150", "40301222", "40301273", "40301281", "40301354", "40301362", "40301419", "40301427", "40301508", "40301567", "40301648", "40301729", "40301842", "40301990", "40302113", "40302199", "40302377", "40302520", "40302580", "40302601", "40302610", "40302733", "40302750", "40302830", "40304361", "40304507", "40305465", "40305627", "40312151", "40313310", "40316050", "40316076", "40316106", "40316157", "40316165", "40316203", "40316211", "40316220", "40316246", "40316254", "40316262", "40316270", "40316289", "40316300", "40316335", "40316360", "40316408", "40316416", "40316440", "40316483", "40316505", "40316513", "40316530", "40316572"];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const findInput = () =>
    document.querySelector("#idProcedimento") ||
    document.querySelector("#termoCodigoSolicitado") ||
    document.querySelector("input[name='codigoProcedimento']") ||
    document.querySelector("input[type='text']");

  const findBtn = () => {
    const btns = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"));
    return btns.find(b => (b.textContent || b.value || "").toLowerCase().includes("confirm")) ||
           btns.find(b => (b.textContent || b.value || "").toLowerCase().includes("incluir")) ||
           btns.find(b => (b.textContent || b.value || "").toLowerCase().includes("adicionar"));
  };

  for (const code of codigos) {
    try {
      const input = findInput();
      if (!input) throw new Error("Input de procedimento não encontrado");

      input.focus();
      input.value = code;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

      await wait(800);

      const btn = findBtn();
      if (!btn) throw new Error("Botão de confirmar/incluir não encontrado");

      btn.click();
      console.log("✔ TRT inserido:", code);

      await wait(3500);
    } catch (e) {
      console.error("✖ TRT falha:", code, e);
      await wait(1500);
    }
  }

  console.log("🎉 TRT finalizado.");
})();
