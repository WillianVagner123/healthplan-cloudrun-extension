// STF_MED • Inserção em lote (robusto p/ lookup Angular)
// - Digita no campo DISPLAY (#HandleTermo)
// - Dispara SearchWithEnter (Enter)
// - Espera grid/linhas
// - Clica a linha (de preferência a que casa com o código)
// - Confere se o hidden input[name="HandleTermo"] foi preenchido
// Observação: em alguns portais o evento certo é keydown, não keypress.

void setTimeout(async () => {
  const codigos = [
    "40301087","40301150","40301222","40301273","40301281","40301354","40301362","40301419","40301427","40301508",
    "40301567","40301648","40301729","40301842","40301990","40302113","40302199","40302377","40302520","40302580",
    "40302601","40302610","40302733","40302750","40302830","40304361","40304507","40305465","40305627","40312151",
    "40313310","40316050","40316076","40316106","40316157","40316165","40316203","40316211","40316220","40316246",
    "40316254","40316262","40316270","40316289","40316300","40316335","40316360","40316408","40316416","40316440",
    "40316483","40316505","40316513","40316530","40316572"
  ];

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- helpers ----------
  async function waitFor(fn, { timeout = 10000, step = 100 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {}
      await delay(step);
    }
    return null;
  }

  function dispatchInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    // tenta keydown (mais comum em Angular) + keypress (fallback) + submit-like
    const evDown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    const evPress = new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    const evUp = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    el.dispatchEvent(evDown);
    el.dispatchEvent(evPress);
    el.dispatchEvent(evUp);
  }

  function getHiddenHandle() {
    return document.querySelector('input[name="HandleTermo"]');
  }

  function getDisplayField() {
    // seu DOM mostrou id="HandleTermo" no display
    return document.getElementById("HandleTermo");
  }

  function findGridRows() {
    // tenta pegar linhas do lookup grid (ajuste se o portal usar outras classes)
    return Array.from(document.querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, tr.ng-scope"));
  }

  function pickRowByCode(rows, code) {
    // tenta achar uma linha que contenha o código no texto/colunas
    const norm = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
    for (const r of rows) {
      const txt = norm(r.innerText);
      if (txt.includes(code)) return r;
    }
    // fallback: primeira row "clicável"
    return rows[0] || null;
  }

  // ---------- main ----------
  try {
    const field = getDisplayField();
    if (!field) {
      alert("Campo DISPLAY #HandleTermo não encontrado.");
      return;
    }
    const hidden = getHiddenHandle();
    if (!hidden) {
      alert('Campo HIDDEN input[name="HandleTermo"] não encontrado.');
      return;
    }

    console.log("STF_MED: iniciando…", { total: codigos.length });

    for (let i = 0; i < codigos.length; i++) {
      const code = codigos[i];

      // limpa
      field.focus();
      field.value = "";
      dispatchInput(field);
      await delay(80);

      // digita (simula humano; às vezes necessário p/ inputmask)
      for (const ch of code) {
        field.value += ch;
        dispatchInput(field);
        await delay(30);
      }

      // garante foco e dispara lookup (Enter)
      field.focus();
      pressEnter(field);

      // espera aparecer alguma linha de grid
      const rows = await waitFor(() => {
        const r = findGridRows().filter(x => (x.innerText || "").trim().length > 0);
        return r.length ? r : null;
      }, { timeout: 12000, step: 150 });

      if (!rows) {
        console.warn("STF_MED: sem grid/linhas após busca (talvez precise clicar no botão lupa). Código:", code);
        // fallback: tenta clicar no botão de search ao lado (fa-search)
        const btnSearch = field.closest(".input-group")?.querySelector("button .fa-search")?.closest("button");
        if (btnSearch) {
          btnSearch.click();
          await delay(600);
        }
      }

      const rows2 = findGridRows().filter(x => (x.innerText || "").trim().length > 0);
      const row = pickRowByCode(rows2, code);

      if (!row) {
        console.warn("STF_MED: nenhuma row encontrada para", code);
        continue;
      }

      // antes de clicar, zera hidden pra saber se preencheu
      hidden.value = "";
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
      hidden.dispatchEvent(new Event("change", { bubbles: true }));

      row.scrollIntoView({ block: "center" });
      row.click();

      // espera o hidden ser preenchido
      const ok = await waitFor(() => {
        const v = (hidden.value || "").toString().trim();
        return v ? v : null;
      }, { timeout: 8000, step: 120 });

      if (!ok) {
        console.warn("STF_MED: clique não preencheu hidden para", code, "→ tentando duplo clique");
        row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await delay(300);

        const ok2 = await waitFor(() => {
          const v = (hidden.value || "").toString().trim();
          return v ? v : null;
        }, { timeout: 6000, step: 120 });

        if (!ok2) {
          console.error("STF_MED: falhou selecionar termo (hidden vazio) para", code);
          continue;
        }
      }

      console.log(`✔ STF_MED (${i+1}/${codigos.length}) selecionado:`, code, "→ handle:", hidden.value);

      // pequeno respiro (evita “engolir” seleções em lote)
      await delay(500);
    }

    console.log("🎉 STF_MED finalizado.");
  } catch (e) {
    console.error("❌ STF_MED erro:", e);
  }
}, 0);
