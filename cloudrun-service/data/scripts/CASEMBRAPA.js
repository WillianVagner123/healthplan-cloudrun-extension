/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "body"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // ====== CONFIG ======
  const DELAY = { tiny: 90, short: 170, mid: 280, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 320;     // folga extra (busy data channel)
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  // ✅ SEUS ELEMENTOS (grupo + grid)
  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  // ⚠️ você mandou o group-name 386. Mantive como padrão, mas com fallback por título.
  const GROUP_NAME = "386";
  const GROUP_HEADER_SEL = `.wf-form-view__group-header[data-for-group="${GROUP_NAME}"]`;

  // ====== UI + LOGS SEMPRE ======
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

    return { wrap, head, box, btn, stop };
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

  // ====== ✅ Grupo "Demais Procedimentos" (abrir/garantir) ======
  function findGroupHeaderFallbackByTitle() {
    const headers = Array.from(document.querySelectorAll(".wf-form-view__group-header"));
    return headers.find(h => (h.textContent || "").toLowerCase().includes("demais procedimentos")) || null;
  }

  function getGroupHeader() {
    return document.querySelector(GROUP_HEADER_SEL) || findGroupHeaderFallbackByTitle();
  }

  function isExpandedGroup(headerEl) {
    if (!headerEl) return false;
    const icon = headerEl.querySelector("i.wf-icons");
    const t = (icon?.textContent || "").trim().toLowerCase();
    if (t === "expand_less") return true;
    if (t === "expand_more") return false;

    // fallback: se o grid tem rects, está aberto
    const grid = document.querySelector(GRID_HOST_SEL);
    return !!(grid && grid.getClientRects?.().length);
  }

  async function ensureGroupOpen() {
    const header = getGroupHeader();
    if (!header) return true; // se não achar, não bloqueia (mas pode impedir)
    if (isExpandedGroup(header)) return true;

    header.scrollIntoView?.({ block: "center" });
    header.click();
    await delay(360);

    // espera grid visível
    for (let i = 0; i < 35; i++) {
      const grid = document.querySelector(GRID_HOST_SEL);
      if (grid && grid.getClientRects?.().length) return true;
      await delay(160);
    }
    return false;
  }

  // ====== ✅ Focar/ativar grid (shadow closed => precisa clique) ======
  async function focusGridHost() {
    const ok = await ensureGroupOpen();
    if (!ok) {
      logLine("warn", "Não consegui abrir o grupo “Demais Procedimentos”.");
      return null;
    }

    const h = document.querySelector(GRID_HOST_SEL);
    if (!h) return null;

    try { h.scrollIntoView?.({ block: "center" }); } catch {}
    const r = h.getBoundingClientRect();

    // clique dentro do grid para ativar
    const cx = Math.max(10, Math.min(window.innerWidth - 10, r.left + r.width * 0.50));
    const cy = Math.max(10, Math.min(window.innerHeight - 10, r.top  + Math.min(60, r.height * 0.30)));
    clickAt(cx, cy);
    await delay(DELAY.short);
    clickAt(cx, cy);
    await delay(DELAY.short);

    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}

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

  // ====== Inserir nova linha (atalhos + fallback toolbar click) ======
  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 1000);
    return !!proc;
  }

  async function tryInsertRow() {
    const h = await focusGridHost();
    if (!h) return false;

    await backpressure(DELAY.short);

    // 0) tenta chamar APIs internas (se existirem) — estilo do seu código antigo
    try {
      const gridName = "gridSolicitacao_gridProcedimentosSimples";
      // às vezes o portal expõe Grid.newRecord/postRecord no parent/top
      (window.parent || window).Grid?.newRecord?.(gridName);
      await backpressure(DELAY.mid);
      if (await hasEditorSoon()) return true;
    } catch {}

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

    // 4) fallback click na área da toolbar do grid (ícone + fica lá em cima)
    const r = h.getBoundingClientRect();
    const x = Math.max(10, Math.min(window.innerWidth - 10, r.left + 48)); // mais perto do canto
    const y = Math.max(10, Math.min(window.innerHeight - 10, r.top + 18));
    clickAt(x, y);
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    // 5) fallback extra: clique mais à direita (caso toolbar tenha padding)
    clickAt(Math.min(window.innerWidth - 12, x + 70), y);
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    return false;
  }

  async function confirmRow() {
    const gridName = "gridSolicitacao_gridProcedimentosSimples";

    // 0) API interna (estilo antigo)
    try {
      (window.parent || window).Grid?.postRecord?.(gridName);
      await backpressure(DELAY.long);
    } catch {}

    // 1) Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    // 2) Ctrl+Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(DELAY.short);

    // 3) Ctrl+M (fallback antigo)
    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  // ====== Lock + Cancel ======
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  let CANCELLED = false;
  function resetCancel() { CANCELLED = false; }
  function cancelRun() { CANCELLED = true; }

  // ====== Leader election (não roda em frame errado) ======
  const bc = new BroadcastChannel("HP_MASKARA_CASEMBRAPA_V3");
  const myFrameId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  function frameScore() {
    const h = document.querySelector(GRID_HOST_SEL);
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    if (!h) return 10 + Math.min(5_000_000, base);
    if (!isVisible(h)) return 100 + Math.min(5_000_000, base);
    return 1200 + Math.min(5_000_000, base);
  }

  let best = { id: null, score: -1 };
  let I_AM_LEADER = false;

  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "candidate") {
      if (m.score > best.score) best = { id: m.id, score: m.score };
    }
    if (m.t === "who_is_leader") {
      bc.postMessage({ t: "candidate", id: myFrameId, score: frameScore() });
    }
  };

  function refreshLeader() {
    best = { id: null, score: -1 };
    bc.postMessage({ t: "who_is_leader" });
    bc.postMessage({ t: "candidate", id: myFrameId, score: frameScore() });

    setTimeout(() => {
      I_AM_LEADER = best.id === myFrameId || best.id === null;
      paintHeader();
      ui.btn.style.display = I_AM_LEADER ? "block" : "none";
      ui.stop.style.display = (I_AM_LEADER && window.__HP_RUN_LOCKS__[scope]) ? "block" : "none";
    }, 260);
  }

  function paintHeader() {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || payload.kit || "—";
    const hasGrid = !!document.querySelector(GRID_HOST_SEL);
    const groupHeader = getGroupHeader();
    const groupState = groupHeader ? (isExpandedGroup(groupHeader) ? "aberto" : "fechado") : "n/d";

    ui.head.innerHTML = `
      <b>${scope}</b> • ${I_AM_LEADER ? "Leader ✅" : "Outro frame ativo…"}
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grupo “Demais Procedimentos”: <b>${groupState}</b><br/>
        Grid: <b>${hasGrid ? "detectado" : "aguardando…"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Entre na tela <b>Solicitação SP-SADT</b> e deixe o grupo <b>Demais Procedimentos</b> visível.
      </div>
    `;
  }

  refreshLeader();
  paintHeader();

  // ====== Runner principal ======
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }
    if (!I_AM_LEADER) {
      logLine("warn", "Este frame não é o líder. Não vou rodar aqui.");
      return;
    }
    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return;
    }

    // espera o grid aparecer (até 90s)
    const gridHost = await waitFor(() => document.querySelector(GRID_HOST_SEL), 90000, 250);
    if (!gridHost) {
      logLine("err", "Ainda não apareceu o grid. Você está na tela errada.", {
        dica: "Abra Solicitação SP-SADT → role até “Demais Procedimentos” → expanda."
      });
      return;
    }

    // garante grupo aberto antes de começar
    const okGroup = await ensureGroupOpen();
    if (!okGroup) {
      logLine("err", "Não consegui abrir o grupo “Demais Procedimentos”.", {
        dica: "Clique manualmente no título “Demais Procedimentos” para expandir e tente novamente."
      });
      return;
    }

    window.__HP_RUN_LOCKS__[scope] = true;
    resetCancel();
    ui.stop.style.display = "block";

    try {
      logLine("ok", "Iniciando inserção…", { total: list.length, tabela: TABELA_PADRAO, qtd: QUANTIDADE_PADRAO });

      for (let i = 0; i < list.length; i++) {
        if (CANCELLED) {
          logLine("warn", "Parado pelo usuário.", { at: i, remaining: list.length - i });
          break;
        }

        const code = String(list[i]);

        // abre linha (até 3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          logLine("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(950);
        }
        if (!opened) {
          logLine("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // tabela (se aparecer editável)
        const tab = await waitEditable("TABELACOBRANCA", 1400);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        // procedimento
        const proc = await waitEditable("PROCEDIMENTO", 25000);
        if (!proc) {
          logLine("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(1300);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(820);

        // quantidade
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

        // espera sair do modo edição
        await waitNotEditable("PROCEDIMENTO", 32000);
        await backpressure(700);

        logLine("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await delay(PAUSA_ENTRE_CODIGOS);
      }

      if (!CANCELLED) logLine("ok", "Finalizado 🎉");
    } catch (e) {
      logLine("err", "Erro fatal", { error: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
      ui.stop.style.display = "none";
      refreshLeader();
    }
  }

  // ====== Botões ======
  ui.btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }
    logLine("ok", "Executando…");
    await runInsercao(list);
  };

  ui.stop.onclick = () => {
    cancelRun();
    logLine("warn", "Solicitação de parada recebida. Vou parar ao fim do item atual.");
  };

  // ====== Watchers (SEM travar o site) ======
  // ✅ Nada de MutationObserver agressivo chamando refreshLeader o tempo todo.
  // Só checa leve por timer, e reeleição só quando houver mudança relevante.

  let lastHref = location.href;
  let lastGridSeen = !!document.querySelector(GRID_HOST_SEL);
  let lastGroupSeen = !!getGroupHeader();

  setInterval(() => {
    const hrefNow = location.href;
    const gridNow = !!document.querySelector(GRID_HOST_SEL);
    const groupNow = !!getGroupHeader();

    if (hrefNow !== lastHref) {
      lastHref = hrefNow;
      logLine("ok", "Mudou de página (SPA)", { href: lastHref });
      refreshLeader();
      paintHeader();
      return;
    }

    // se grid/grupo apareceu sumiu: reeleger 1x
    if (gridNow !== lastGridSeen || groupNow !== lastGroupSeen) {
      lastGridSeen = gridNow;
      lastGroupSeen = groupNow;
      refreshLeader();
    }

    paintHeader();
  }, 900);

  logLine("ok", "Runner armado (aguardando grid)…", {
    href: location.href,
    kitKey: payload.kitKey || payload.kit || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0,
    groupName: GROUP_NAME
  });
})();
