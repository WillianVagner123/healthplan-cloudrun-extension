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
  const TABELA_PADRAO = "22";
  const QUANTIDADE_PADRAO = "1";

  const DELAY = {
    tiny: 100,
    short: 300,
    mid: 600,
    long: 1000
  };

  const LOGS = [];

  const nowTs = () => {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
  };

  function ensureUI() {
    const wrap = document.createElement("div");
    wrap.id = "hp_case_wrap";
    wrap.style.cssText =
      "position:fixed;right:12px;bottom:12px;width:420px;z-index:2147483647;font-family:sans-serif;pointer-events:none;";

    const box = document.createElement("div");
    box.id = "hp_case_box";
    box.style.cssText =
      "background:rgba(0,0,0,0.85);color:#00ff00;border-radius:10px;padding:10px;max-height:220px;overflow:auto;pointer-events:auto;font-size:10px;font-family:monospace;border:1px solid #444;";
    wrap.appendChild(box);

    const btn = document.createElement("button");
    btn.id = "hp_case_btn";
    btn.textContent = "⚡ Inserir Procedimentos";
    btn.style.cssText =
      "position:fixed;right:12px;top:12px;z-index:2147483647;padding:14px 22px;background:#0d6efd;color:#fff;border:none;border-radius:30px;cursor:pointer;font-weight:bold;pointer-events:auto;box-shadow:0 6px 15px rgba(0,0,0,0.4);transition:all 0.2s;";

    document.documentElement.appendChild(wrap);
    document.documentElement.appendChild(btn);

    return { box, btn };
  }

  const ui = ensureUI();

  function logLine(msg) {
    const line = `${nowTs()} > ${msg}`;
    LOGS.unshift(line);
    ui.box.textContent = LOGS.slice(0,80).join("\n");
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function waitFor(fn, timeout=5000, step=100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch(_) {}
      await sleep(step);
    }
    return null;
  }

  function findInsertButton(doc) {
    const icons = Array.from(doc.querySelectorAll(".wf-icons"));
    const addIcon = icons.find(i => i.textContent.trim() === "add");
    if (addIcon) return addIcon.closest("button");

    return (
      doc.querySelector("button[aria-label='Inserir']") ||
      Array.from(doc.querySelectorAll("button"))
        .find(b => (b.textContent||"").toLowerCase().includes("inserir"))
    );
  }

  function findDoneButton(doc) {
    const aria = doc.querySelector("button[aria-label='Confirmar']");
    if (aria) return aria;

    const icons = Array.from(doc.querySelectorAll(".wf-icons"));
    const doneIcon = icons.find(i => i.textContent.trim() === "done");
    if (doneIcon) return doneIcon.closest("button");

    return null;
  }

  function fireValue(win, el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles:true }));
    el.dispatchEvent(new win.Event("change", { bubbles:true }));
    el.dispatchEvent(new win.Event("blur", { bubbles:true }));
  }

  async function openCellEditor(win, tr, field) {
    const td = tr.querySelector(`td[fieldname='${field}']`);
    if (!td) return null;

    td.scrollIntoView({ block:"center" });

    const click = (t, detail) =>
      td.dispatchEvent(new win.MouseEvent(t, {
        bubbles:true,
        cancelable:true,
        view:win,
        detail
      }));

    for (let i=0;i<6;i++) {
      click("mousedown",1);
      click("mouseup",1);
      click("click",1);
      click("dblclick",2);

      const inp = await waitFor(() =>
        td.querySelector("input,textarea") ||
        tr.querySelector(".editingRecord input,.editingRecord textarea"),
        2000,100
      );

      if (inp) return inp;
      await sleep(250);
    }

    return null;
  }

  async function getLastRow(doc) {
    await waitFor(()=>doc.querySelector("tr.grid-record"),5000,100);
    const rows = Array.from(doc.querySelectorAll("tr.grid-record"));
    return rows[rows.length-1] || null;
  }

  async function run() {
    const codes = payload.codes || [];
    if (!codes.length) return logLine("Nenhum código no payload.");

    ui.btn.disabled = true;
    ui.btn.style.background = "#666";

    const frames = [
      window,
      ...Array.from(document.querySelectorAll("iframe"))
        .map(f=>{ try{return f.contentWindow}catch(e){return null} })
        .filter(Boolean)
    ];

    let ctx=null, btnIns=null;

    for (const f of frames) {
      try {
        btnIns = findInsertButton(f.document);
        if (btnIns) { ctx=f; break; }
      } catch(_) {}
    }

    if (!ctx || !btnIns) {
      logLine("ERRO: botão Inserir não encontrado.");
      ui.btn.disabled=false;
      ui.btn.style.background="#0d6efd";
      return;
    }

    const doc = ctx.document;
    logLine("Contexto encontrado. Iniciando...");

    for (let i=0;i<codes.length;i++) {
      const code = String(codes[i]).trim();
      if (!code) continue;

      logLine(`Item ${i+1}/${codes.length}: ${code}`);

      try {
        const before = doc.querySelectorAll("tr.grid-record").length;
        btnIns.click();

        const row = await waitFor(()=>{
          const count = doc.querySelectorAll("tr.grid-record").length;
          if (count>before) return getLastRow(doc);
          return null;
        },6000,150) || await getLastRow(doc);

        if (!row) throw new Error("Linha não encontrada.");

        const tab = await openCellEditor(ctx,row,"TABELACOBRANCA");
        if (tab) fireValue(ctx,tab,TABELA_PADRAO);

        await sleep(DELAY.short);

        const proc = await openCellEditor(ctx,row,"PROCEDIMENTO");
        if (proc) {
          fireValue(ctx,proc,code);
          proc.dispatchEvent(
            new ctx.KeyboardEvent("keydown",{key:"Enter",keyCode:13,bubbles:true})
          );
        }

        await sleep(DELAY.mid);

        const qtd = await openCellEditor(ctx,row,"COBRADOQDE");
        if (qtd) fireValue(ctx,qtd,QUANTIDADE_PADRAO);

        await sleep(DELAY.short);

        const ok = findDoneButton(doc);
        if (ok) ok.click();

        await sleep(DELAY.long);

      } catch(e) {
        logLine(`Falha em ${code}: ${e.message}`);
      }
    }

    logLine("CONCLUÍDO!");
    ui.btn.disabled=false;
    ui.btn.textContent="⚡ Inserir Novamente";
    ui.btn.style.background="#28a745";
  }

  ui.btn.onclick = run;
  logLine("Sistema pronto.");
})();
