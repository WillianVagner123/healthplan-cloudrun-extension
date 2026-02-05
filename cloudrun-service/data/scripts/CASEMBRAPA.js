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
  const GRID_NAME_PARTIAL = "gridProcedimentosSimples";
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

  function setBtnRunning(isRunning) {
    ui.btn.disabled = !!isRunning;
    ui.btn.style.opacity = isRunning ? "0.65" : "1";
    ui.btn.style.cursor = isRunning ? "not-allowed" : "pointer";
    ui.btn.textContent = isRunning ? "⏳ Inserindo..." : "⚡ Inserir Procedimentos";
  }

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

  function safeQuery(doc, sel) {
    try { return doc.querySelector(sel); } catch { return null; }
  }

  function safeAll(doc, sel) {
    try { return Array.from(doc.querySelectorAll(sel)); } catch { return []; }
  }

  // =========================================
  // 🔎 Detectar GRID por múltiplas estratégias
  // =========================================
  const GRID_HOST_PRIMARY = `[data-grid-name='${GRID_NAME}']`;
  const REC_COUNT_SEL = `#${GRID_NAME}_gridPosition_rec_count`;

  function findGridHostInDoc(doc) {
    if (!doc) return null;

    // 1) melhor caso: data-grid-name
    let host = safeQuery(doc, GRID_HOST_PRIMARY);
    if (host) return host;

    // 2) por id (alguns ambientes usam id no container)
    host = safeQuery(doc, `#${GRID_NAME}`);
    if (host) return host;

    // 3) por prefixo/id parcial
    host = safeQuery(doc, `[id*='${GRID_NAME_PARTIAL}']`);
    if (host) return host;

    // 4) pelo rec_count (bem típico do seu grid)
    const rc = safeQuery(doc, REC_COUNT_SEL);
    if (rc) {
      // tenta subir para um container que pareça a área do grid
      const up = rc.closest(`[data-grid-name], [id*='${GRID_NAME}'], .wf-grid, .grid, .tableView, div`);
      if (up) return up;
    }

    // 5) fallback por “cara” da grade (colunas conhecidas)
    const tables = safeAll(doc, "table");
    for (const t of tables) {
      const txt = (t.innerText || "").toLowerCase();
      if (
        txt.includes("tabela") &&
        (txt.includes("código do procedimento") || txt.includes("codigo do procedimento") || txt.includes("item assistencial"))
      ) {
        const up = t.closest(`[data-grid-name], .wf-grid, .grid, .tableView, div`) || t;
        return up;
      }
    }

    return null;
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

      let frames = [];
      try { frames = Array.from(doc.querySelectorAll("iframe")); } catch { frames = []; }

      for (const f of frames) {
        try {
          const cw = f.contentWindow;
          if (cw && cw.document) walk(cw);
        } catch {}
      }
    }

    walk(rootWin);
    return out;
  }

  function findBestContext() {
    const all = collectContexts(window.top || window);

    const scored = all.map(ctx => {
      const host = findGridHostInDoc(ctx.doc);
      const has = !!host;
      const vis = has ? isVisible(host, ctx.win) : false;
      const area = Math.max(1, ctx.win.innerWidth) * Math.max(1, ctx.win.innerHeight);
      const score = (has ? 1000 : 0) + (vis ? 600 : 0) + Math.min(5000000, area);
      return { ...ctx, host, has, vis, score };
    }).sort((a,b)=>b.score-a.score);

    return scored[0] || null;
  }

  function paintHeader(ctx) {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || "—";
    const hasGrid = !!ctx?.host;
    const visGrid = !!ctx?.vis;

    const TOP = window.top || window;
    const running = !!(TOP.__HP_RUN_LOCKS__ && TOP.__HP_RUN_LOCKS__[scope]);

    ui.head.innerHTML = `
      <b>${scope}</b>
      <div style="opacity:.92;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Status: <b>${running ? "executando ⏳" : "pronto ✅"}</b><br/>
        Grid: <b>${hasGrid ? (visGrid ? "detectado e visível ✅" : "detectado (mas não visível)") : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Dica: abra o grupo <b>“Demais Procedimentos”</b> e role até a grade aparecer.
      </div>
    `;
  }

  // =========================================
  // Lock global (no TOP)
  // =========================================
  const TOP = window.top || window;
  TOP.__HP_RUN_LOCKS__ = TOP.__HP_RUN_LOCKS__ || {};
  if (TOP.__HP_RUN_LOCKS__[scope] == null) TOP.__HP_RUN_LOCKS__[scope] = false;

  // =========================================
  // 🔘 Botões (Inserir / Post) — agora procura também fora do gridHost
  // =========================================
  function findNearestContainer(gridHost) {
    if (!gridHost) return null;
    return (
      gridHost.closest(".wf-group, .wf-panel, .panel, fieldset, section, .card, .container, div") ||
      gridHost.parentElement ||
      gridHost
    );
  }

  // Substitua ou adicione dentro da função findInsertButton
function findInsertButton(ctx, gridHost) {
  const doc = ctx?.doc || document;
  
  // 1. Tenta pelo seletor padrão de toolbar do WF
  let b = doc.querySelector(".wf-grid-toolbar button[aria-label='Inserir']") || 
          doc.querySelector("button[aria-label='Inserir']");
  if (b) return b;

  // 2. Tenta encontrar pelo ícone "add" (comum no Casembrapa)
  const icons = Array.from(doc.querySelectorAll(".wf-icons"));
  const addIcon = icons.find(i => i.textContent.trim() === "add");
  if (addIcon) return addIcon.closest("button");

  // 3. Busca por texto "Inserir" em qualquer botão
  const buttons = Array.from(doc.querySelectorAll("button"));
  return buttons.find(btn => btn.textContent.trim().toLowerCase() === "inserir");
}

    // 3) último fallback: procurar no documento do contexto inteiro
    const doc = ctx?.doc || document;
    b = doc.querySelector(`button[aria-label='Inserir']`);
    if (b) return b;

    const all = Array.from(doc.querySelectorAll("button"));
    b = all.find(x => (x.querySelector("i.wf-icons")?.textContent || "").trim() === "add");
    return b || null;
  }

  function findPostButton(ctx, gridHost) {
    if (!gridHost) return null;

    const ariaCandidates = ["Confirmar", "Gravar", "Salvar", "Postar", "Concluir", "Aplicar"];

    // 1) dentro do host
    for (const a of ariaCandidates) {
      const b = gridHost.querySelector(`button[aria-label='${a}'], button[aria-label*='${a}']`);
      if (b) return b;
    }

    // 2) perto do host
    const near = findNearestContainer(gridHost);
    if (near) {
      for (const a of ariaCandidates) {
        const b = near.querySelector(`button[aria-label='${a}'], button[aria-label*='${a}']`);
        if (b) return b;
      }
    }

    // 3) fallback por ícone
    const doc = ctx?.doc || document;
    const all = Array.from(doc.querySelectorAll("button"));
    const icon = (btn) => (btn.querySelector("i.wf-icons")?.textContent || "").trim();
    return all.find(x => ["done","check","save"].includes(icon(x))) || null;
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
    const el = gridHost.querySelector(REC_COUNT_SEL) || document.querySelector(REC_COUNT_SEL);
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
  const td = tr.querySelector(`td[fieldname='${fieldname}']`);
  if (!td) return null;

  td.scrollIntoView({ block: 'center', behavior: 'instant' });
  await sleep(100);

  for (let i = 0; i < 8; i++) {
    // Sequência completa de eventos para enganar o sistema
    const events = ['mousedown', 'mouseup', 'click', 'dblclick'];
    events.forEach(evtType => {
      td.dispatchEvent(new MouseEvent(evtType, {
        bubbles: true,
        cancelable: true,
        view: ctx.win,
        detail: evtType === 'dblclick' ? 2 : 1
      }));
    });

    await sleep(250); // Tempo para o servidor processar a mudança de estado

    // O input pode aparecer com várias classes diferentes no WF
    const inp = tr.querySelector(`input[name='${fieldname}']`) || 
                tr.querySelector(`.editingRecord input`) ||
                tr.querySelector(`input.wf-input`);
    
    if (inp) {
      inp.focus();
      // Garante que o cursor está no campo
      inp.dispatchEvent(new Event('focus', { bubbles: true }));
      return inp;
    }
  }
  return null;
}

async function forceFocus(el) {
  el.focus();
  el.dispatchEvent(new Event('focus', { bubbles: true }));
}
  async function postRecord(ctx, gridHost) {
    const { win } = ctx;

    const btnPost = findPostButton(ctx, gridHost);
    if (btnPost) await clickStrong(win, btnPost);

    try { win?.Grid?.postRecord?.(GRID_NAME); } catch {}
    try { win?.parent?.Grid?.postRecord?.(GRID_NAME); } catch {}

    await sleep(DELAY.long);

    // fallback Ctrl+M
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
    setBtnRunning(true);

    try {
      logLine("ok", "Procurando o contexto certo (TOP/iframes)…");

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

      try { gridHost.scrollIntoView?.({ block: "center" }); } catch {}
      await sleep(DELAY.mid);

      const btnInsert = findInsertButton(ctx, gridHost);
      if (!btnInsert) {
        logLine("err", "Achei a área da grade, mas não achei o botão Inserir.", {
          dica: "Ele pode estar na toolbar do bloco. Com este runner ele já tenta fora do grid também — se falhar, me manda um print mais aproximado da toolbar."
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

        await sleep(200);

        const maxAntes = getMaxRowId(gridHost);
        const recAntes = getRecCount(gridHost);

        await clickStrong(ctx.win, btnInsert);
        await sleep(DELAY.mid);
          // Re-checar se o grid ainda está visível
          if (!isVisible(gridHost, ctx.win)) {
              logLine("warn", "Grid sumiu ou recarregou. Tentando re-detectar...");
              const retryCtx = findBestContext();
              if (retryCtx) ctx = retryCtx;
          }

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

        await postRecord(ctx, gridHost);

        logLine("ok", `Linha confirmada: ${code} (${idx+1}/${list.length})`);
        await sleep(PAUSA_ENTRE_CODIGOS);
      }

      logLine("ok", "🎉 Concluído!");
    } catch (e) {
      logLine("err", "Erro fatal no runner", { error: String(e?.message || e) });
    } finally {
      TOP.__HP_RUN_LOCKS__[scope] = false;
      setBtnRunning(false);
      paintHeader(findBestContext());
    }
  }

  // =========================================
  // Botão
  // =========================================
  ui.btn.onclick = () => runInsercao();

  // =========================================
  // Watch (atualiza header)
  // =========================================
  let last = 0;
  const tick = async () => {
    const now = Date.now();
    if (now - last < 800) return;
    last = now;
    paintHeader(findBestContext());
  };

  setInterval(tick, 900);

  logLine("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.", {
    kitKey: payload.kitKey || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0
  });

  paintHeader(findBestContext());
})();
