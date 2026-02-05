/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // =========================================
  // CONFIG
  // =========================================
  const GRID_NAME = "gridSolicitacao_gridProcedimentosSimples";
  const REC_COUNT_SEL = `#${GRID_NAME}_gridPosition_rec_count`;

  const DELAY = { tiny: 80, short: 160, mid: 320, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 260;

  const TABELA_PADRAO = "22";
  const QUANTIDADE_PADRAO = "1";
  const FALLBACK_CODES = [];

  // =========================================
  // UI
  // =========================================
  const LOGS = [];
  const nowTs = () => {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
  };

  function ensureUI() {
    ["hp_case_wrap","hp_case_btn"].forEach(id=>{
      const e=document.getElementById(id); if(e) e.remove();
    });

    const wrap = document.createElement("div");
    wrap.id="hp_case_wrap";
    wrap.style.cssText=`
      position:fixed;right:12px;bottom:12px;width:460px;
      z-index:2147483647;font:12px system-ui;color:#fff
    `;
    document.documentElement.appendChild(wrap);

    const head=document.createElement("div");
    head.style.cssText=`background:#000c;padding:10px;border-radius:10px`;
    wrap.appendChild(head);

    const box=document.createElement("div");
    box.style.cssText=`background:#0009;margin-top:6px;padding:8px;border-radius:10px;max-height:260px;overflow:auto;white-space:pre-wrap`;
    wrap.appendChild(box);

    const btn=document.createElement("button");
    btn.id="hp_case_btn";
    btn.textContent="⚡ Inserir Procedimentos";
    btn.style.cssText=`
      position:fixed;top:12px;right:12px;
      padding:12px 14px;border-radius:14px;
      border:none;background:#0d6efd;color:#fff;
      font-weight:800;cursor:pointer;z-index:2147483647
    `;
    document.documentElement.appendChild(btn);

    return {wrap,head,box,btn};
  }

  const ui = ensureUI();

  function log(kind,msg){
    const m = kind==="ok"?"✅":kind==="err"?"❌":"⚠️";
    LOGS.unshift(`${nowTs()} ${m} ${msg}`);
    LOGS.splice(200);
    ui.box.textContent = LOGS.join("\n");
  }

  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  // =========================================
  // CONTEXTO (TOP + IFRAMES)
  // =========================================
  function collectContexts() {
    const out=[], seen=new Set();
    (function walk(w){
      if(!w||seen.has(w)) return;
      seen.add(w);
      try{ out.push({win:w,doc:w.document}); }catch{}
      let ifs=[];
      try{ ifs=[...w.document.querySelectorAll("iframe")]; }catch{}
      for(const f of ifs){
        try{ walk(f.contentWindow); }catch{}
      }
    })(window.top||window);
    return out;
  }

  // =========================================
  // GRID DETECTION (ROBUSTA)
  // =========================================
  function findGridInDoc(doc){
    if(!doc) return null;

    // 1) rec_count = grid viva
    const rc = doc.querySelector(REC_COUNT_SEL);
    if(rc){
      return rc.closest("[data-grid-name], .wf-grid, .tableView, div");
    }

    // 2) section populado
    const sec = doc.querySelector(`[data-grid-name='${GRID_NAME}']`);
    if(sec && sec.querySelector("table,tr,.grid-record")){
      return sec;
    }

    return null;
  }

  async function waitForGrid(ctx, timeout=20000){
    const {doc} = ctx;
    const found = findGridInDoc(doc);
    if(found) return found;

    return new Promise(resolve=>{
      const obs = new MutationObserver(()=>{
        const g = findGridInDoc(doc);
        if(g){
          obs.disconnect();
          resolve(g);
        }
      });
      obs.observe(doc.body,{childList:true,subtree:true});
      setTimeout(()=>{
        obs.disconnect();
        resolve(null);
      },timeout);
    });
  }

  function bestContext(){
    const ctxs = collectContexts();
    for(const c of ctxs){
      if(findGridInDoc(c.doc)) return c;
    }
    return ctxs[0];
  }

  // =========================================
  // BOTÕES
  // =========================================
  function findInsertButton(ctx,grid){
    const near = grid.closest(".wf-group,fieldset,section,div")||grid;
    return (
      near.querySelector("button[aria-label='Inserir']") ||
      [...ctx.doc.querySelectorAll("button")].find(b =>
        b.querySelector("i.wf-icons")?.textContent.trim()==="add"
      )
    );
  }

  async function click(win,el){
    if(!el) return;
    el.scrollIntoView({block:"center"});
    el.dispatchEvent(new win.MouseEvent("mousedown",{bubbles:true}));
    el.click();
    el.dispatchEvent(new win.MouseEvent("mouseup",{bubbles:true}));
    await sleep(DELAY.short);
  }

  // =========================================
  // GRID HELPERS
  // =========================================
  function rows(grid){
    return [...grid.querySelectorAll("tr.grid-record.tableView")];
  }

  function maxRowId(grid){
    return rows(grid).reduce((m,tr)=>Math.max(m,Number(tr.id)||0),0);
  }

  function recCount(ctx){
    const el = ctx.doc.querySelector(REC_COUNT_SEL);
    return parseInt(el?.textContent||"0",10)||0;
  }

  async function waitNewRow(grid,ctx,oldMax,oldRec){
    for(let i=0;i<50;i++){
      if(maxRowId(grid)>oldMax || recCount(ctx)>oldRec) return true;
      await sleep(120);
    }
    return false;
  }

  async function editCell(ctx,tr,field,value){
    const td = tr.querySelector(`td[fieldname='${field}']`);
    if(!td) return;

    td.dispatchEvent(new ctx.win.MouseEvent("dblclick",{bubbles:true}));
    await sleep(80);

    const inp = tr.querySelector(`input[name='${field}']`);
    if(!inp) return;

    inp.value=value;
    inp.dispatchEvent(new ctx.win.Event("input",{bubbles:true}));
    inp.dispatchEvent(new ctx.win.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    await sleep(DELAY.short);
  }

  // =========================================
  // RUNNER
  // =========================================
  async function run(){
    const codes = Array.isArray(payload.codes) ? payload.codes : FALLBACK_CODES;
    if(!codes.length){
      log("warn","Nenhum código informado");
      return;
    }

    const ctx = bestContext();
    log("ok","Aguardando grid…");

    const grid = await waitForGrid(ctx);
    if(!grid){
      log("err","Grid não apareceu");
      return;
    }

    log("ok","Grid detectada");

    const btnInsert = findInsertButton(ctx,grid);
    if(!btnInsert){
      log("err","Botão Inserir não encontrado");
      return;
    }

    for(let i=0;i<codes.length;i++){
      const code = String(codes[i]);

      const oldMax = maxRowId(grid);
      const oldRec = recCount(ctx);

      await click(ctx.win,btnInsert);
      await waitNewRow(grid,ctx,oldMax,oldRec);

      const tr = rows(grid).slice(-1)[0];
      if(!tr){
        log("err","Linha não criada");
        break;
      }

      await editCell(ctx,tr,"TABELACOBRANCA",TABELA_PADRAO);
      await editCell(ctx,tr,"PROCEDIMENTO",code);
      await editCell(ctx,tr,"COBRADOQDE",QUANTIDADE_PADRAO);

      try{ ctx.win.Grid?.postRecord?.(GRID_NAME); }catch{}
      await sleep(PAUSA_ENTRE_CODIGOS);

      log("ok",`Inserido ${code} (${i+1}/${codes.length})`);
    }

    log("ok","🎉 Finalizado");
  }

  ui.btn.onclick = run;

  log("ok","Runner armado — abra ‘Demais Procedimentos’");
})();
