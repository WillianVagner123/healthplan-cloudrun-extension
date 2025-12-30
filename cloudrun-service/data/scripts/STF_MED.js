(() => {
  const TAG = "STF_MED";
  const LS_CODES = "HP_STF_MED_CODES";
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  function log(m, o){ o!==undefined?console.log(`${TAG}: ${m}`,o):console.log(`${TAG}: ${m}`); }
  function warn(m, o){ o!==undefined?console.warn(`${TAG}: ${m}`,o):console.warn(`${TAG}: ${m}`); }

  function dispatchInput(el){
    el.dispatchEvent(new Event("input", { bubbles:true }));
    el.dispatchEvent(new Event("change", { bubbles:true }));
  }

  async function waitFor(fn, {timeout=12000, step=150}={}){
    const t0 = Date.now();
    while (Date.now()-t0 < timeout){
      try { const v = fn(); if (v) return v; } catch {}
      await delay(step);
    }
    return null;
  }

  // ✅ 1) Começa por aqui: o display que você colou
  const display = document.querySelector("input#HandleTermo[name='HandleTermoLookupDisplay']") ||
                  document.querySelector("input[name='HandleTermoLookupDisplay']");

  if (!display){
    warn("Não achei o input display HandleTermoLookupDisplay.");
    return;
  }

  // ✅ 2) Container correto (evita ids duplicados)
  const container = display.closest("div[lookup='true']") ||
                    display.closest("div[campos-dependencia-extras]") ||
                    display.closest(".input-group")?.parentElement;

  if (!container){
    warn("Não achei o container lookup='true' do HandleTermo.");
    return;
  }

  // ✅ 3) Hidden + botões (do seu HTML)
  const hidden   = container.querySelector("input[name='HandleTermo']");
  const btnClear = container.querySelector("button[ng-click='lookupCtrl.clearSelected()']");
  const btnLupa  = container.querySelector("button[ng-click='lookupCtrl.SearchWithButton()']");

  if (!hidden || !btnLupa){
    warn("Faltou hidden HandleTermo ou botão lupa (SearchWithButton).", { hidden: !!hidden, btnLupa: !!btnLupa });
    return;
  }

  function modalEl(){
    const m = document.querySelector("#modal-lookup");
    if (!m) return null;
    const style = getComputedStyle(m);
    const open = (style.display !== "none") || m.classList.contains("in");
    return open ? m : null;
  }

  function findRows(m){
    // bem permissivo: variações do Benner
    return Array.from(m.querySelectorAll("tr.dataGridRow, tr.dataGridRow.ng-scope, table tbody tr"))
      .filter(r => (r.innerText||"").trim().length > 0);
  }

  function pickRow(rows, code){
    const c = String(code);
    const norm = s => (s||"").toString().replace(/\s+/g," ").trim();
    for (const r of rows) if (norm(r.innerText).includes(c)) return r;
    return rows[0] || null;
  }

  function findOk(m){
    // tenta achar botão de confirmar, se existir
    const btns = Array.from(m.querySelectorAll("button,a"));
    const ok = btns.find(b => {
      const t = (b.innerText||"").trim().toLowerCase();
      const oc = (b.getAttribute("onclick")||"").toLowerCase();
      const ng = (b.getAttribute("ng-click")||"").toLowerCase();
      return /ok|selecionar|confirmar|escolher/.test(t) || oc.includes("lkp_ok") || ng.includes("ok") || ng.includes("select");
    });
    return ok || null;
  }

  async function selectCode(code){
    // limpa “Angular”
    btnClear?.click();
    await delay(80);

    // limpa display
    display.focus();
    display.value = "";
    dispatchInput(display);
    await delay(80);

    // digita
    const txt = String(code);
    for (const ch of txt){
      display.value += ch;
      dispatchInput(display);
      await delay(20);
    }

    // 🔥 aciona busca pela lupa
    btnLupa.click();

    // espera modal
    const m = await waitFor(() => modalEl(), { timeout: 8000, step: 120 });
    if (!m) return { ok:false, reason:"modal_not_open" };

    // espera rows
    const rows = await waitFor(() => {
      const r = findRows(m);
      return r.length ? r : null;
    }, { timeout: 12000, step: 150 });

    if (!rows) return { ok:false, reason:"grid_not_found" };

    // zera hidden pra validar commit
    hidden.value = "";
    hidden.dispatchEvent(new Event("input",{bubbles:true}));
    hidden.dispatchEvent(new Event("change",{bubbles:true}));

    const row = pickRow(rows, txt);
    if (!row) return { ok:false, reason:"row_not_found" };

    row.scrollIntoView({ block:"center" });
    row.click();
    await delay(150);

    // confirma se tiver OK
    findOk(m)?.click();

    // espera hidden preencher
    const got = await waitFor(() => {
      const v = (hidden.value||"").toString().trim();
      return v ? v : null;
    }, { timeout: 9000, step: 120 });

    if (got) return { ok:true, handle: got };

    // fallback: dblclick
    row.dispatchEvent(new MouseEvent("dblclick",{bubbles:true}));
    const got2 = await waitFor(() => {
      const v = (hidden.value||"").toString().trim();
      return v ? v : null;
    }, { timeout: 6000, step: 120 });

    if (got2) return { ok:true, handle: got2 };

    return { ok:false, reason:"hidden_not_filled" };
  }

  // ✅ Codes: sem mexer em nada externo, via localStorage (ou você adapta pro seu payload depois)
  let codes = [];
  try { codes = JSON.parse(localStorage.getItem(LS_CODES) || "[]"); } catch {}
  if (!Array.isArray(codes) || !codes.length){
    warn(`Sem códigos. Coloque assim e rode de novo:
localStorage.setItem("${LS_CODES}", JSON.stringify(["40301087","40301150"]))`);
    return;
  }

  (async () => {
    log("Iniciando", { total: codes.length });

    for (let i=0;i<codes.length;i++){
      const code = String(codes[i]);
      log(`▶️ (${i+1}/${codes.length})`, code);

      const res = await selectCode(code);
      if (res.ok){
        log("✅ Selecionado", { code, handle: res.handle });
        await delay(350);
      } else {
        warn("❌ Falhou (parando aqui para você ver)", { code, reason: res.reason });
        break;
      }
    }

    log("Fim.");
  })();
})();
