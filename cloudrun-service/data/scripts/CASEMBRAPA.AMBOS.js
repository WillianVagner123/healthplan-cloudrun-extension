// CASEMBRAPA • Inserção em lote (baseline)
// Observação: portais mudam. Se algum seletor falhar, edite este arquivo.
(async () => {
  try {
    const codigos = ["40301087", "40301150", "40301222", "40301273", "40301281", "40301354", "40301362", "40301419", "40301427", "40301508", "40301567", "40301648", "40301729", "40301842", "40301990", "40302113", "40302199", "40302377", "40302520", "40302580", "40302601", "40302610", "40302733", "40302750", "40302830", "40304361", "40304507", "40305465", "40305627", "40312151", "40313310", "40316050", "40316076", "40316106", "40316157", "40316165", "40316203", "40316211", "40316220", "40316246", "40316254", "40316262", "40316270", "40316289", "40316300", "40316335", "40316360", "40316408", "40316416", "40316440", "40316483", "40316505", "40316513", "40316530", "40316572"];
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const gridId = "gridSolicitacao_gridProcedimentosSimples";
    const grid = document.getElementById(gridId);
    if (!grid) {
      alert("Grid não encontrada (CASEMBRAPA). Ajuste o seletor em CASEMBRAPA.AMBOS.js");
      return;
    }

    const click = async (el) => {
      if (!el) return false;
      el.scrollIntoView?.({ block: "center" });
      el.click();
      await sleep(250);
      return true;
    };

    const waitFor = async (fn, timeout=30000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const v = fn();
        if (v) return v;
        await sleep(200);
      }
      return null;
    };

    for (const code of codigos) {
      // novo registro
      await click(grid.querySelector("#insertButton"));
      await sleep(400);

      // editor de PROCEDIMENTO (alguns grids criam input com name='PROCEDIMENTO')
      const proc = await waitFor(() => document.querySelector("input[name='PROCEDIMENTO']"), 15000);
      if (!proc) {
        console.warn("Campo PROCEDIMENTO não apareceu:", code);
        continue;
      }
      proc.focus();
      proc.value = code;
      proc.dispatchEvent(new Event("input", { bubbles: true }));
      proc.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));

      // quantidade (se existir)
      const qtd = await waitFor(() => document.querySelector("input[name='COBRADOQDE']"), 5000);
      if (qtd) {
        qtd.value = "1";
        qtd.dispatchEvent(new Event("input", { bubbles: true }));
        qtd.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
      }

      // confirmar/post
      await click(grid.querySelector("#postButton"));
      await sleep(2500);
      console.log("✔ CASEMBRAPA inserido:", code);
      await sleep(1500);
    }

    console.log("🎉 CASEMBRAPA finalizado.");
  } catch (e) {
    console.error("❌ CASEMBRAPA erro:", e);
  }
})();
