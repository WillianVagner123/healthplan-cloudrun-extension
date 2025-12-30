/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "body"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  // =========================
  // CASEMBRAPA — Controller único no TOP (anti-pisca / anti-multi-frame)
  // =========================

  // Se consigo acessar o TOP (same-origin), garanto que só o TOP manda.
  let TOP;
  try { TOP = window.top; } catch { TOP = window; }

  // Se não sou o top, só saio. O top vai achar meu frame quando necessário.
  // (mesmo assim, deixo um "ping" opcional para ajudar o top a detectar que há frames ativos)
  if (TOP !== window) {
    try {
      TOP.__HP_CASEMBRAPA_PINGS__ = TOP.__HP_CASEMBRAPA_PINGS__ || 0;
      TOP.__HP_CASEMBRAPA_PINGS__++;
    } catch {}
    return;
  }

  // Se já existe controller, não duplica
  if (TOP.__HP_CASEMBRAPA_CONTROLLER__?.alive) return;

  const scope = "CASEMBRAPA";
  const payload = TOP.__HP_PAYLOAD__ || {}; // vem do popup (allFrames: true)
  const CODES = Array.isArray(payload.codes) ? payload.codes.map(String) : [];

  // ====== Config (do seu script antigo, com folga contra “busy data channel”)
  const DELAY = { tiny: 80, short: 150, mid: 250, long: 450 };
  const PAUSA_ENTRE_CODIGOS = 220;
  const TABELA_PADRAO = "22";
  const QUANTIDADE_PADRAO = "1";

  // ====== Seletores do grid / grupo
  const GRID_NAME = "gridSolicitacao_gridProcedimentosSimples";
  const GRID_HOST_SEL = `[data-grid-name='${GRID_NAME}']`;
  const GROUP_TITLE = "Demais Procedimentos";

  // ====== Estado
  const state = {
    alive: true,
    running: false,
    stop: false,
    lastTarget: null, // { win, doc, info }
  };

  // Exponho controller no top (pra não duplicar)
  TOP.__HP_CASEMBRAPA_CONTROLLER__ = state;

  // =========================
  // UI fixa (TOP)
  // =========================
  const LOGS = [];
  const nowTs = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `[${hh}:${mm}:${ss}]`;
  };

  function ensureUI() {
    // wrapper logs
    let wrap = document.getElementById("hp_case_wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hp_case_wrap";
      wrap.style.cssText = `
        position: fixed !important;
        right: 12px !important;
        bottom: 12px !important;
        width: 460px !important;
        max-width: calc(100vw - 24px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
        pointer-events: none !important;
      `;
      document.documentElement.appendChild(wrap);
    }

    // head
    let head = document.getElementById("hp_case_head");
    if (!head) {
      head = document.createElement("div");
      head.id = "hp_case_head";
      head.style.cssText = `
        background: rgba(0,0,0,.78) !important;
        border-radius: 12px !important;
        padding: 10px 12px !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
        margin-bottom: 8px !important;
        pointer-events: auto !important;
      `;
      wrap.appendChild(head);
    }

    // box
    let box = document.getElementById("hp_case_box");
    if (!box) {
      box = document.createElement("div");
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
    }

    // botão inserir
    let btn = document.getElementById("hp_case_btn");
    if (!btn) {
      btn = document.createElement("button");
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
    }

    // botão parar
    let stopBtn = document.getElementById("hp_case_stop");
    if (!stopBtn) {
      stopBtn = document.createElement("button");
      stopBtn.id = "hp_case_stop";
      stopBtn.type = "button";
      stopBtn.textContent = "⛔ Parar";
      stopBtn.style.cssText = `
        position: fixed !important;
        right: 12px !important;
        top: 56px !important;
        z-index: 2147483647 !important;
        padding: 10px 12px !important;
        border-radius: 14px !important;
        border: none !important;
        background: #dc3545 !important;
        color: #fff !important;
        font-weight: 800 !important;
        cursor: pointer !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
        user-select: none !important;
        pointer-events: auto !important;
        display: none !important;
      `;
      document.documentElement.appendChild(stopBtn);
    }

    return { wrap, head, box, btn, stopBtn };
  }

  const ui = ensureUI();

  function logLine(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(160);
    ui.box.textContent = LOGS.join("\n hookup \n\n");
    ui.box.scrollTop = 0;
  }

  function paintHeader(targetInfo = null) {
    const kit = payload.kitKey || payload.kit || "—";
    const codesCount = CODES.length || 0;
    const t = targetInfo || state.lastTarget?.info;

    ui.head.innerHTML = `
      <b>${scope}</b> • UI Controller (TOP) ✅
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Target: <b>${t?.label || "procurando…"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe o grupo <b>“${GROUP_TITLE}”</b> aberto e a grade visível. Clique no botão azul.
      </div>
    `;
  }

  // =========================
  // Helpers
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el, win = window) {
    if (!el) return false;
    const st = win.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getClientRects?.();
    return !!(r && r.length);
  }

  async function backpressure(ms = 250) {
    await delay(ms);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }

  function fireKey(doc, type, opts) {
    doc.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
  }

  // tenta achar API Input/Grid subindo até o top
  function findFrameworkApi(win) {
    let w = win;
    for (let i = 0; i < 6; i++) {
      if (w?.Input || w?.Grid) return { Input: w.Input, Grid: w.Grid };
      if (w === w.parent) break;
      w = w.parent;
    }
    return { Input: null, Grid: null };
  }

  // =========================
  // Descobrir o frame certo (varre frames same-origin)
  // =========================
  function listAllFrames(rootWin) {
    const out = [];
    const seen = new Set();

    function walk(w, depth) {
      if (!w || seen.has(w)) return;
      seen.add(w);

      out.push({ win: w, depth });

      let n = 0;
      try { n = w.frames?.length || 0; } catch { n = 0; }
      for (let i = 0; i < n; i++) {
        let child = null;
        try { child = w.frames[i]; } catch { child = null; }
        if (child) walk(child, depth + 1);
      }
    }

    walk(rootWin, 0);
    return out;
  }

  function scoreCandidate(win) {
    let doc;
    try { doc = win.document; } catch { return null; }

    // procura host do grid (o container do wf-grid)
    const host = doc.querySelector(GRID_HOST_SEL);
    if (!host) return { win, doc, host: null, gridEl: null, score: 0, label: "sem host ainda" };

    // tenta achar o “grid real” por id (às vezes nasce depois)
    const gridEl =
      doc.getElementById(GRID_NAME) ||
      host.querySelector(`#${GRID_NAME}`) ||
      null;

    // peso por visibilidade / viewport
    const vw = Math.max(0, win.innerWidth || 0);
    const vh = Math.max(0, win.innerHeight || 0);
    const area = Math.min(6_000_000, vw * vh);

    const hostVisible = isVisible(host, win);
    const gridVisible = gridEl ? isVisible(gridEl, win) : false;

    let score = 100 + area;
    if (hostVisible) score += 1000;
    if (gridVisible) score += 2000;

    const label = gridVisible
      ? `grid visível (${vw}x${vh})`
      : hostVisible
      ? `host visível (${vw}x${vh})`
      : `host existe, mas não visível (${vw}x${vh})`;

    return { win, doc, host, gridEl, score, label };
  }

  function pickBestTarget() {
    const frames = listAllFrames(window);
    let best = null;

    for (const f of frames) {
      const c = scoreCandidate(f.win);
      if (!c) continue;
      if (!best || c.score > best.score) best = c;
    }

    if (best) {
      state.lastTarget = { win: best.win, doc: best.doc, host: best.host, gridEl: best.gridEl, info: best };
      paintHeader(best);
    }
    return best;
  }

  // =========================
  // Botões Inserir / Post do grid
  // =========================
  function findInsertButton(gridRoot, doc) {
    if (!gridRoot) return null;

    // seu caso: aria-label="Inserir" com ícone add
    const byAria = gridRoot.querySelector(`button[aria-label="Inserir"]`);
    if (byAria) return byAria;

    // legado
    const legacy = gridRoot.querySelector("#insertButton");
    if (legacy) return legacy;

    // heurística: botão com ícone "add"
    const btns = Array.from(gridRoot.querySelectorAll("button"));
    for (const b of btns) {
      const icon = b.querySelector("i.wf-icons");
      const txt = (icon?.textContent || "").trim().toLowerCase();
      if (txt === "add") return b;
    }

    // tentativa fora do gridRoot (às vezes toolbar fica fora do nó que você pegou)
    const any = doc.querySelector(`button[aria-label="Inserir"]`) || doc.querySelector("#insertButton");
    return any || null;
  }

  function findPostButton(gridRoot, doc) {
    if (!gridRoot) return null;

    const legacy = gridRoot.querySelector("#postButton");
    if (legacy) return legacy;

    // heurística por aria-label
    const aria = Array.from(gridRoot.querySelectorAll("button[aria-label]"))
      .find(b => /confirmar|salvar|gravar|post|concluir|ok/i.test(b.getAttribute("aria-label") || ""));
    if (aria) return aria;

    // heurística por ícone "check"
    const btns = Array.from(gridRoot.querySelectorAll("button"));
    for (const b of btns) {
      const icon = b.querySelector("i.wf-icons");
      const txt = (icon?.textContent || "").trim().toLowerCase();
      if (txt === "check" || txt === "done") return b;
    }

    // tentativa fora
    const any =
      doc.querySelector("#postButton") ||
      Array.from(doc.querySelectorAll("button[aria-label]"))
        .find(b => /confirmar|salvar|gravar|post|concluir|ok/i.test(b.getAttribute("aria-label") || "")) ||
      null;
    return any;
  }

  function getGridRoot(candidate) {
    // prioridade: gridEl (id) > host (data-grid-name)
    return candidate.gridEl || candidate.host || null;
  }

  // =========================
  // Edição da célula (reaproveita seu método antigo)
  // =========================
  async function pressEnterIn(win, el) {
    if (!el) return;
    el.focus?.();

    const fire = (type) =>
      el.dispatchEvent(
        new win.KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
        })
      );

    fire("keydown"); fire("keypress"); fire("keyup");
    el.dispatchEvent(new win.Event("change", { bubbles: true }));
    await delay(DELAY.short);
    el.blur?.();
    await delay(DELAY.short);
  }

  async function ensureCellEditorInRow(win, gridId, tr, fieldname) {
    if (!tr) return null;
    const td = tr.querySelector(`td.grid-cell.tableView[fieldname='${fieldname}']`);
    if (!td) return null;

    const { Input } = findFrameworkApi(win);
    for (let i = 0; i < 12; i++) {
      try {
        Input?.prepareCellEdition?.(gridId, td);
        Input?.handleDoubleClickEvent?.(td, gridId, fieldname);
      } catch {}

      td.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      td.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
      await delay(60);

      const inp = tr.querySelector(`input[name='${fieldname}'].editingRecord`) ||
                  win.document.querySelector(`input[name='${fieldname}'].editingRecord`);
      if (inp) return inp;
    }
    return null;
  }

  function getRows(gridRoot) {
    return Array.from(gridRoot.querySelectorAll("tr.grid-record.tableView"));
  }
  function getMaxRowId(gridRoot) {
    const rows = getRows(gridRoot);
    return rows.reduce((m, tr) => (Number.isFinite(+tr.id) ? Math.max(m, +tr.id) : m), -1);
  }

  async function waitNewRow(gridRoot, oldMax, win) {
    for (let k = 0; k < 60; k++) {
      const nMax = getMaxRowId(gridRoot);
      if (Number.isFinite(nMax) && nMax > oldMax) return true;
      await delay(80);
    }
    return false;
  }

  async function click(win, el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    el.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true }));
    el.click();
    el.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
    await delay(DELAY.short);
    return true;
  }

  async function confirmarLinha(win, gridId, gridRoot) {
    const doc = win.document;
    const btnPost = findPostButton(gridRoot, doc);
    if (btnPost) await click(win, btnPost);

    // tenta via Grid.postRecord (igual seu antigo)
    const { Grid } = findFrameworkApi(win);
    try { Grid?.postRecord?.(gridId); } catch {}

    await delay(DELAY.long);

    // fallback Ctrl+M (no doc do frame)
    ["keydown", "keypress", "keyup"].forEach((t) => {
      doc.dispatchEvent(
        new win.KeyboardEvent(t, {
          bubbles: true,
          key: "m",
          code: "KeyM",
          keyCode: 77,
          which: 77,
          ctrlKey: true,
        })
      );
    });

    await delay(DELAY.short);
  }

  // =========================
  // Runner principal (usando sua lógica que funciona no console)
  // =========================
  async function runCase() {
    if (state.running) {
      logLine("warn", "Já executando…");
      return;
    }
    if (!CODES.length) {
      logLine("err", "Nenhum código no payload (payload.codes vazio).", { dica: "Selecione o kit no popup e clique Executar Kit." });
      return;
    }

    state.stop = false;
    state.running = true;
    ui.stopBtn.style.display = "block";

    try {
      logLine("ok", "Preparando… (buscando frame com grid visível)");
      let cand = null;

      // espera até 60s o grid “aparecer” em algum frame
      for (let t = 0; t < 240; t++) {
        cand = pickBestTarget();
        const gridRoot = cand ? getGridRoot(cand) : null;
        if (cand && gridRoot && isVisible(gridRoot, cand.win)) break;
        await delay(250);
        if (state.stop) throw new Error("Parado pelo usuário");
      }

      if (!cand) {
        logLine("err", "Não encontrei nenhum frame acessível.");
        return;
      }

      const win = cand.win;
      const doc = cand.doc;

      // gridRoot (host ou id)
      const gridRoot = getGridRoot(cand);
      if (!gridRoot) {
        logLine("err", "Grid host não encontrado. Abra a tela SP-SADT e deixe “Demais Procedimentos” visível.");
        return;
      }

      // tenta achar o grid real por id (algumas vezes ele nasce depois)
      const gridId = GRID_NAME;
      const gridEl =
        doc.getElementById(gridId) ||
        gridRoot.querySelector(`#${gridId}`) ||
        gridRoot;

      // acha botão inserir
      const btnInsert = findInsertButton(gridEl, doc);
      if (!btnInsert) {
        logLine("err", "Não achei o botão Inserir dentro do grid.", {
          dica: "Confirme se o grid “Demais Procedimentos” é o de cima (não o de Insumos).",
          selector: `button[aria-label="Inserir"] / #insertButton`,
        });
        return;
      }

      logLine("ok", "Grid OK. Iniciando inserção…", {
        frameHref: (() => { try { return win.location.href; } catch { return null; } })(),
        total: CODES.length,
        tabela: TABELA_PADRAO,
        qtd: QUANTIDADE_PADRAO,
      });

      for (let idx = 0; idx < CODES.length; idx++) {
        if (state.stop) throw new Error("Parado pelo usuário");

        const code = String(CODES[idx]);

        // cria nova linha
        const oldMax = getMaxRowId(gridEl);
        await click(win, btnInsert);
        await delay(DELAY.mid);

        const okNew = await waitNewRow(gridEl, oldMax, win);
        const tr = okNew
          ? gridEl.querySelector(`tr.grid-record.tableView[id='${getMaxRowId(gridEl)}']`)
          : getRows(gridEl).slice(-1)[0];

        if (!tr) {
          logLine("err", "Não consegui identificar a nova linha.", { code, idx: idx + 1 });
          break;
        }

        // TABELA
        if (TABELA_PADRAO) {
          const tab = await ensureCellEditorInRow(win, gridId, tr, "TABELACOBRANCA");
          if (tab) {
            tab.value = TABELA_PADRAO;
            tab.dispatchEvent(new win.Event("input", { bubbles: true }));
            await pressEnterIn(win, tab);
          }
        }

        // PROCEDIMENTO
        const proc = await ensureCellEditorInRow(win, gridId, tr, "PROCEDIMENTO");
        if (!proc) {
          logLine("err", "Campo PROCEDIMENTO não abriu.", { code });
          break;
        }
        proc.value = code;
        proc.dispatchEvent(new win.Event("input", { bubbles: true }));
        await pressEnterIn(win, proc);

        // QUANTIDADE
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await ensureCellEditorInRow(win, gridId, tr, "COBRADOQDE");
          if (qtd) {
            qtd.focus();
            qtd.select?.();
            qtd.value = QUANTIDADE_PADRAO;
            qtd.title = QUANTIDADE_PADRAO;

            for (const c of QUANTIDADE_PADRAO) {
              qtd.dispatchEvent(new win.KeyboardEvent("keypress", { key: c, bubbles: true }));
            }
            qtd.dispatchEvent(new win.Event("input", { bubbles: true }));
            await pressEnterIn(win, qtd);
            await delay(150);

            if (qtd.value === QUANTIDADE_PADRAO || qtd.title === QUANTIDADE_PADRAO) break;
          }
          await delay(200);
        }

        // POST/CONFIRMA
        await confirmarLinha(win, gridId, gridEl);
        await delay(PAUSA_ENTRE_CODIGOS);

        logLine("ok", `Linha confirmada (${idx + 1}/${CODES.length})`, { code });

        // solta o event loop pra não “travar” a página
        await backpressure(120);
      }

      logLine("ok", "Concluído 🎉");
    } catch (e) {
      logLine("err", "Execução interrompida", { error: String(e?.message || e) });
    } finally {
      state.running = false;
      state.stop = false;
      ui.stopBtn.style.display = "none";
    }
  }

  // =========================
  // Botões
  // =========================
  ui.btn.onclick = async () => {
    logLine("ok", "Clique no botão recebido.", { codes: CODES.length, kitKey: payload.kitKey || payload.kit || null });
    await runCase();
  };

  ui.stopBtn.onclick = () => {
    state.stop = true;
    logLine("warn", "Parando… (vai interromper no próximo passo seguro)");
  };

  // =========================
  // Watcher leve (atualiza target)
  // =========================
  paintHeader();
  logLine("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.", {
    href: location.href,
    kitKey: payload.kitKey || payload.kit || null,
    codes: CODES.length,
  });

  const timer = setInterval(() => {
    if (!state.alive) return clearInterval(timer);
    // atualiza target de tempos em tempos sem brigar com frames
    pickBestTarget();
  }, 900);
})();
