/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "section.wf-form-view__group-header",
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "span.wf-form-view__group-title"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  const scope = "CASEMBRAPA";
  const payload = window.__HP_PAYLOAD__ || {};

  // =========================
  // CONFIG (anti-trava / busy channel)
  // =========================
  const DELAY = { tiny: 90, short: 170, mid: 280, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 260; // folga extra
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";
  const GROUP_TITLE_TXT = "Demais Procedimentos";

  // =========================
  // Logs em overlay (independe do console)
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
        width: 460px !important;
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
        background: rgba(0,0,0,.80) !important;
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
        right: 160px !important;
        top: 12px !important;
        z-index: 2147483647 !important;
        padding: 12px 14px !important;
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

  const ui = ensureUI();

  function logLine(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${nowTs()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(160);
    ui.box.textContent = LOGS.join("\n\n");
    ui.box.scrollTop = 0;
  }

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
    if (!el) return null;
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, clientX: x, clientY: y, button: 0 }));
    el.dispatchEvent(new MouseEvent("click",     { bubbles: true, clientX: x, clientY: y, button: 0 }));
    return el;
  }

  // =========================
  // LOCK + STOP
  // =========================
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  window.__HP_STOP__ = window.__HP_STOP__ || {};
  window.__HP_STOP__[scope] = false;

  ui.stop.onclick = () => {
    window.__HP_STOP__[scope] = true;
    logLine("warn", "Parar solicitado. Vou finalizar no próximo passo seguro.");
  };

  // =========================
  // Leader election simples (estável)
  // Só o frame que tem grid visível mostra UI
  // =========================
  const bc = new BroadcastChannel("HP_CASEMBRAPA_LEADER_V3");
  const myId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let I_AM_LEADER = false;
  let lastLeader = null;

  function frameScore() {
    const base = Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight);
    const host = document.querySelector(GRID_HOST_SEL);
    const hasHost = !!host;
    const visHost = hasHost && isVisible(host);
    // forte preferência: frame com grid visível e viewport maior
    return (visHost ? 100000000 : hasHost ? 20000000 : 1000000) + Math.min(900000, base);
  }

  function leaderTick() {
    const score = frameScore();
    bc.postMessage({ t: "cand", id: myId, score });
  }

  let best = { id: null, score: -1 };

  bc.onmessage = (ev) => {
    const m = ev.data || {};
    if (m.t === "cand") {
      if (m.score > best.score) best = { id: m.id, score: m.score };
    }
    if (m.t === "pulse") {
      // noop
    }
  };

  setInterval(() => { best = { id: null, score: -1 }; }, 1500);
  setInterval(leaderTick, 650);

  setInterval(() => {
    const chosen = best.id || myId; // se ninguém respondeu, assume
    I_AM_LEADER = (chosen === myId);
    if (lastLeader !== chosen) {
      lastLeader = chosen;
      paintHeader();
      ui.btn.style.display = I_AM_LEADER ? "block" : "none";
      ui.stop.style.display = I_AM_LEADER ? "block" : "none";
    }
  }, 750);

  function paintHeader() {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || payload.kit || "—";
    const host = document.querySelector(GRID_HOST_SEL);
    const hasHost = !!host;
    const visHost = hasHost && isVisible(host);

    ui.head.innerHTML = `
      <b>${scope}</b> • ${I_AM_LEADER ? "Frame ativo ✅" : "Outro frame ativo…"}
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid: <b>${visHost ? "visível ✅" : hasHost ? "detectado (não visível)" : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe o grupo <b>“${GROUP_TITLE_TXT}”</b> aberto/visível na tela.
      </div>
    `;
  }

  paintHeader();

  // =========================
  // Expandir grupo “Demais Procedimentos”
  // =========================
  function findGroupHeader() {
    const headers = Array.from(document.querySelectorAll("section.wf-form-view__group-header"));
    return headers.find(h => (h.textContent || "").includes(GROUP_TITLE_TXT)) || null;
  }

  async function ensureGroupVisible() {
    const hdr = findGroupHeader();
    if (!hdr) return false;

    // tenta rolar até o header
    try { hdr.scrollIntoView?.({ block: "center" }); } catch {}

    // se o grid já está visível, ok
    const host = document.querySelector(GRID_HOST_SEL);
    if (host && isVisible(host)) return true;

    // clique para expandir (se estiver fechado)
    hdr.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    hdr.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    hdr.click();
    await backpressure(DELAY.mid);

    const ok = await waitFor(() => {
      const h = document.querySelector(GRID_HOST_SEL);
      return h && isVisible(h);
    }, 8000, 200);

    return !!ok;
  }

  // =========================
  // Inserir linha: HIT-TEST no botão "Inserir" (shadow closed)
  // =========================
  function tryClickInsertByHitTest(host) {
    const r = host.getBoundingClientRect();

    // região típica da toolbar/top bar dentro do componente
    const y = Math.max(8, Math.min(window.innerHeight - 8, r.top + 18));
    const xStart = Math.max(8, Math.min(window.innerWidth - 8, r.left + 10));
    const xEnd   = Math.max(8, Math.min(window.innerWidth - 8, r.left + Math.min(260, r.width - 10)));

    // varre pontos e tenta achar um elemento com aria-label "Inserir"
    for (let x = xStart; x <= xEnd; x += 14) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      const al = (el.getAttribute?.("aria-label") || "").toLowerCase();
      if (al.includes("inserir")) {
        el.click();
        return true;
      }
      // às vezes o ponto cai no <i> dentro do botão
      const p = el.closest?.("button");
      const pal = (p?.getAttribute?.("aria-label") || "").toLowerCase();
      if (p && pal.includes("inserir")) {
        p.click();
        return true;
      }
    }

    // fallback: clique em posição “provável” do +
    clickAt(Math.min(window.innerWidth - 10, r.left + 95), y);
    return true;
  }

  async function focusGridHost(host) {
    try { host.scrollIntoView?.({ block: "center" }); } catch {}
    const r = host.getBoundingClientRect();
    clickAt(Math.max(10, r.left + r.width * 0.35), Math.max(10, r.top + 80));
    try { window.focus?.(); } catch {}
    try { document.body?.focus?.(); } catch {}
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
    }, timeoutMs, 150);
  }

  async function waitNotEditable(name, timeoutMs = 20000) {
    return waitFor(() => {
      const el = document.querySelector(`input[name='${name}']`);
      if (!el) return true;
      if (!isVisible(el)) return true;
      if (el.disabled) return true;
      if (el.readOnly) return true;
      return false;
    }, timeoutMs, 170);
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

  async function tryInsertRow() {
    const host = document.querySelector(GRID_HOST_SEL);
    if (!host || !isVisible(host)) return false;

    await focusGridHost(host);
    await backpressure(DELAY.short);

    // 1) tenta clicar no botão Inserir (hit-test)
    const clicked = tryClickInsertByHitTest(host);
    await backpressure(DELAY.mid);

    // 2) atalho extra (algumas telas respondem)
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(DELAY.mid);

    // sucesso = PROCEDIMENTO editável
    const ok = await waitEditable("PROCEDIMENTO", 8000);
    return !!ok || !!clicked;
  }

  async function confirmRow() {
    // Enter + Ctrl+M (seu fallback)
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  // =========================
  // Runner principal
  // =========================
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }
    if (!I_AM_LEADER) {
      logLine("warn", "Este frame não é o ativo. Abra a tela do grid e tente novamente.");
      return;
    }
    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return;
    }

    window.__HP_RUN_LOCKS__[scope] = true;
    window.__HP_STOP__[scope] = false;

    try {
      logLine("ok", "Preparando tela… (abrindo grupo / esperando grid)");

      const groupOk = await ensureGroupVisible();
      if (!groupOk) {
        logLine("err", "Não consegui deixar o grupo visível.", {
          dica: "Abra manualmente o grupo “Demais Procedimentos” e deixe a grade aparecendo."
        });
        return;
      }

      const host = await waitFor(() => {
        const h = document.querySelector(GRID_HOST_SEL);
        return h && isVisible(h) ? h : null;
      }, 30000, 250);

      if (!host) {
        logLine("err", "Grid não ficou visível neste frame.", {
          dica: "Você está na tela certa? Precisa aparecer a tabela com colunas 24/25/27."
        });
        return;
      }

      logLine("ok", "Iniciando inserção…", { total: list.length, tabela: TABELA_PADRAO, qtd: QUANTIDADE_PADRAO });

      for (let i = 0; i < list.length; i++) {
        if (window.__HP_STOP__[scope]) {
          logLine("warn", "Execução interrompida pelo usuário.");
          break;
        }

        const code = String(list[i]);

        // abre linha (até 3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          logLine("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(900);
        }
        if (!opened) {
          logLine("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // TABELA (se ficar editável)
        const tab = await waitEditable("TABELACOBRANCA", 1600);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        // PROCEDIMENTO
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          logLine("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(1200);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(900);

        // QUANTIDADE
        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitEditable("COBRADOQDE", 7000);
          if (qtd) {
            await setValueAndEnter(qtd, QUANTIDADE_PADRAO);
            qtdOk = true;
            break;
          }
          await backpressure(350);
        }

        // CONFIRMA
        await confirmRow();
        await backpressure(1100);

        // espera sair do modo edição (evita “busy data channel”)
        await waitNotEditable("PROCEDIMENTO", 30000);
        await backpressure(800);

        logLine("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await delay(PAUSA_ENTRE_CODIGOS);
      }

      logLine("ok", "Finalizado 🎉");
    } catch (e) {
      logLine("err", "Erro fatal", { error: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
    }
  }

  ui.btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    logLine("ok", "Clique no botão recebido.", { codes: list.length, kitKey: payload.kitKey || null });
    await runInsercao(list);
  };

  // Watch leve (não agressivo, pra não travar)
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      logLine("ok", "Mudou de página (SPA)", { href: lastHref });
      paintHeader();
    }
  }, 1200);

  logLine("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.");
})();
