/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": ["body"],
  "actions": { "focus": "body" }
}*/

(() => {
  // ============================================================
  // CASEMBRAPA • Runner v3 (Controller fixo + Worker eleito)
  // ✅ NÃO depende de host visível (shadow closed / layout tardio)
  // ✅ Critério real: "editor de PROCEDIMENTO apareceu?"
  // ✅ Não mexe no popup.js (usa window.__HP_PAYLOAD__)
  // ============================================================

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // ===== CONFIG =====
  const DELAY = { tiny: 80, short: 150, mid: 260, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 250;     // mais folga p/ “busy data channel”
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  // onde está o “grupo” do grid (apenas para UI/status)
  const GRID_GROUP_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  // ===== Utils =====
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

  // ===== UI (Controller fixo; não some) =====
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
        width: 460px !important;
        max-width: calc(100vw - 24px) !important;
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
        background: rgba(0,0,0,.82) !important;
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
        background: rgba(0,0,0,.68) !important;
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

    let btnStop = document.getElementById("hp_case_stop");
    if (!btnStop) {
      btnStop = document.createElement("button");
      btnStop.id = "hp_case_stop";
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
        box-shadow: 0 10px 24px rgba(0,0,0,.22) !important;
        user-select: none !important;
        pointer-events: auto !important;
        display: none !important;
      `;
      document.documentElement.appendChild(btnStop);
    }

    return { wrap, head, box, btn, btnStop };
  }

  const ui = ensureUI();

  function logLine(kind, msg, data) {
    const mark =
      kind === "ok" ? "✅" :
      kind === "warn" ? "⚠️" :
      kind === "err" ? "❌" :
      kind === "info" ? "ℹ️" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(180);
    ui.box.textContent = LOGS.join("\n\n");
    ui.box.scrollTop = 0;
  }

  // ===== Run lock + stop flag =====
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  const STOP = { flag: false };
  function setRunningUI(running) {
    ui.btnStop.style.display = running ? "block" : "none";
    ui.btn.textContent = running ? "⚡ Inserindo…" : "⚡ Inserir Procedimentos";
  }

  // ===== “Grid operacional” = editor real apareceu =====
  function getProcEditorAny() {
    const el = document.querySelector("input[name='PROCEDIMENTO']");
    if (!el) return null;
    if (!isVisible(el)) return null;
    if (el.disabled) return null;
    if (el.readOnly) return null;
    return el;
  }

  function getQtdEditorAny() {
    const el = document.querySelector("input[name='COBRADOQDE']");
    if (!el) return null;
    if (!isVisible(el)) return null;
    if (el.disabled) return null;
    if (el.readOnly) return null;
    return el;
  }

  function getTabEditorAny() {
    const el = document.querySelector("input[name='TABELACOBRANCA']");
    if (!el) return null;
    if (!isVisible(el)) return null;
    if (el.disabled) return null;
    if (el.readOnly) return null;
    return el;
  }

  async function focusSomewhereNearGrid() {
    const host = document.querySelector(GRID_GROUP_SEL);
    if (host) {
      try { host.scrollIntoView?.({ block: "center" }); } catch {}
      const r = host.getBoundingClientRect();
      const cx = Math.max(10, Math.min(window.innerWidth - 10, r.left + r.width * 0.50));
      const cy = Math.max(10, Math.min(window.innerHeight - 10, r.top  + Math.min(80, r.height * 0.30)));
      clickAt(cx, cy);
    } else {
      // fallback: clique no meio da tela
      clickAt(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.4));
    }
    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}
    await delay(DELAY.short);
  }

  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fire = (type) => el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true, cancelable: true,
      key: "Enter", code: "Enter", keyCode: 13, which: 13
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
    await delay(80);
    return !!getProcEditorAny();
  }

  // ===== Tenta abrir nova linha (sem depender do botão do shadow) =====
  async function tryInsertRow() {
    await focusSomewhereNearGrid();
    await backpressure(DELAY.short);

    // Se já abriu editor, ok
    if (getProcEditorAny()) return true;

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

    // 4) fallback: clique na “região da toolbar” do grid (aprox.)
    const host = document.querySelector(GRID_GROUP_SEL);
    if (host) {
      const r = host.getBoundingClientRect();
      const x = Math.max(10, Math.min(window.innerWidth - 10, r.left + 130));
      const y = Math.max(10, Math.min(window.innerHeight - 10, r.top + 22));
      clickAt(x, y);
      await backpressure(DELAY.long);
      if (await hasEditorSoon()) return true;
    }

    return false;
  }

  async function confirmRow() {
    // Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    // Ctrl+Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(DELAY.short);

    // Ctrl+M (fallback clássico)
    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  async function waitNotEditableProc(timeoutMs = 25000) {
    const ok = await waitFor(() => {
      const el = document.querySelector("input[name='PROCEDIMENTO']");
      if (!el) return true;
      if (!isVisible(el)) return true;
      if (el.disabled || el.readOnly) return true;
      // ainda editável -> false
      return false;
    }, timeoutMs, 200);
    return !!ok;
  }

  async function gridIsOperational() {
    // critério real: editor abriu
    if (getProcEditorAny()) return true;
    const opened = await tryInsertRow();
    if (!opened) return false;
    await delay(350);
    return !!getProcEditorAny();
  }

  // ============================================================
  // Controller/Worker via BroadcastChannel
  // Controller: sempre desenha UI + manda RUN pro Worker líder
  // Worker líder: é o frame com maior "score" (editor/viewport)
  // ============================================================
  const CHANNEL = "HP_MASKARA_CASEMBRAPA_V3";
  const bc = new BroadcastChannel(CHANNEL);
  const FRAME_ID = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // Sou controller fixo (não some). Qual frame vira worker? Eleição.
  let workerBest = { id: null, score: -1, href: "", ts: 0 };
  let workerId = null;

  function workerScore() {
    // maior = melhor
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    const canEdit = !!getProcEditorAny(); // ouro
    const hasGridMarker = !!document.querySelector(GRID_GROUP_SEL);
    // bônus: editor > marker > só viewport
    return (canEdit ? 2_000_000_000 : hasGridMarker ? 50_000_000 : 1_000_000) + Math.min(5_000_000, base);
  }

  function announceCandidate() {
    bc.postMessage({
      t: "candidate",
      id: FRAME_ID,
      score: workerScore(),
      href: location.href,
      ts: Date.now()
    });
  }

  function electWorker() {
    workerBest = { id: null, score: -1, href: "", ts: 0 };
    // pergunta e também anuncia
    bc.postMessage({ t: "who_is_best", from: FRAME_ID, ts: Date.now() });
    announceCandidate();
    // fecha eleição após 280ms
    setTimeout(() => {
      workerId = workerBest.id || FRAME_ID; // fallback
      paintHeader();
      logLine("info", "Worker escolhido", { workerId, bestScore: workerBest.score, bestHref: workerBest.href });
    }, 280);
  }

  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "who_is_best") {
      announceCandidate();
      return;
    }
    if (m.t === "candidate") {
      if (typeof m.score === "number" && m.score > workerBest.score) {
        workerBest = { id: m.id, score: m.score, href: m.href || "", ts: m.ts || Date.now() };
      }
      return;
    }
    if (m.t === "RUN" && m.to === FRAME_ID) {
      // sou o worker alvo -> executar
      runWorker(m).catch((e) => {
        bc.postMessage({ t: "LOG", to: m.from, from: FRAME_ID, kind: "err", text: "Worker erro", data: { error: String(e?.message || e) } });
      });
      return;
    }
    if (m.t === "STOP") {
      STOP.flag = true;
      return;
    }
    if (m.t === "LOG" && m.to === FRAME_ID) {
      // (controller pode apontar logs pra si mesmo)
      logLine(m.kind || "info", m.text || "log", m.data);
      return;
    }
    if (m.t === "LOG_UI") {
      // qualquer frame pode receber logs UI (não usamos aqui)
      return;
    }
  };

  // ============================================================
  // PINTURA DO HEADER (sempre no controller)
  // ============================================================
  function paintHeader() {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || payload.kit || "—";
    const hasGrid = !!document.querySelector(GRID_GROUP_SEL);
    const canEdit = !!getProcEditorAny();

    ui.head.innerHTML = `
      <b>${scope}</b> • UI Controller <span style="opacity:.9">(fixo)</span>
      <div style="opacity:.92;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid marker: <b>${hasGrid ? "ok" : "n/d"}</b> • Editor PROCEDIMENTO: <b>${canEdit ? "ok" : "n/d"}</b><br/>
        Worker: <b>${workerId ? workerId.slice(-8) : "elegendo…"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Dica: deixe o grupo <b>“Demais Procedimentos”</b> aberto e clique no botão azul.
      </div>
    `;
  }

  // ============================================================
  // EXECUÇÃO (controller manda RUN pro worker eleito)
  // ============================================================
  async function runController() {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }

    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return;
    }

    STOP.flag = false;
    window.__HP_RUN_LOCKS__[scope] = true;
    setRunningUI(true);

    try {
      // garante worker eleito antes de mandar
      if (!workerId) electWorker();
      await delay(350);

      // manda rodar no worker
      const msg = {
        t: "RUN",
        from: FRAME_ID,
        to: workerId || FRAME_ID,
        kitKey: payload.kitKey || payload.kit || null,
        codes: list,
        tabela: TABELA_PADRAO,
        qtd: QUANTIDADE_PADRAO,
        pauses: { betweenCodes: PAUSA_ENTRE_CODIGOS }
      };

      logLine("ok", "Enviando RUN para o worker…", { to: msg.to, total: list.length });
      bc.postMessage(msg);

      // acompanha “alive”/logs do worker via retorno LOG -> controller (vamos imprimir no próprio controller)
      // (o worker envia LOG para msg.from)
    } finally {
      // lock fica até o worker avisar (aqui soltamos só se der STOP local)
      // Para não travar a UI: soltamos lock ao terminar o loop de logs do worker,
      // mas como não temos ACK formal, soltamos quando STOP for acionado.
    }
  }

  // ============================================================
  // WORKER: faz a inserção de fato e devolve logs ao controller
  // ============================================================
  async function runWorker(runMsg) {
    const list = Array.isArray(runMsg.codes) ? runMsg.codes : [];
    const toController = runMsg.from;

    const send = (kind, text, data) => bc.postMessage({ t: "LOG", to: toController, from: FRAME_ID, kind, text, data });

    // proteção (não rodar 2x no mesmo frame)
    if (window.__HP_RUN_LOCKS__[scope] && toController !== FRAME_ID) {
      send("warn", "Worker já está executando (lock).");
      return;
    }

    STOP.flag = false;

    // valida “operacional”
    send("info", "Worker iniciando…", { href: location.href, score: workerScore() });

    const ok = await gridIsOperational();
    if (!ok) {
      send("err", "Grid não operacional aqui (editor PROCEDIMENTO não abriu).", {
        dica: "Abra Solicitação SP-SADT, deixe “Demais Procedimentos” aberto e clique dentro do grid."
      });
      return;
    }

    // agora: loop principal
    try {
      send("ok", "Inserção iniciada", { total: list.length, tabela: runMsg.tabela, qtd: runMsg.qtd });

      for (let i = 0; i < list.length; i++) {
        if (STOP.flag) {
          send("warn", "Parado pelo usuário.");
          break;
        }

        const code = String(list[i]);

        // abre linha (3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          send("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(900);
        }
        if (!opened) {
          send("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // tabela (se existir)
        const tab = await waitFor(() => getTabEditorAny(), 1200, 120);
        if (tab) {
          await setValueAndEnter(tab, runMsg.tabela || TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        // procedimento
        const proc = await waitFor(() => getProcEditorAny(), 20000, 150);
        if (!proc) {
          send("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(1200);
          continue;
        }

        await setValueAndEnter(proc, code);
        await backpressure(700);

        // quantidade
        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitFor(() => getQtdEditorAny(), 5000, 150);
          if (qtd) {
            await setValueAndEnter(qtd, runMsg.qtd || QUANTIDADE_PADRAO);
            qtdOk = true;
            break;
          }
          await backpressure(260);
        }

        // confirmar
        await confirmRow();
        await backpressure(900);

        // espera sair do modo edição
        await waitNotEditableProc(26000);
        await backpressure(520);

        send("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await delay((runMsg.pauses?.betweenCodes ?? PAUSA_ENTRE_CODIGOS));
      }

      send("ok", "Finalizado 🎉");
    } catch (e) {
      send("err", "Erro fatal no worker", { error: String(e?.message || e) });
    }
  }

  // ===== UI binds =====
  ui.btn.onclick = () => runController().catch((e) => logLine("err", "Erro ao iniciar", { error: String(e?.message || e) }));
  ui.btnStop.onclick = () => {
    STOP.flag = true;
    bc.postMessage({ t: "STOP" }); // broadcast
    logLine("warn", "Stop solicitado.");
    window.__HP_RUN_LOCKS__[scope] = false;
    setRunningUI(false);
  };

  // ===== Atualizações periódicas (SPA) =====
  let lastHref = location.href;

  function tick() {
    // SPA / troca de tela
    if (location.href !== lastHref) {
      lastHref = location.href;
      logLine("info", "Mudou de página (SPA)", { href: lastHref });
      electWorker();
    }

    // header sempre atualiza
    paintHeader();
  }

  // primeira eleição
  electWorker();
  paintHeader();

  // watchers
  setInterval(tick, 800);

  const mo = new MutationObserver(() => {
    paintHeader();
    // reeleger quando DOM muda forte (grid aparece/some)
    electWorker();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // log inicial
  logLine("ok", "Runner v3 armado (Controller fixo).", {
    href: location.href,
    kitKey: payload.kitKey || payload.kit || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0
  });
})();
