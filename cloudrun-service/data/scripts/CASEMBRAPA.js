/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {
  // --- PREVENÇÃO DE DUPLICAÇÃO ---
  const existingBtn = document.getElementById("hp_case_btn");
  if (existingBtn) {
    console.log("Botão já existe. Removendo para atualizar...");
    existingBtn.remove();
    const wrap = document.getElementById("hp_case_wrap");
    if (wrap) wrap.remove();
  }

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  const TABELA_PADRAO = "22";
  const QUANTIDADE_PADRAO = "1";
  const DELAY = { tiny: 100, short: 300, mid: 600, long: 1000 };

  const LOGS = [];
  const nowTs = () => {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}]`;
  };

  function ensureUI() {
    const wrap = document.createElement("div");
    wrap.id = "hp_case_wrap";
    wrap.style.cssText = "position:fixed;right:12px;bottom:12px;width:380px;z-index:2147483647;font-family:sans-serif;pointer-events:none;";
    
    const box = document.createElement("div");
    box.id = "hp_case_box";
    box.style.cssText = "background:rgba(0,0,0,0.85);color:#00ff00;border-radius:10px;padding:10px;max-height:180px;overflow:auto;pointer-events:auto;font-size:10px;font-family:monospace;border:1px solid #444;";
    wrap.appendChild(box);

    const btn = document.createElement("button");
    btn.id = "hp_case_btn";
    btn.textContent = "⚡ Inserir Procedimentos";
    btn.style.cssText = "position:fixed;right:12px;top:12px;z-index:2147483647;padding:14px 22px;background:#0d6efd;color:#fff;border:none;border-radius:30px;cursor:pointer;font-weight:bold;pointer-events:auto;box-shadow:0 6px 15px rgba(0,0,0,0.4);transition:all 0.2s;";
    
    document.documentElement.appendChild(wrap);
    document.documentElement.appendChild(btn);

    return { box, btn };
  }

  const ui = ensureUI();

  function logLine(msg) {
    const line = `${nowTs()} > ${msg}`;
    LOGS.unshift(line);
    ui.box.textContent = LOGS.slice(0, 50).join("\n");
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findInsertButton(doc) {
    // 1. Pelo ícone "add" (clássico do WF)
    const icons = Array.from(doc.querySelectorAll(".wf-icons"));
    const addIcon = icons.find(i => i.textContent.trim() === "add");
    if (addIcon) return addIcon.closest("button");
    
    // 2. Pelo label
    return doc.querySelector("button[aria-label='Inserir']") || 
           Array.from(doc.querySelectorAll("button")).find(b => b.textContent.includes("Inserir"));
  }

  async function ensureCellEditor(win, tr, fieldname) {
    const td = tr.querySelector(`td[fieldname='${fieldname}']`);
    if (!td) return null;

    td.scrollIntoView({ block: "center" });
    
    for (let i = 0; i < 5; i++) {
      // Simulação de Double Click
      const clickEv = (t) => td.dispatchEvent(new win.MouseEvent(t, { bubbles: true, cancelable: true, view: win, detail: t==='dblclick'?2:1 }));
      clickEv('mousedown'); clickEv('mouseup'); clickEv('click'); clickEv('dblclick');
      
      await sleep(400);
      const inp = tr.querySelector(`input`) || tr.querySelector(`.editingRecord input`);
      if (inp) {
        inp.focus();
        return inp;
      }
    }
    return null;
  }

  async function run() {
    const codes = payload.codes || [];
    if (!codes.length) return logLine("Nenhum código para inserir.");

    ui.btn.disabled = true;
    ui.btn.style.background = "#666";
    logLine("Buscando tabela de procedimentos...");

    // Varre Frames
    const frames = [window, ...Array.from(document.querySelectorAll("iframe")).map(f => {
      try { return f.contentWindow; } catch(e) { return null; }
    }).filter(x => x)];

    let ctx = null;
    let btnIns = null;

    for (const f of frames) {
      try {
        btnIns = findInsertButton(f.document);
        if (btnIns) { ctx = f; break; }
      } catch(e) {}
    }

    if (!ctx || !btnIns) {
      logLine("ERRO: Aba 'Demais Procedimentos' não encontrada.");
      ui.btn.disabled = false;
      ui.btn.style.background = "#0d6efd";
      return;
    }

    for (let i = 0; i < codes.length; i++) {
      const code = String(codes[i]);
      logLine(`Item ${i+1}/${codes.length}: ${code}`);

      try {
        btnIns.click();
        await sleep(DELAY.mid);

        const doc = ctx.document;
        const rows = Array.from(doc.querySelectorAll("tr.grid-record"));
        const tr = rows[rows.length - 1];

        // TABELA
        const inpTab = await ensureCellEditor(ctx, tr, "TABELACOBRANCA");
        if (inpTab) {
          inpTab.value = TABELA_PADRAO;
          inpTab.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // PROCEDIMENTO
        const inpProc = await ensureCellEditor(ctx, tr, "PROCEDIMENTO");
        if (inpProc) {
          inpProc.value = code;
          inpProc.dispatchEvent(new Event('change', { bubbles: true }));
          inpProc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          await sleep(DELAY.mid);
        }

        // QTD
        const inpQtd = await ensureCellEditor(ctx, tr, "COBRADOQDE");
        if (inpQtd) {
          inpQtd.value = QUANTIDADE_PADRAO;
          inpQtd.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // CONFIRMAR LINHA (Ícone de check/feito)
        const btnOk = doc.querySelector("button[aria-label='Confirmar']") || 
                      doc.querySelector(".wf-icons[text='done']")?.closest("button");
        if (btnOk) btnOk.click();

        await sleep(DELAY.long);
      } catch (e) {
        logLine(`Falha no código ${code}`);
      }
    }

    logLine("CONCLUÍDO!");
    ui.btn.disabled = false;
    ui.btn.textContent = "⚡ Inserir Novamente";
    ui.btn.style.background = "#28a745";
  }

  ui.btn.onclick = run;
  logLine("Sistema pronto.");
})();
