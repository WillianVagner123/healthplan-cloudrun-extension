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
  const GRID_HOST_SEL = `[data-grid-name='${GRID_NAME}']`;

  const DELAY = { tiny: 90, short: 180, mid: 320, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 260; // folga maior => menos "busy data channel"
  const TABELA_PADRAO = "22";
  const QUANTIDADE_PADRAO = "1";

  // se payload vier vazio, você pode colar codes aqui (opcional)
  const FALLBACK_CODES = [];

  // =========================================
  // UI + LOGS (sempre visível)
  // =========================================
  const LOGS = [];
  const nowTs = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `[${hh}:${mm}:${ss}]`;
  };

  function ensureUI() {
    const remove = (id) => { const el = document.getElementById(id); if (el) el.remove(); };

    // remove duplicatas antigas
    remove("hp_case_btn");
    remove("hp_case_wrap");

    const wrap = document.createElement("div");
    wrap.id = "hp_case_wrap";
    wrap.style.cssText = `
      position: fixed !important;
      right: 12px !important;
      bottom: 12px !important;
      width: 460px !important;
      max-width: calc(100vw - 24px) !important;
      z-index: 2147483647 !important;
      font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto !important;
      color: #fff !important;
      pointer-events: none !important;
    `;
    document.documentElement.appendChild(wrap);

    const head = document.createElement("div");
    head.id = "hp_case_head";
    head.style.cssText = `
      background: rgba(0,0,0,.80) !important;
      border-radius: 12px !important;
      padding: 10px 12px !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
      margin-bottom: 8px !important;
      pointer-events: auto !important;
    `;
    wrap.appendChild(head);

    const box = document.createElement("div");
    box.id = "hp_case_box";
    box.style.cssText = `
      background: rgba(0,0,0,.65) !important;
      border-radius: 12px !important;
      padding: 10px 12px !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.20) !important;
      max-height: 260px !important;
      overflow: auto !important;
      white-space: pre-wrap !important;
      word-break: break-word !important;
      pointer-events: auto !important;
    `;
    wrap.appendChild(box);

    const btn = document.createElement("button");
    btn.id = "hp_case_btn";
    btn.type = "button";
    btn.textContent = "⚡ Inserir Procedimentos";
    btn.style.cssText = `
      position: fixed !important;
      right: 12px !important;
      top: 12px !important;
      z-index: 2147483647 !important;
      padding: 12px 14px !important;
      border-radius: 14px !important;
      border: none !important;
      background: #0d6efd !important;
      color: #fff !important;
      font-weight: 800 !important;
      cursor: pointer !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
      user-select: none !important;
      pointer-events: auto !important;
    `;
    document.documentElement.appendChild(btn);

    return { wrap, head, box, btn };
  }

  const ui = ensureUI();

  function logLine(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(180);
    ui.box.textContent = LOGS.join("\n\n");
    ui.box.scrollTop = 0;
  }

  // =========================================
  // Helpers
  // =========================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el, win = window) {
    if (!el) return false;
    const st = win.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getClientRects?.();
    return !!(r && r.length);
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  }

  function safeQuery(doc, sel) {
    try { return doc.querySelector(sel); } catch { return null; }
  }

  // =========================================
  // 🔎 Descobrir o "contexto" certo (TOP + iframes recursivo)
  // =========================================
  function collectContexts(rootWin) {
    const out = [];
    const seen = new Set();

    function walk(w) {
      if (!w || seen.has(w)) return;
      seen.add(w);

      let doc = null;
      try { doc = w.document; } catch { doc = null; }
      if (doc) out.push({ win: w, doc });

      // varre iframes dentro desse doc
      let frames = [];
      try { frames = Array.from(doc.querySelectorAll("iframe")); } catch { frames = []; }

      for (const f of frames) {
        try {
          const cw = f.contentWindow;
          // só same-origin vai deixar acessar doc
          if (cw && cw.document) walk(cw);
        } catch {}
      }
    }

    walk(rootWin);
    return out;
  }

  function findBestContext() {
    const all = collectContexts(window.top || window);

    // pontua: tem grid host? visível? viewport maior?
    const scored = all.map(ctx => {
      const host = safeQuery(ctx.doc, GRID_HOST_SEL);
      const has = !!host;
      const vis = has ? isVisible(host, ctx.win) : false;
      const area = Math.max(1, ctx.win.innerWidth) * Math.max(1, ctx.win.innerHeight);
      const score = (has ? 1000 : 0) + (vis ? 500 : 0) + Math.min(5000000, area);
      return { ...ctx, host, has, vis, score };
    }).sort((a,b)=>b.score-a.score);

    return scored[0] || null;
  }

  function paintHeader(ctx) {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || "—";
    const hasGrid = !!ctx?.host;
    const visGrid = !!ctx?.vis;

    ui.head.innerHTML = `
      <b>${scope}</b>
      <div style="opacity:.92;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid: <b>${hasGrid ? (visGrid ? "detectado e visível ✅" : "detectado (mas não visível)") : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Dica: abra o grupo <b>“Demais Procedimentos”</b> e role até a grade aparecer.
      </div>
    `;
  }

  // =========================================
  // Lock global (no TOP) pra não travar / duplicar
  // =========================================
  const TOP = window.top || window;
  TOP.__HP_RUN_LOCKS__ = TOP.__HP_RUN_LOCKS__ || {};
  if (TOP.__HP_RUN_LOCKS__[scope] == null) TOP.__HP_RUN_LOCKS__[scope] = false;

  // =========================================
  // 🔘 Botões (novo layout): aria-label="Inserir"
  // =========================================
  function findInsertButton(gridHost) {
    if (!gridHost) return null;

    // mais forte: aria-label=Inserir
    let b = gridHost.querySelector(`button[aria-label='Inserir']`);
    if (b) return b;

    // fallback: ícone add
    const all = Array.from(gridHost.querySelectorAll("button"));
    b = all.find(x => (x.querySelector("i.wf-icons")?.textContent || "").trim() === "add");
    return b || null;
  }

  function findPostButton(gridHost) {
    if (!gridHost) return null;

    // tenta aria-label mais comuns
    const ariaCandidates = [
      "Confirmar", "Gravar", "Salvar", "Postar", "Concluir", "Aplicar"
    ];
    for (const a of ariaCandidates) {
      const b = gridHost.querySelector(`button[aria-label='${a}'], button[aria-label*='${a}']`);
      if (b) return b;
    }

    // fallback por ícone (done / check / save)
    const all = Array.from(gridHost.querySelectorAll("button"));
    const icon = (btn) => (btn.querySelector("i.wf-icons")?.textContent || "").trim();
    const b =
      all.find(x => ["done","check","save"].includes(icon(x))) ||
      null;

    return b;
  }

  async function clickStrong(win, el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    try {
      el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
      el.click();
      el.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
    } catch {
      try { el.click(); } catch {}
    }
    await sleep(DELAY.short);
    return true;
  }

  // =========================================
  // Linha / edição
  // =========================================
  function getRows(gridHost) {
    return Array.from(gridHost.querySelectorAll("tr.grid-record.tableView"));
  }
  function getMaxRowId(gridHost) {
    return getRows(gridHost).reduce((m,tr)=>Number.isFinite(+tr.id)?Math.max(m,+tr.id):m,-1);
  }
  function getRecCount(gridHost) {
    const el = gridHost.querySelector(`#${GRID_NAME}_gridPosition_rec_count`);
    const n = parseInt(el?.textContent || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  async function waitNewRow(gridHost, oldMax, oldRec) {
    for (let k=0;k<55;k++){
      const nMax = getMaxRowId(gridHost);
      const nRec = getRecCount(gridHost);
      if ((Number.isFinite(nMax) && nMax > oldMax) || (nRec && nRec > oldRec)) return true;
      await sleep(110);
    }
    return false;
  }

  async function pressEnter(win, el) {
    if (!el) return;
    el.focus?.();
    const fire = (type)=>el.dispatchEvent(new win.KeyboardEvent(type,{
      bubbles:true,cancelable:true,key:"Enter",code:"Enter",keyCode:13,which:13
    }));
    fire("keydown"); fire("keypress"); fire("keyup");
    el.dispatchEvent(new win.Event("change",{bubbles:true}));
    await sleep(DELAY.short);
    el.blur?.();
    await sleep(DELAY.short);
  }

  async function ensureCellEditorInRow(ctx, tr, fieldname) {
    const { win, doc } = ctx;
    if (!tr) return null;

    const td = tr.querySelector(`td.grid-cell.tableView[fieldname='${fieldname}']`);
    if (!td) return null;

    for (let i=0;i<12;i++){
      try {
        const W = win;
        W?.Input?.prepareCellEdition?.(GRID_NAME, td);
        W?.Input?.handleDoubleClickEvent?.(td, GRID_NAME, fieldname);
        W?.parent?.Input?.prepareCellEdition?.(GRID_NAME, td);
        W?.parent?.Input?.handleDoubleClickEvent?.(td, GRID_NAME, fieldname);
      } catch {}

      try {
        td.dispatchEvent(new win.MouseEvent("click",{bubbles:true}));
        td.dispatchEvent(new win.MouseEvent("dblclick",{bubbles:true}));
      } catch {}

      await sleep(70);

      const inp = tr.querySelector(`input[name='${fieldname}'].editingRecord`)
        || doc.querySelector(`input[name='${fieldname}'].editingRecord`);
      if (inp) return inp;
    }
    return null;
  }

  async function postRecord(ctx, gridHost) {
    const { win } = ctx;

    // 1) tenta botão
    const btnPost = findPostButton(gridHost);
    if (btnPost) await clickStrong(win, btnPost);

    // 2) tenta API interna
    try { win?.Grid?.postRecord?.(GRID_NAME); } catch {}
    try { win?.parent?.Grid?.postRecord?.(GRID_NAME); } catch {}

    await sleep(DELAY.long);

    // 3) fallback Ctrl+M
    ["keydown","keypress","keyup"].forEach(t => {
      try {
        win.document.dispatchEvent(new win.KeyboardEvent(t,{
          bubbles:true, key:"m", code:"KeyM", keyCode:77, which:77, ctrlKey:true
        }));
      } catch {}
    });

    await sleep(DELAY.short);
  }

  // =========================================
  // RUNNER
  // =========================================
  async function runInsercao() {
    const list = Array.isArray(payload.codes) ? payload.codes : (FALLBACK_CODES || []);
    if (!list.length) {
      logLine("warn", "Lista vazia. Rode pelo popup (payload.codes) ou preencha FALLBACK_CODES.");
      return;
    }

    if (TOP.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando (lock ativo).");
      return;
    }
    TOP.__HP_RUN_LOCKS__[scope] = true;

    try {
      logLine("ok", "Procurando o contexto certo (TOP/iframes)…");

      // espera até 60s o grid aparecer em algum lugar
      let ctx = null;
      for (let t=0; t<120; t++){
        ctx = findBestContext();
        paintHeader(ctx);
        if (ctx?.host) break;
        await sleep(500);
      }

      if (!ctx?.host) {
        logLine("err", "Não achei o grid em nenhum frame.", {
          dica: "Abra o SP-SADT, expanda “Demais Procedimentos” e role até a grade aparecer."
        });
        return;
      }

      const gridHost = ctx.host;

      // força visibilidade
      try { gridHost.scrollIntoView?.({ block: "center" }); } catch {}
      await sleep(DELAY.mid);

      const btnInsert = findInsertButton(gridHost);
      if (!btnInsert) {
        logLine("err", "Achei o grid, mas não achei o botão Inserir.", {
          dica: "Role um pouco; a barra do grid às vezes só monta quando fica visível."
        });
        return;
      }

      logLine("ok", "Contexto OK. Iniciando inserção…", {
        where: ctx.win === window ? "TOP" : "IFRAME",
        href: (() => { try { return ctx.win.location.href; } catch { return null; } })(),
        total: list.length
      });

      for (let idx=0; idx<list.length; idx++){
        const code = String(list[idx]);

        // backpressure extra para evitar "busy data channel"
        await sleep(200);

        const maxAntes = getMaxRowId(gridHost);
        const recAntes = getRecCount(gridHost);

        // clica Inserir
        await clickStrong(ctx.win, btnInsert);
        await sleep(DELAY.mid);

        const newRow = await waitNewRow(gridHost, maxAntes, recAntes);
        const tr = newRow
          ? gridHost.querySelector(`tr.grid-record.tableView[id='${getMaxRowId(gridHost)}']`)
          : getRows(gridHost).slice(-1)[0];

        if (!tr) {
          logLine("err", "Não consegui identificar a nova linha.", { code, idx: idx+1 });
          break;
        }

        // TABELA
        if (TABELA_PADRAO) {
          const tab = await ensureCellEditorInRow(ctx, tr, "TABELACOBRANCA");
          if (tab) {
            tab.value = TABELA_PADRAO;
            tab.dispatchEvent(new ctx.win.Event("input",{bubbles:true}));
            await pressEnter(ctx.win, tab);
          }
        }

        // PROCEDIMENTO
        const proc = await ensureCellEditorInRow(ctx, tr, "PROCEDIMENTO");
        if (!proc) {
          logLine("err", "Campo PROCEDIMENTO não entrou em edição.", { code });
          break;
        }
        proc.value = code;
        proc.dispatchEvent(new ctx.win.Event("input",{bubbles:true}));
        await pressEnter(ctx.win, proc);

        // QUANTIDADE
        for (let tent=0; tent<3; tent++){
          const qtd = await ensureCellEditorInRow(ctx, tr, "COBRADOQDE");
          if (qtd) {
            qtd.focus();
            qtd.select?.();
            qtd.value = QUANTIDADE_PADRAO;
            qtd.title = QUANTIDADE_PADRAO;
            // simula digitação (ajuda alguns grids)
            for (const c of QUANTIDADE_PADRAO) {
              qtd.dispatchEvent(new ctx.win.KeyboardEvent("keypress",{ key:c, bubbles:true }));
            }
            qtd.dispatchEvent(new ctx.win.Event("input",{bubbles:true}));
            await pressEnter(ctx.win, qtd);
            await sleep(160);
            if (qtd.value === QUANTIDADE_PADRAO || qtd.title === QUANTIDADE_PADRAO) break;
          }
          await sleep(220);
        }

        // CONFIRMAR / POST
        await postRecord(ctx, gridHost);

        logLine("ok", `Linha confirmada: ${code} (${idx+1}/${list.length})`);
        await sleep(PAUSA_ENTRE_CODIGOS);
      }

      logLine("ok", "🎉 Concluído!");
    } catch (e) {
      logLine("err", "Erro fatal no runner", { error: String(e?.message || e) });
    } finally {
      TOP.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================================
  // Botão
  // =========================================
  ui.btn.onclick = () => runInsercao();

  // =========================================
  // Watch (atualiza header sem piscar UI)
  // =========================================
  let last = 0;
  const tick = async () => {
    const now = Date.now();
    if (now - last < 800) return;
    last = now;
    const ctx = findBestContext();
    paintHeader(ctx);
  };

  setInterval(tick, 900);

  logLine("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.", {
    kitKey: payload.kitKey || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0
  });

  // pinta header inicial
  paintHeader(findBestContext());
})();
