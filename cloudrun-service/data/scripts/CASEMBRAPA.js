/*@maskara{
  "mustUrlIncludes": ["casembrapa", "prestador.casembrapa.org.br"],
  "detectAny": [
    "body"
  ],
  "actions": { "focus": "body" }
}*/

/**
 * CASEMBRAPA — Runner v3 (TOP controller + worker no frame certo)
 * ✅ Não pisca: UI fixa só no TOP
 * ✅ Seleciona automaticamente o frame que realmente tem o grid visível
 * ✅ Clica no botão real: <button aria-label="Inserir"> (mdc-icon-button)
 * ✅ Mantém compatibilidade com o "console script" (Input/Grid APIs + editingRecord)
 *
 * Requisitos:
 * - Popup injeta em ALL_FRAMES (como você já tem; logs mostram frames: 2)
 * - O payload vem em window.__HP_PAYLOAD__ com { kitKey, codes[] }
 */
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";
  const BC_NAME = "HP_CASEMBRAPA_V3";
  const bc = new BroadcastChannel(BC_NAME);

  // =========================
  // CONFIG
  // =========================
  const CFG = {
    gridName: "gridSolicitacao_gridProcedimentosSimples",
    gridHostSel: "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    groupTitle: "Demais Procedimentos",

    tabelaPadrao: "22",
    qtdPadrao: "1",

    // delays mais “folgados” (evita travar / busy channel)
    delay: { tiny: 80, short: 150, mid: 260, long: 450 },
    pausaEntreCodigos: 220,
    maxRetriesInsert: 3,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const backpressure = async (ms) => { await sleep(ms); await raf(); };

  // =========================
  // IDs / flags
  // =========================
  const myId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const isTop = (() => { try { return window.top === window; } catch { return false; } })();

  // STOP cooperativo
  window.__HP_ABORT__ = window.__HP_ABORT__ || {};
  window.__HP_ABORT__[scope] = false;

  // LOCK por frame (worker)
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] == null) window.__HP_RUN_LOCKS__[scope] = false;

  // =========================
  // DOM helpers
  // =========================
  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getClientRects?.();
    return !!(r && r.length);
  }

  function qs(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (window.__HP_ABORT__[scope]) return null;
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  async function click(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.click();
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await sleep(CFG.delay.short);
    return true;
  }

  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fireK = (t) =>
      el.dispatchEvent(new KeyboardEvent(t, {
        bubbles: true, cancelable: true,
        key: "Enter", code: "Enter", keyCode: 13, which: 13
      }));
    fireK("keydown"); fireK("keypress"); fireK("keyup");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(CFG.delay.short);
    el.blur?.();
    await sleep(CFG.delay.short);
  }

  async function setValueAndEnter(el, value) {
    el.focus?.();
    el.value = "";
    fire(el, "input"); fire(el, "change");
    await sleep(CFG.delay.tiny);

    el.value = String(value);
    fire(el, "input"); fire(el, "change");
    await pressEnter(el);
  }

  // tenta detectar overlays/spinners comuns
  async function waitBusyOff(timeoutMs = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (window.__HP_ABORT__[scope]) return false;

      const dvAguarde = document.getElementById("dvAguarde");
      const overlay1 = qs(".wf-overlay, .wf-busy, .wf-loading");
      const prog = qs(".mdc-linear-progress, .mdc-circular-progress");

      const on =
        (dvAguarde && isVisible(dvAguarde) && getComputedStyle(dvAguarde).display !== "none") ||
        (overlay1 && isVisible(overlay1)) ||
        (prog && isVisible(prog));

      if (!on) return true;
      await sleep(180);
    }
    return false;
  }

  // =========================
  // ENCONTRAR BOTÕES NOVOS (mdc)
  // =========================
  function findGridHost() {
    // o host é um <section data-grid-name="...">
    return qs(CFG.gridHostSel);
  }

  function findInsertBtnNearHost(host) {
    if (!host) return null;

    // o botão "Inserir" costuma ficar na barra do grid (mesma região do host)
    const root = host.closest(".wf-form-view__cell--detail-grid") || host.parentElement || document;

    // 1) novo padrão (mdc icon button)
    const byAria = qs(`button[aria-label="Inserir"]`, root);
    if (byAria) return byAria;

    // 2) fallback: ícone "add" dentro de botão
    const iconAdd = qsa("button .wf-icons", root).find(i => (i.textContent || "").trim() === "add");
    if (iconAdd?.closest("button")) return iconAdd.closest("button");

    // 3) compat antigo
    const old = qs("#insertButton", root) || qs("#insertButton", host);
    if (old) return old;

    return null;
  }

  function findPostBtnNearHost(host) {
    if (!host) return null;
    const root = host.closest(".wf-form-view__cell--detail-grid") || host.parentElement || document;

    // Alguns portais usam “Confirmar”, “Salvar”, “Postar” etc.
    const labels = ["Confirmar", "Salvar", "Gravar", "Postar", "Concluir"];
    for (const lb of labels) {
      const b = qs(`button[aria-label="${lb}"]`, root);
      if (b) return b;
    }

    // ícone “check” às vezes
    const iconCheck = qsa("button .wf-icons", root).find(i => (i.textContent || "").trim() === "check");
    if (iconCheck?.closest("button")) return iconCheck.closest("button");

    // compat antigo
    const old = qs("#postButton", root) || qs("#postButton", host);
    if (old) return old;

    return null;
  }

  // =========================
  // LOG (worker -> TOP)
  // =========================
  function sendLog(level, msg, data) {
    bc.postMessage({ t: "LOG", from: myId, level, msg, data: data || null, ts: Date.now() });
  }

  // =========================
  // WORKER: executa no frame que tem o grid real
  // =========================
  function workerScore() {
    const host = findGridHost();
    if (!host) return 0;

    // pontua mais se visível e se botões existem
    let s = 10;
    if (isVisible(host)) s += 100;
    if (findInsertBtnNearHost(host)) s += 80;
    if (findPostBtnNearHost(host)) s += 30;

    // viewport: frames “invisíveis” costumam ter area pequena
    s += Math.min(300, Math.floor((window.innerWidth * window.innerHeight) / 5000));
    return s;
  }

  function workerStatus() {
    const host = findGridHost();
    const insertBtn = host ? findInsertBtnNearHost(host) : null;
    const postBtn = host ? findPostBtnNearHost(host) : null;

    return {
      id: myId,
      href: location.href,
      isTop,
      hasHost: !!host,
      hostVisible: host ? isVisible(host) : false,
      hasInsert: !!insertBtn,
      hasPost: !!postBtn,
      score: workerScore(),
    };
  }

  async function ensureCellEditorInRow(tr, fieldname) {
    if (!tr) return null;

    const gridId = CFG.gridName;
    const td = tr.querySelector(`td.grid-cell.tableView[fieldname='${fieldname}']`);
    if (!td) return null;

    for (let i = 0; i < 10; i++) {
      if (window.__HP_ABORT__[scope]) return null;

      try {
        // às vezes está em window, às vezes em parent
        const Input = window.Input || window.parent?.Input;
        Input?.prepareCellEdition?.(gridId, td);
        Input?.handleDoubleClickEvent?.(td, gridId, fieldname);
      } catch {}

      td.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      td.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await sleep(60);

      const inp = tr.querySelector(`input[name='${fieldname}'].editingRecord`);
      if (inp) return inp;
    }
    return null;
  }

  function getRows(gridEl) {
    return Array.from(gridEl.querySelectorAll("tr.grid-record.tableView"));
  }
  function getMaxRowId(gridEl) {
    return getRows(gridEl).reduce((m, tr) => (Number.isFinite(+tr.id) ? Math.max(m, +tr.id) : m), -1);
  }
  function getRecCount(gridEl, gridId) {
    return parseInt(gridEl.querySelector(`#${gridId}_gridPosition_rec_count`)?.textContent || "0", 10);
  }

  async function waitNewRow(gridEl, gridId, oldMax, oldRec) {
    for (let k = 0; k < 40; k++) {
      if (window.__HP_ABORT__[scope]) return false;
      const nMax = getMaxRowId(gridEl);
      const nRec = getRecCount(gridEl, gridId);
      if ((Number.isFinite(nMax) && nMax > oldMax) || (nRec && nRec > oldRec)) return true;
      await sleep(120);
    }
    return false;
  }

  async function workerRun(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      sendLog("warn", "Lista vazia (codes).");
      return;
    }

    if (window.__HP_RUN_LOCKS__[scope]) {
      sendLog("warn", "Worker já está executando.");
      return;
    }

    const host = findGridHost();
    if (!host || !isVisible(host)) {
      sendLog("err", "Grid host não está visível neste frame (worker).", workerStatus());
      return;
    }

    // O grid “real” que tinha no seu console era por id (antigo).
    // Aqui tentamos achar um elemento com id=gridName ou “subgrid” dentro do mesmo root.
    const gridId = CFG.gridName;
    const root = host.closest(".wf-form-view__cell--detail-grid") || document;
    const gridEl =
      document.getElementById(gridId) ||
      qs(`#${gridId}`, root) ||
      qs(`section[data-grid-name="${gridId}"]`, root) ||
      host;

    // botões
    const btnInsert = findInsertBtnNearHost(host);
    const btnPost = findPostBtnNearHost(host);

    // Se não achar insert, ainda tentamos atalhos (mas o ideal é aria-label Inserir)
    window.__HP_RUN_LOCKS__[scope] = true;
    window.__HP_ABORT__[scope] = false;

    try {
      sendLog("ok", "Worker iniciando inserção…", { total: list.length, worker: workerStatus() });
      await waitBusyOff(45000);

      for (let idx = 0; idx < list.length; idx++) {
        if (window.__HP_ABORT__[scope]) {
          sendLog("warn", "Execução interrompida (STOP).");
          break;
        }

        const code = String(list[idx]);
        sendLog("info", `Inserindo (${idx + 1}/${list.length})`, { code });

        // 1) abrir nova linha
        let opened = false;
        for (let t = 0; t < CFG.maxRetriesInsert; t++) {
          if (window.__HP_ABORT__[scope]) break;

          // preferir click no botão Inserir
          if (btnInsert) {
            const maxAntes = getMaxRowId(gridEl);
            const recAntes = getRecCount(gridEl, gridId);

            await click(btnInsert);
            await backpressure(CFG.delay.mid);

            const newRow = await waitNewRow(gridEl, gridId, maxAntes, recAntes);
            if (newRow) { opened = true; break; }

            // se não detectou por DOM, ainda pode ter aberto editor direto
            const procNow = qs("input[name='PROCEDIMENTO'].editingRecord", document);
            if (procNow) { opened = true; break; }
          }

          // fallback: tentativa via atalhos
          document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Insert", code: "Insert" }));
          document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Insert", code: "Insert" }));
          await backpressure(CFG.delay.mid);

          const procNow2 = qs("input[name='PROCEDIMENTO'].editingRecord", document);
          if (procNow2) { opened = true; break; }

          await backpressure(220);
        }

        if (!opened) {
          sendLog("err", "Não consegui abrir nova linha.", { code, worker: workerStatus() });
          break;
        }

        await waitBusyOff(45000);

        // 2) pegar a linha (igual seu script antigo)
        const tr =
          gridEl.querySelector(`tr.grid-record.tableView[id='${getMaxRowId(gridEl)}']`) ||
          getRows(gridEl).slice(-1)[0];

        if (!tr) {
          sendLog("err", "Não identifiquei a linha nova (tr).", { code });
          break;
        }

        // 3) tabela
        const tab = await ensureCellEditorInRow(tr, "TABELACOBRANCA");
        if (tab) {
          tab.value = CFG.tabelaPadrao;
          fire(tab, "input");
          await pressEnter(tab);
          await backpressure(CFG.delay.short);
        }

        // 4) procedimento
        const proc = await ensureCellEditorInRow(tr, "PROCEDIMENTO");
        if (!proc) {
          sendLog("err", "Campo PROCEDIMENTO não ficou editável.", { code });
          break;
        }
        proc.value = code;
        fire(proc, "input");
        await pressEnter(proc);
        await backpressure(CFG.delay.short);

        // 5) quantidade
        for (let tent = 0; tent < 3; tent++) {
          if (window.__HP_ABORT__[scope]) break;
          const qtd = await ensureCellEditorInRow(tr, "COBRADOQDE");
          if (qtd) {
            qtd.focus();
            qtd.select?.();
            qtd.value = CFG.qtdPadrao;
            qtd.title = CFG.qtdPadrao;
            fire(qtd, "input");
            await pressEnter(qtd);
            await sleep(150);
            if (qtd.value === CFG.qtdPadrao || qtd.title === CFG.qtdPadrao) break;
          }
          await sleep(200);
        }

        // 6) confirmar/post
        if (btnPost) {
          await click(btnPost);
        }
        try {
          const Grid = window.Grid || window.parent?.Grid;
          Grid?.postRecord?.(gridId);
        } catch {}

        // fallback Ctrl+M (seu antigo)
        ["keydown","keypress","keyup"].forEach((t) => document.dispatchEvent(
          new KeyboardEvent(t, { bubbles: true, key: "m", code: "KeyM", keyCode: 77, which: 77, ctrlKey: true })
        ));

        await waitBusyOff(45000);
        await sleep(CFG.pausaEntreCodigos);

        sendLog("ok", "Linha confirmada.", { code });
      }

      sendLog("ok", "Concluído 🎉");
    } catch (e) {
      sendLog("err", "Erro fatal no worker.", { error: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // TOP UI (fixa, sem piscar)
  // =========================
  function topEnsureUI() {
    if (!isTop) return null;

    let wrap = document.getElementById("hp_case_wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hp_case_wrap";
      wrap.style.cssText = `
        position: fixed !important;
        right: 14px !important;
        bottom: 14px !important;
        width: 440px !important;
        max-width: calc(100vw - 28px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
        pointer-events: none !important;
      `;
      document.documentElement.appendChild(wrap);
    }

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

    // botão azul
    let btn = document.getElementById("hp_case_btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "hp_case_btn";
      btn.type = "button";
      btn.textContent = "⚡ Inserir Procedimentos";
      btn.style.cssText = `
        position: fixed !important;
        right: 14px !important;
        top: 14px !important;
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
    let stop = document.getElementById("hp_case_stop");
    if (!stop) {
      stop = document.createElement("button");
      stop.id = "hp_case_stop";
      stop.type = "button";
      stop.textContent = "⛔ Parar";
      stop.style.cssText = `
        position: fixed !important;
        right: 14px !important;
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
      `;
      document.documentElement.appendChild(stop);
    }

    return { wrap, head, box, btn, stop };
  }

  const topUI = topEnsureUI();

  const TOP_LOGS = [];
  function topLog(mark, msg, data) {
    if (!topUI) return;
    const d = new Date();
    const ts = `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
    const line = `${ts} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    TOP_LOGS.unshift(line);
    TOP_LOGS.splice(140);
    topUI.box.textContent = TOP_LOGS.join("\n\n");
    topUI.box.scrollTop = 0;
  }

  // =========================
  // TOP: seleção de worker estável
  // =========================
  let workers = new Map(); // id -> lastStatus
  let chosenWorker = null;
  let chosenStable = 0;

  function chooseBestWorker() {
    const arr = Array.from(workers.values())
      .filter(w => w && typeof w.score === "number")
      .sort((a,b) => b.score - a.score);

    const best = arr[0] || null;
    if (!best) {
      chosenWorker = null;
      chosenStable = 0;
      return null;
    }

    if (chosenWorker && best.id === chosenWorker.id) {
      chosenStable++;
    } else {
      chosenWorker = best;
      chosenStable = 1;
    }

    // só “fixa” depois de 2 batimentos (evita piscar)
    return chosenStable >= 2 ? chosenWorker : null;
  }

  function paintTopHeader() {
    if (!topUI) return;
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || "—";

    const stable = chooseBestWorker();
    const w = stable || chosenWorker;

    topUI.head.innerHTML = `
      <b>${scope} • UI Controller (TOP) ✅</b>
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Worker: <b>${w ? w.id : "—"}</b> • score: <b>${w ? w.score : 0}</b><br/>
        Grid neste worker: <b>${w ? (w.hasHost ? (w.hostVisible ? "visível" : "não visível") : "não detectado") : "—"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe <b>“Demais Procedimentos”</b> aberto e a grade visível. Clique no botão azul.
      </div>
    `;
  }

  // =========================
  // Broadcast handlers
  // =========================
  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "STATUS") {
      workers.set(m.from, m.status);
      if (isTop) paintTopHeader();
    }
    if (m.t === "LOG" && isTop) {
      const mark = m.level === "ok" ? "✅" : m.level === "warn" ? "⚠️" : m.level === "err" ? "❌" : "•";
      topLog(mark, m.msg, m.data || null);
    }
  };

  // =========================
  // Heartbeat do worker (leve)
  // =========================
  let hbTick = 0;
  setInterval(() => {
    hbTick++;
    // só manda status com frequência maior se tiver host
    const st = workerStatus();
    const freq = st.hasHost ? 700 : 1600;
    if (hbTick % Math.max(1, Math.floor(freq / 350)) === 0) {
      bc.postMessage({ t: "STATUS", from: myId, status: st });
    }
  }, 350);

  // =========================
  // TOP: botões
  // =========================
  if (isTop && topUI) {
    paintTopHeader();
    topLog("✅", "Controller armado. Abra SP-SADT e deixe “Demais Procedimentos” visível.", {
      kitKey: payload.kitKey || null,
      codes: Array.isArray(payload.codes) ? payload.codes.length : 0,
    });

    topUI.btn.onclick = async () => {
      const list = Array.isArray(payload.codes) ? payload.codes : [];
      if (!list.length) {
        topLog("⚠️", "Nenhum código no payload. Rode pelo popup.");
        return;
      }

      const stable = chooseBestWorker();
      if (!stable) {
        topLog("❌", "Ainda não tenho worker estável com grid visível. Role até a tabela de “Demais Procedimentos”.");
        paintTopHeader();
        return;
      }

      topLog("✅", "Enviando RUN para o worker…", { to: stable.id, total: list.length });
      bc.postMessage({ t: "RUN", from: myId, to: stable.id, codes: list });
    };

    topUI.stop.onclick = async () => {
      topLog("⚠️", "Parando… (vai interromper no próximo passo seguro)");
      bc.postMessage({ t: "STOP", from: myId, to: "ALL" });
    };
  }

  // =========================
  // Worker commands
  // =========================
  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "STOP") {
      if (m.to === "ALL" || m.to === myId) {
        window.__HP_ABORT__[scope] = true;
        sendLog("warn", "STOP recebido. Vou interromper no próximo passo seguro.");
      }
    }
    if (m.t === "RUN" && m.to === myId) {
      const list = Array.isArray(m.codes) ? m.codes : [];
      // executa apenas no worker certo
      if (!list.length) return;
      // evita “duplo run”
      if (window.__HP_RUN_LOCKS__[scope]) {
        sendLog("warn", "Já executando. Ignorando RUN duplicado.");
        return;
      }
      workerRun(list);
    }
  };

})();
