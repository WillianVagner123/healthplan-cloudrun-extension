/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {
  const scope = "CASEMBRAPA";
  const payload = window.__HP_PAYLOAD__ || {};
  const KIT_KEY = payload.kitKey || payload.kit || "—";
  const CODES = Array.isArray(payload.codes) ? payload.codes : [];

  // =========================
  // CONFIG
  // =========================
  const DELAY = { tiny: 80, short: 150, mid: 250, long: 450 };
  const PAUSA_ENTRE_CODIGOS = 260;         // mais folga por “busy data channel”
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";
  // Você mandou esses trechos do DOM:
  const GROUP_CONTAINER_SEL = "section.wf-form-view__group[data-group-name='386']";
  const GROUP_HEADER_SEL = "section.wf-form-view__group-header[data-for-group='386']";

  // =========================
  // STATE GLOBAL
  // =========================
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  const FRAME_ID = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const bc = new BroadcastChannel("HP_CASEMBRAPA_CONTROLLER_WORKER_V3");

  // =========================
  // HELPERS
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getClientRects?.();
    return !!(r && r.length);
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await delay(stepMs);
    }
    return null;
  }

  function fireKey(target, type, opts) {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function backpressure(ms = 650) {
    await delay(ms);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }

  function click(el) {
    if (!el) return false;
    el.scrollIntoView?.({ block: "center" });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    return true;
  }

  function nowTs() {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
  }

  // =========================
  // CONTROLLER UI (SÓ NO TOP)
  // =========================
  const IS_TOP = (() => {
    try { return window.top === window; } catch { return true; }
  })();

  const LOGS = [];
  let UI = null;
  let SELECTED_WORKER = null;
  let LAST_WORKERS = new Map(); // id -> {hasGrid, visibleGrid, score, ts}

  function uiEnsure() {
    if (!IS_TOP) return null;

    let wrap = document.getElementById("hp_case_wrap_v3");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hp_case_wrap_v3";
      wrap.style.cssText = `
        position: fixed !important;
        right: 12px !important;
        bottom: 12px !important;
        width: 440px !important;
        max-width: calc(100vw - 24px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
        pointer-events: none !important;
      `;
      document.documentElement.appendChild(wrap);
    }

    let head = document.getElementById("hp_case_head_v3");
    if (!head) {
      head = document.createElement("div");
      head.id = "hp_case_head_v3";
      head.style.cssText = `
        background: rgba(0,0,0,.80) !important;
        border-radius: 12px !important;
        padding: 10px 12px !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
        margin-bottom: 8px !important;
        pointer-events: auto !important;
      `;
      wrap.appendChild(head);
    }

    let box = document.getElementById("hp_case_box_v3");
    if (!box) {
      box = document.createElement("div");
      box.id = "hp_case_box_v3";
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

    let btnRun = document.getElementById("hp_case_btnRun_v3");
    if (!btnRun) {
      btnRun = document.createElement("button");
      btnRun.id = "hp_case_btnRun_v3";
      btnRun.type = "button";
      btnRun.textContent = "⚡ Inserir Procedimentos";
      btnRun.style.cssText = `
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
      document.documentElement.appendChild(btnRun);
    }

    let btnStop = document.getElementById("hp_case_btnStop_v3");
    if (!btnStop) {
      btnStop = document.createElement("button");
      btnStop.id = "hp_case_btnStop_v3";
      btnStop.type = "button";
      btnStop.textContent = "⛔ Parar";
      btnStop.style.cssText = `
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
      `;
      document.documentElement.appendChild(btnStop);
    }

    return { wrap, head, box, btnRun, btnStop };
  }

  function uiLog(kind, msg, data) {
    if (!IS_TOP) return;
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(160);
    UI.box.textContent = LOGS.join("\n\n");
    UI.box.scrollTop = 0;
  }

  function uiPaint() {
    if (!IS_TOP) return;

    const codesCount = CODES.length;
    const worker = SELECTED_WORKER || "—";

    // pega o melhor worker atualmente
    let best = null;
    for (const [id, w] of LAST_WORKERS.entries()) {
      if (!best || w.score > best.score) best = { id, ...w };
    }
    if (best) SELECTED_WORKER = best.id;

    UI.head.innerHTML = `
      <b>${scope}</b> • UI Controller <span style="opacity:.8">(fixo)</span><br/>
      Kit: <b>${KIT_KEY}</b> • códigos: <b>${codesCount}</b><br/>
      Worker escolhido: <b>${worker}</b><br/>
      <span style="opacity:.8">
        Dica: deixe o grupo <b>Demais Procedimentos</b> aberto/visível antes de clicar.
      </span>
    `;
  }

  if (IS_TOP) {
    UI = uiEnsure();
    uiPaint();

    UI.btnRun.onclick = async () => {
      if (!CODES.length) return uiLog("warn", "Nenhum código no payload (rode pelo popup).");
      uiLog("ok", "Solicitando workers…");
      bc.postMessage({ t: "PING", from: FRAME_ID, need: "grid" });

      await delay(250);
      uiPaint();

      if (!SELECTED_WORKER) {
        uiLog("err", "Não achei nenhum frame com o grid ainda.", {
          dica: "Abra a Solicitação SP-SADT e role até ‘Demais Procedimentos’ ficar visível."
        });
        return;
      }

      uiLog("ok", "Enviando RUN para o worker…", { to: SELECTED_WORKER, total: CODES.length });
      bc.postMessage({
        t: "RUN",
        from: FRAME_ID,
        to: SELECTED_WORKER,
        kitKey: KIT_KEY,
        codes: CODES,
        config: { TABELA_PADRAO, QUANTIDADE_PADRAO, PAUSA_ENTRE_CODIGOS }
      });
    };

    UI.btnStop.onclick = async () => {
      uiLog("warn", "Enviando STOP…");
      bc.postMessage({ t: "STOP", from: FRAME_ID, to: SELECTED_WORKER || "*" });
    };

    // pings periódicos para manter worker selecionado, sem “sumir”
    setInterval(() => {
      bc.postMessage({ t: "PING", from: FRAME_ID, need: "grid" });
    }, 1500);
  }

  // =========================
  // WORKER (QUALQUER FRAME)
  // =========================
  let SHOULD_STOP = false;

  function workerScore() {
    const host = document.querySelector(GRID_HOST_SEL);
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    const has = !!host;
    const vis = has && isVisible(host);
    // score alto se visível
    return (vis ? 1000 : has ? 300 : 10) + Math.min(5_000_000, base);
  }

  function workerReport() {
    const host = document.querySelector(GRID_HOST_SEL);
    const hasGrid = !!host;
    const visibleGrid = hasGrid && isVisible(host);
    return { id: FRAME_ID, hasGrid, visibleGrid, score: workerScore(), ts: Date.now(), href: location.href };
  }

  async function ensureGroupOpen() {
    // se o grupo existe, garante expandido (clicando no header)
    const group = document.querySelector(GROUP_CONTAINER_SEL);
    const header = document.querySelector(GROUP_HEADER_SEL);

    // se não achou (porque mudou o ID do grupo), só ignora
    if (!group || !header) return;

    // heurística: se o grid host não está visível, tenta expandir o grupo
    const host = document.querySelector(GRID_HOST_SEL);
    if (host && isVisible(host)) return;

    // clica no header para expandir (pode alternar)
    click(header);
    await delay(250);
  }

  async function waitEditable(name, timeoutMs = 12000) {
    return waitFor(() => {
      const el = document.querySelector(`input[name='${name}']`);
      if (!el) return null;
      if (!isVisible(el)) return null;
      if (el.disabled) return null;
      if (el.readOnly) return null;
      return el;
    }, timeoutMs);
  }

  async function waitNotEditable(name, timeoutMs = 20000) {
    return waitFor(() => {
      const el = document.querySelector(`input[name='${name}']`);
      if (!el) return true;
      if (!isVisible(el)) return true;
      if (el.disabled) return true;
      if (el.readOnly) return true;
      return false;
    }, timeoutMs);
  }

  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fire = (type) => el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
    }));
    fire("keydown"); fire("keypress"); fire("keyup");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(DELAY.short);
    el.blur?.();
    await delay(DELAY.short);
  }

  async function setValueAndEnter(input, value) {
    input.focus();
    input.value = "";
    fireInput(input);
    await delay(DELAY.tiny);

    input.value = String(value);
    fireInput(input);
    await pressEnter(input);
    await delay(DELAY.short);
  }

  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 900);
    return !!proc;
  }

  async function focusGridHost() {
    const h = document.querySelector(GRID_HOST_SEL);
    if (!h) return null;
    try { h.scrollIntoView?.({ block: "center" }); } catch {}
    // clique simples no host (o grid tem shadow closed, mas o foco costuma ir)
    click(h);
    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}
    await delay(DELAY.short);
    return h;
  }

  async function tryInsertRow() {
    await ensureGroupOpen();
    const h = await focusGridHost();
    if (!h) return false;

    await backpressure(DELAY.short);

    // 1) Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    // 2) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup",   { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    // 3) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    return false;
  }

  async function confirmRow() {
    // Enter / Ctrl+Enter / Ctrl+M (fallback)
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(DELAY.short);

    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  async function runInsercaoWorker(msg) {
    if (window.__HP_RUN_LOCKS__[scope]) {
      bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "warn", text: "Worker já está executando." });
      return;
    }

    const list = Array.isArray(msg.codes) ? msg.codes : [];
    if (!list.length) {
      bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "warn", text: "Lista vazia no RUN." });
      return;
    }

    // valida grid visível aqui
    const host = await waitFor(() => document.querySelector(GRID_HOST_SEL), 8000, 200);
    if (!host || !isVisible(host)) {
      bc.postMessage({
        t: "LOG",
        to: msg.from,
        from: FRAME_ID,
        kind: "err",
        text: "Grid não está visível neste frame (worker).",
        data: { href: location.href, hasHost: !!host, visible: !!(host && isVisible(host)) }
      });
      return;
    }

    SHOULD_STOP = false;
    window.__HP_RUN_LOCKS__[scope] = true;

    const cfg = msg.config || {};
    const TAB = cfg.TABELA_PADRAO ?? TABELA_PADRAO;
    const QTD = cfg.QUANTIDADE_PADRAO ?? QUANTIDADE_PADRAO;
    const PAUSA = cfg.PAUSA_ENTRE_CODIGOS ?? PAUSA_ENTRE_CODIGOS;

    try {
      bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "ok", text: "Worker iniciou.", data: { total: list.length } });

      for (let i = 0; i < list.length; i++) {
        if (SHOULD_STOP) {
          bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "warn", text: "STOP recebido. Parando." });
          break;
        }

        const code = String(list[i]);

        // abre linha (até 3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          await backpressure(800);
        }
        if (!opened) {
          bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "err", text: "Não consegui abrir a linha para inserir.", data: { code } });
          break;
        }

        // tabela (se surgir)
        const tab = await waitEditable("TABELACOBRANCA", 1200);
        if (tab) await setValueAndEnter(tab, TAB);

        // procedimento
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "warn", text: "PROCEDIMENTO não ficou editável (pulando).", data: { code } });
          await backpressure(900);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(650);

        // quantidade
        const qtd = await waitEditable("COBRADOQDE", 5000);
        if (qtd) await setValueAndEnter(qtd, QTD);

        await confirmRow();
        await backpressure(900);
        await waitNotEditable("PROCEDIMENTO", 25000);

        bc.postMessage({
          t: "PROGRESS",
          to: msg.from,
          from: FRAME_ID,
          i: i + 1,
          total: list.length,
          code
        });

        await delay(PAUSA);
      }

      bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "ok", text: "Worker finalizou." });
    } catch (e) {
      bc.postMessage({ t: "LOG", to: msg.from, from: FRAME_ID, kind: "err", text: "Erro fatal no worker.", data: { error: String(e?.message || e) } });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // BROADCAST HANDLERS
  // =========================
  bc.onmessage = (ev) => {
    const m = ev.data || {};

    // Controller pedindo status
    if (m.t === "PING") {
      const rep = workerReport();
      bc.postMessage({ t: "PONG", to: m.from, from: FRAME_ID, ...rep });
      return;
    }

    // RUN direcionado
    if (m.t === "RUN") {
      if (m.to !== FRAME_ID) return;
      runInsercaoWorker(m);
      return;
    }

    // STOP direcionado (ou broadcast *)
    if (m.t === "STOP") {
      if (m.to !== "*" && m.to !== FRAME_ID) return;
      SHOULD_STOP = true;
      return;
    }

    // Controller recebendo PONG/LOG/PROGRESS
    if (IS_TOP) {
      if (m.t === "PONG" && m.to === FRAME_ID) {
        LAST_WORKERS.set(m.from, {
          hasGrid: !!m.hasGrid,
          visibleGrid: !!m.visibleGrid,
          score: m.score || 0,
          ts: m.ts || Date.now(),
          href: m.href || ""
        });

        // limpa workers velhos
        const cutoff = Date.now() - 10_000;
        for (const [id, w] of LAST_WORKERS.entries()) {
          if ((w.ts || 0) < cutoff) LAST_WORKERS.delete(id);
        }

        uiPaint();
      }

      if (m.t === "LOG" && m.to === FRAME_ID) {
        uiLog(m.kind || "info", m.text || "log", m.data);
      }

      if (m.t === "PROGRESS" && m.to === FRAME_ID) {
        uiLog("ok", `Inserido ${m.code} (${m.i}/${m.total})`);
      }
    }
  };

  // =========================
  // BOOT
  // =========================
  if (IS_TOP) {
    uiLog("ok", "Controller armado (UI fixa).", { kitKey: KIT_KEY, codes: CODES.length });
  }
})();
