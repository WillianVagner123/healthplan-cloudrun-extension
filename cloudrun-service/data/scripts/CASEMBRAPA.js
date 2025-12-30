/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {
  // =========================
  // ✅ ANTI-REINJEÇÃO (por frame)
  // =========================
  if (window.__HP_CASEMBRAPA_V1_LOADED__) return;
  window.__HP_CASEMBRAPA_V1_LOADED__ = true;

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // ====== CONFIG ======
  const DELAY = { tiny: 90, short: 170, mid: 280, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 320;
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";
  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  // ====== CHANNELS ======
  const CH = "HP_CASEMBRAPA_CTRL_V2";
  const UI_CH = "HP_CASEMBRAPA_UI_V2";
  const bc = new BroadcastChannel(CH);
  const bcUI = new BroadcastChannel(UI_CH);

  const myId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const myUiId = `${myId}_ui`;

  // ====== Helpers ======
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

  function clickAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("click",     { bubbles: true, clientX: x, clientY: y, button: 0 }));
    return true;
  }

  // ====== Grupo "Demais Procedimentos" ======
  function findGroupHeaderByTitle() {
    const headers = Array.from(document.querySelectorAll(".wf-form-view__group-header"));
    return headers.find(h => (h.textContent || "").toLowerCase().includes("demais procedimentos")) || null;
  }

  function isExpandedGroup(headerEl) {
    if (!headerEl) return false;
    const icon = headerEl.querySelector("i.wf-icons");
    const t = (icon?.textContent || "").trim().toLowerCase();
    if (t === "expand_less") return true;
    if (t === "expand_more") return false;
    const grid = document.querySelector(GRID_HOST_SEL);
    return !!(grid && grid.getClientRects?.().length);
  }

  async function ensureGroupOpen() {
    const header = findGroupHeaderByTitle();
    if (!header) return true;
    if (isExpandedGroup(header)) return true;
    header.scrollIntoView?.({ block: "center" });
    header.click();
    await delay(360);
    for (let i = 0; i < 35; i++) {
      const grid = document.querySelector(GRID_HOST_SEL);
      if (grid && grid.getClientRects?.().length) return true;
      await delay(160);
    }
    return false;
  }

  // ====== Worker detect/score ======
  function hasGridNow() {
    const h = document.querySelector(GRID_HOST_SEL);
    return !!(h && isVisible(h));
  }

  function frameScore() {
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    const grid = document.querySelector(GRID_HOST_SEL);
    if (grid && isVisible(grid)) return 1_000_000_000 + Math.min(5_000_000, base);
    if (grid) return 100_000_000 + Math.min(5_000_000, base);
    return 10_000 + Math.min(5_000_000, base);
  }

  // ====== edição ======
  async function focusGridHost() {
    await ensureGroupOpen();
    const h = document.querySelector(GRID_HOST_SEL);
    if (!h) return null;
    try { h.scrollIntoView?.({ block: "center" }); } catch {}
    const r = h.getBoundingClientRect();
    const cx = Math.max(10, Math.min(window.innerWidth - 10, r.left + r.width * 0.50));
    const cy = Math.max(10, Math.min(window.innerHeight - 10, r.top  + Math.min(60, r.height * 0.30)));
    clickAt(cx, cy); await delay(DELAY.short);
    clickAt(cx, cy); await delay(DELAY.short);
    return h;
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
    const proc = await waitEditable("PROCEDIMENTO", 1000);
    return !!proc;
  }

  async function tryInsertRow() {
    const h = await focusGridHost();
    if (!h) return false;
    await backpressure(DELAY.short);

    const gridName = "gridSolicitacao_gridProcedimentosSimples";

    // API interna
    try {
      (window.parent || window).Grid?.newRecord?.(gridName);
      await backpressure(DELAY.mid);
      if (await hasEditorSoon()) return true;
    } catch {}

    // atalhos
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup",   { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    // click na toolbar (fallback)
    const r = h.getBoundingClientRect();
    const x = Math.max(10, Math.min(window.innerWidth - 10, r.left + 48));
    const y = Math.max(10, Math.min(window.innerHeight - 10, r.top + 18));
    clickAt(x, y);
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    clickAt(Math.min(window.innerWidth - 12, x + 70), y);
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    return false;
  }

  async function confirmRow() {
    const gridName = "gridSolicitacao_gridProcedimentosSimples";

    try {
      (window.parent || window).Grid?.postRecord?.(gridName);
      await backpressure(DELAY.long);
    } catch {}

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

  // locks locais
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;
  let CANCELLED = false;

  async function runInsercaoWorker(list, txId) {
    if (window.__HP_RUN_LOCKS__[scope]) {
      bc.postMessage({ t: "worker_status", txId, from: myId, ok: false, msg: "Já executando neste frame" });
      return;
    }
    window.__HP_RUN_LOCKS__[scope] = true;
    CANCELLED = false;

    try {
      const okGrid = await waitFor(() => hasGridNow(), 25000, 250);
      if (!okGrid) {
        bc.postMessage({ t: "worker_status", txId, from: myId, ok: false, msg: "Grid não ficou visível neste frame" });
        return;
      }

      bc.postMessage({ t: "worker_log", txId, from: myId, kind: "ok", msg: "Worker iniciou no frame certo", data: { frame: { w: innerWidth, h: innerHeight } } });

      for (let i = 0; i < list.length; i++) {
        if (CANCELLED) {
          bc.postMessage({ t: "worker_log", txId, from: myId, kind: "warn", msg: "Parado pelo usuário", data: { at: i } });
          break;
        }

        const code = String(list[i]);

        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          bc.postMessage({ t: "worker_log", txId, from: myId, kind: "warn", msg: `Falha ao abrir linha (${t + 1}/3)`, data: { code } });
          await backpressure(950);
        }
        if (!opened) {
          bc.postMessage({ t: "worker_log", txId, from: myId, kind: "err", msg: "Não consegui abrir a linha (parando)", data: { code } });
          break;
        }

        const tab = await waitEditable("TABELACOBRANCA", 1400);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        const proc = await waitEditable("PROCEDIMENTO", 25000);
        if (!proc) {
          bc.postMessage({ t: "worker_log", txId, from: myId, kind: "warn", msg: "PROCEDIMENTO não ficou editável (pulando)", data: { code } });
          await backpressure(1300);
          continue;
        }

        await setValueAndEnter(proc, code);
        await backpressure(820);

        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitEditable("COBRADOQDE", 6500);
          if (qtd) {
            await setValueAndEnter(qtd, QUANTIDADE_PADRAO);
            qtdOk = true;
            break;
          }
          await backpressure(320);
        }

        await confirmRow();
        await backpressure(1150);

        await waitNotEditable("PROCEDIMENTO", 32000);
        await backpressure(700);

        bc.postMessage({ t: "worker_log", txId, from: myId, kind: "ok", msg: `Inserido ${code} (${i + 1}/${list.length})`, data: { qtdOk } });
        await delay(PAUSA_ENTRE_CODIGOS);
      }

      bc.postMessage({ t: "worker_status", txId, from: myId, ok: true, msg: "Finalizado" });
    } catch (e) {
      bc.postMessage({ t: "worker_status", txId, from: myId, ok: false, msg: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // ✅ UI (controller sticky)
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
    let wrap = document.getElementById("hp_case_wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hp_case_wrap";
      wrap.style.cssText = `
        position: fixed !important;
        right: 12px !important;
        bottom: 12px !important;
        width: 430px !important;
        max-width: calc(100vw - 24px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto !important;
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
        max-height: 240px !important;
        overflow: auto !important;
        white-space: pre-wrap !important;
        word-break: break-word !important;
        pointer-events: auto !important;
      `;
      wrap.appendChild(box);
    }

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

    let stop = document.getElementById("hp_case_stop");
    if (!stop) {
      stop = document.createElement("button");
      stop.id = "hp_case_stop";
      stop.type = "button";
      stop.textContent = "⛔ Parar";
      stop.style.cssText = `
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
      document.documentElement.appendChild(stop);
    }

    return { head, box, btn, stop };
  }

  const ui = ensureUI();

  function logLine(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(140);
    ui.box.textContent = LOGS.join("\n\n");
    ui.box.scrollTop = 0;
  }

  // ====== sticky controller (TTL) ======
  const CTRL_KEY = "HP_CASEMBRAPA_UI_CTRL";
  const CTRL_TTL_MS = 20_000; // segura 20s sem trocar
  let I_AM_UI = false;

  function uiScore() {
    // preferir TOP window se existir (evita alternância)
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    const topBonus = (window === window.top) ? 100_000_000 : 0;
    return topBonus + base;
  }

  function readCtrl() {
    try { return JSON.parse(sessionStorage.getItem(CTRL_KEY) || "null"); } catch { return null; }
  }
  function writeCtrl(obj) {
    try { sessionStorage.setItem(CTRL_KEY, JSON.stringify(obj)); } catch {}
  }

  // eleição determinística: score maior ganha; empate -> id menor lexicográfico
  let seen = new Map(); // id -> {score, ts}

  bcUI.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "ui_ping") {
      seen.set(m.id, { score: m.score, ts: Date.now() });
    }
  };

  function electControllerSticky() {
    const now = Date.now();
    const cur = readCtrl();
    if (cur && cur.id && (now - cur.ts) < CTRL_TTL_MS) {
      // mantém controller atual
      I_AM_UI = (cur.id === myUiId);
      return;
    }

    // decide novo controller com base no seen recente + eu
    seen.set(myUiId, { score: uiScore(), ts: now });

    let bestId = null;
    let bestScore = -1;

    for (const [id, v] of seen.entries()) {
      if (!v) continue;
      if ((now - v.ts) > 3000) continue;
      if (v.score > bestScore) {
        bestScore = v.score;
        bestId = id;
      } else if (v.score === bestScore && bestId && String(id) < String(bestId)) {
        bestId = id; // tie-break
      }
    }

    if (!bestId) bestId = myUiId;
    writeCtrl({ id: bestId, ts: now });
    I_AM_UI = (bestId === myUiId);
  }

  // broadcast ping
  setInterval(() => {
    bcUI.postMessage({ t: "ui_ping", id: myUiId, score: uiScore() });
    electControllerSticky();
    applyUiVisibility();
    paintHeader();
  }, 700);

  function applyUiVisibility() {
    const display = I_AM_UI ? "block" : "none";
    ui.btn.style.display = display;
    ui.head.style.display = display;
    ui.box.style.display = display;
    if (!I_AM_UI) ui.stop.style.display = "none";
  }

  // ====== Workers registry ======
  let workers = {}; // id -> {score, hasGrid, ts}
  let bestWorkerId = null;

  function pickBestWorker() {
    const now = Date.now();
    let best = null;

    for (const [id, w] of Object.entries(workers)) {
      if (!w) continue;
      if (now - (w.ts || 0) > 5000) continue;
      // preferir hasGrid=true
      const eff = (w.hasGrid ? 10_000_000_000 : 0) + (w.score || 0);
      if (!best || eff > best.eff) best = { id, eff };
    }

    bestWorkerId = best?.id || null;
    return bestWorkerId;
  }

  function paintHeader() {
    if (!I_AM_UI) return;

    const kit = payload.kitKey || payload.kit || "—";
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const localHasGrid = hasGridNow();

    const chosen = pickBestWorker();
    const chosenInfo = chosen ? workers[chosen] : null;

    ui.head.innerHTML = `
      <b>${scope}</b> • UI Controller ✅ (fixo)
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid neste frame: <b>${localHasGrid ? "SIM" : "não"}</b><br/>
        Worker escolhido: <b>${chosen ? chosen : "nenhum ainda"}</b> ${chosenInfo?.hasGrid ? "• (tem grid ✅)" : ""}
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe “Demais Procedimentos” visível. Clique em Inserir e ele executa no frame que tem o grid.
      </div>
    `;
  }

  // ====== Worker announce ======
  function announceWorker() {
    bc.postMessage({
      t: "worker_hello",
      id: myId,
      score: frameScore(),
      hasGrid: hasGridNow(),
      ts: Date.now(),
      frame: { w: innerWidth, h: innerHeight },
      href: location.href
    });
  }
  setInterval(announceWorker, 900);

  // ====== Message routing ======
  bc.onmessage = (ev) => {
    const m = ev.data || {};

    if (m.t === "worker_hello") {
      workers[m.id] = { score: m.score, hasGrid: !!m.hasGrid, ts: Date.now(), frame: m.frame, href: m.href };
      if (I_AM_UI) paintHeader();
      return;
    }

    if (m.t === "run_request") {
      if (m.to !== myId) return;
      const list = Array.isArray(m.codes) ? m.codes : [];
      runInsercaoWorker(list, m.txId);
      return;
    }

    if (m.t === "stop_request") {
      if (m.to !== myId) return;
      CANCELLED = true;
      return;
    }

    if (I_AM_UI && m.t === "worker_log") {
      logLine(m.kind || "•", m.msg || "log", { from: m.from, ...(m.data || {}) });
      return;
    }
    if (I_AM_UI && m.t === "worker_status") {
      logLine(m.ok ? "ok" : "err", m.msg || (m.ok ? "OK" : "Falha"), { from: m.from, txId: m.txId });
      ui.stop.style.display = "none";
      return;
    }
  };

  // ====== UI actions ======
  ui.btn.onclick = async () => {
    if (!I_AM_UI) return;

    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }

    pickBestWorker();
    if (!bestWorkerId) {
      logLine("err", "Nenhum worker detectado ainda. Aguarde 2s e tente novamente.");
      return;
    }

    const txId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    ui.stop.style.display = "block";
    logLine("ok", "Enviando execução para o worker…", { to: bestWorkerId, txId, total: list.length });

    bc.postMessage({ t: "run_request", to: bestWorkerId, txId, codes: list });
  };

  ui.stop.onclick = () => {
    if (!I_AM_UI) return;
    pickBestWorker();
    if (!bestWorkerId) return;
    logLine("warn", "Pedindo parada ao worker…", { to: bestWorkerId });
    bc.postMessage({ t: "stop_request", to: bestWorkerId });
  };

  // bootstrap
  electControllerSticky();
  applyUiVisibility();
  if (I_AM_UI) {
    logLine("ok", "Controller fixado (sem piscar). Aguardando worker com grid…", {
      href: location.href,
      kitKey: payload.kitKey || payload.kit || null,
      codes: Array.isArray(payload.codes) ? payload.codes.length : 0
    });
  }
})();
