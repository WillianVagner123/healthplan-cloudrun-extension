/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "section.wf-grid",
    "input[name='PROCEDIMENTO']"
  ],
  "actions": { "focus": "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']" }
}*/

/**
 * CASEMBRAPA — Runner (IIFE) ✅
 * - SEM runnerBase
 * - Resolve frame certo via BroadcastChannel (leader election)
 * - UI flutuante + painel de logs na TELA (não depende do console)
 * - ShadowRoot CLOSED: cria linha por atalhos, edita por inputs name=...
 * - Aproveita lógica boa do seu script antigo: delays, pressEnter, retries, Ctrl+M confirm
 */
(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // =========================
  // CONFIG "antigo" reaproveitado
  // =========================
  const DELAY = { tiny: 80, short: 150, mid: 250, long: 450 };
  const PAUSA_ENTRE_CODIGOS = 180;     // antes era 120; aqui um pouco maior por causa do "data channel busy"
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";          // só aplica se input aparecer editável

  // Grid host (fora do shadow). No seu HTML ele existe.
  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  // ✅ condição mínima: tem host?
  const host = document.querySelector(GRID_HOST_SEL);
  if (!host) return;

  // =========================
  // Logger na TELA (não depende do console)
  // =========================
  const nowTs = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `[${hh}:${mm}:${ss}]`;
  };

  function ensureLogUI() {
    // container
    let wrap = document.getElementById("hp_case_log_wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "hp_case_log_wrap";
      wrap.style.cssText = `
        position: fixed !important;
        right: 12px !important;
        bottom: 12px !important;
        width: 420px !important;
        max-width: calc(100vw - 24px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
        pointer-events: none !important;
      `;
      document.documentElement.appendChild(wrap);
    }

    // hint/status
    let head = document.getElementById("hp_case_log_head");
    if (!head) {
      head = document.createElement("div");
      head.id = "hp_case_log_head";
      head.style.cssText = `
        background: rgba(0,0,0,.72) !important;
        border-radius: 12px !important;
        padding: 10px 12px !important;
        box-shadow: 0 10px 24px rgba(0,0,0,.25) !important;
        margin-bottom: 8px !important;
      `;
      wrap.appendChild(head);
    }

    // box logs
    let box = document.getElementById("hp_case_log_box");
    if (!box) {
      box = document.createElement("div");
      box.id = "hp_case_log_box";
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

    // button
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

    return { wrap, head, box, btn };
  }

  const ui = ensureLogUI();
  const LOGS = [];
  function logLine(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(120);
    ui.box.textContent = LOGS.join("\n\n");
    ui.box.scrollTop = 0;
  }

  // ainda loga no console (se você abrir o frame certo)
  const clog = (...a) => console.log(scope + ":", ...a);

  // =========================
  // Helpers
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

  function clickAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("click",     { bubbles: true, clientX: x, clientY: y, button: 0 }));
    return true;
  }

  async function focusGrid() {
    const h = document.querySelector(GRID_HOST_SEL);
    if (!h) return null;
    try { h.scrollIntoView?.({ block: "center" }); } catch {}

    // clique dentro do host p/ “ativar” grid
    const r = h.getBoundingClientRect();
    const cx = Math.max(10, Math.min(window.innerWidth - 10, r.left + r.width * 0.50));
    const cy = Math.max(10, Math.min(window.innerHeight - 10, r.top  + Math.min(60, r.height * 0.25)));
    clickAt(cx, cy);

    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}
    await delay(DELAY.short);
    return h;
  }

  // =========================
  // "pressEnter" forte (do seu antigo)
  // =========================
  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fire = (type) => el.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
      })
    );
    fire("keydown"); fire("keypress"); fire("keyup");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(DELAY.short);
    el.blur?.();
    await delay(DELAY.short);
  }

  // =========================
  // Inputs editáveis (fora do shadow)
  // =========================
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

  // =========================
  // Criar nova linha (shadow fechado => atalhos)
  // =========================
  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 900);
    return !!proc;
  }

  async function tryInsertRow() {
    await focusGrid();
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

    // 3) Alt+I (alguns WF usam)
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(DELAY.mid);
    if (await hasEditorSoon()) return true;

    // 4) fallback coordenada (canto esquerdo da barra do grid)
    const h = document.querySelector(GRID_HOST_SEL);
    if (h) {
      const r = h.getBoundingClientRect();
      const x = Math.max(10, Math.min(window.innerWidth - 10, r.left + 120));
      const y = Math.max(10, Math.min(window.innerHeight - 10, r.top + 26));
      clickAt(x, y);
      await backpressure(DELAY.long);
      if (await hasEditorSoon()) return true;
    }

    return false;
  }

  // =========================
  // Confirmar linha (aproveita Ctrl+M do seu antigo)
  // =========================
  async function confirmRow() {
    // Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    // Ctrl+Enter (alguns grids confirmam assim)
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(DELAY.short);

    // Ctrl+M (seu fallback antigo)
    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  // =========================
  // Lock (evita duplo clique)
  // =========================
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  // =========================
  // ELEIÇÃO do frame certo (BroadcastChannel)
  // - escolhe o frame com maior "score" (viewport grande + host visível)
  // =========================
  const bc = new BroadcastChannel("HP_MASKARA_CASEMBRAPA");
  const myFrameId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  function frameScore() {
    try {
      const h = document.querySelector(GRID_HOST_SEL);
      if (!h) return 0;
      if (!isVisible(h)) return 1; // existe mas não está “na tela”
      const area = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
      // dá peso pra visibilidade real
      return 1000 + Math.min(5000000, area);
    } catch {
      return 0;
    }
  }

  let I_AM_LEADER = false;

  function setLeaderUI(enabled) {
    // se não líder, some com UI (mas mantém log box mínimo avisando)
    ui.btn.style.display = enabled ? "block" : "none";
    ui.head.innerHTML = enabled
      ? `<b>${scope}</b> • Leader frame ✅<br/>Kit: <b>${payload.kitKey || "—"}</b> • códigos: <b>${Array.isArray(payload.codes) ? payload.codes.length : 0}</b>`
      : `<b>${scope}</b> • Outro frame está ativo…<br/>Se não aparecer botão na sua tela, feche/abra o popup e rode de novo.`;
  }

  function electLeader() {
    const score = frameScore();
    bc.postMessage({ t: "candidate", id: myFrameId, score, w: window.innerWidth, h: window.innerHeight });
  }

  let best = { id: null, score: -1 };

  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "candidate") {
      if (m.score > best.score) best = { id: m.id, score: m.score };
    }
    if (m.t === "who_is_leader") {
      // responde com meu score
      bc.postMessage({ t: "candidate", id: myFrameId, score: frameScore(), w: window.innerWidth, h: window.innerHeight });
    }
  };

  // inicia eleição
  bc.postMessage({ t: "who_is_leader" });
  electLeader();

  setTimeout(() => {
    // depois de coletar candidatos, decide
    I_AM_LEADER = best.id === myFrameId;
    setLeaderUI(I_AM_LEADER);

    logLine("ok", "Runner carregado", {
      href: location.href,
      frame: { w: window.innerWidth, h: window.innerHeight },
      leader: I_AM_LEADER,
      bestScore: best.score,
      myScore: frameScore(),
      kitKey: payload.kitKey || null,
      codes: Array.isArray(payload.codes) ? payload.codes.length : 0,
    });

    clog("Runner carregado", { leader: I_AM_LEADER, best, myFrameId });
  }, 450);

  // =========================
  // RUN principal (com retries “estilo antigo”)
  // =========================
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      logLine("warn", "Lista vazia (payload.codes). Rode pelo popup.");
      return { ok: false, msg: "Lista vazia" };
    }

    if (!I_AM_LEADER) {
      logLine("warn", "Este não é o frame líder. Não vou rodar aqui.", { myFrameId, best });
      return { ok: false, msg: "Frame não líder" };
    }

    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return { ok: false, msg: "Já executando" };
    }
    window.__HP_RUN_LOCKS__[scope] = true;

    try {
      logLine("ok", "Iniciando inserção…", { total: list.length, tabela: TABELA_PADRAO, qtd: QUANTIDADE_PADRAO });

      for (let i = 0; i < list.length; i++) {
        const code = String(list[i]);

        // tenta criar linha até 3x (reaproveita ideia do antigo)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          logLine("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(800);
        }
        if (!opened) {
          logLine("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // tenta tabela (se aparecer)
        const tab = await waitEditable("TABELACOBRANCA", 1200);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        // procedimento
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          logLine("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(1200);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(700);

        // quantidade
        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitEditable("COBRADOQDE", 4500);
          if (qtd) {
            await setValueAndEnter(qtd, QUANTIDADE_PADRAO);
            await backpressure(350);
            // sem garantia de leitura; mas tentamos 3x como no seu antigo
            qtdOk = true;
            break;
          }
          await backpressure(250);
        }

        // confirma
        await confirmRow();

        // espera sair do modo edição (ajuda com "data channel busy")
        await backpressure(900);
        await waitNotEditable("PROCEDIMENTO", 25000);
        await backpressure(600);

        logLine("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await delay(PAUSA_ENTRE_CODIGOS);
      }

      logLine("ok", "Finalizado 🎉");
      return { ok: true, msg: "Finalizado" };
    } catch (e) {
      logLine("err", "Erro fatal", { error: String(e?.message || e) });
      return { ok: false, msg: String(e?.message || e) };
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  // =========================
  // Botão
  // =========================
  ui.btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }
    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return;
    }
    logLine("ok", `Executando ${list.length} códigos…`);
    await runInsercao(list);
  };

  // watchdog: se SPA mexer no DOM, recria UI/log
  const mo = new MutationObserver(() => ensureLogUI());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
