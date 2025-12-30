/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "span.wf-form-view__group-title",
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "section.wf-form-view__group-header"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  const scope = "CASEMBRAPA";
  const payload = window.__HP_PAYLOAD__ || {};

  // ===== CONFIG =====
  const DELAY = { tiny: 90, short: 170, mid: 280, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 260;
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";
  const GROUP_TITLE_TXT = "Demais Procedimentos";

  // ===== Helpers =====
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

  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fire = (type) =>
      el.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true, cancelable: true,
        key: "Enter", code: "Enter", keyCode: 13, which: 13
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

  // ===== Overlay UI (só aparece no frame que tem grid visível) =====
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

  // ===== LOCK + STOP =====
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  window.__HP_STOP__ = window.__HP_STOP__ || {};
  window.__HP_STOP__[scope] = false;

  ui.stop.onclick = () => {
    window.__HP_STOP__[scope] = true;
    logLine("warn", "Parar solicitado. Vou finalizar no próximo passo seguro.");
  };

  // ===== Detecta se ESTE frame é o correto: grid visível =====
  function getGridHostVisible() {
    const h = document.querySelector(GRID_HOST_SEL);
    return (h && isVisible(h)) ? h : null;
  }

  function repaintHeader() {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || payload.kit || "—";
    const host = document.querySelector(GRID_HOST_SEL);
    const hasHost = !!host;
    const visHost = hasHost && isVisible(host);

    ui.head.innerHTML = `
      <b>${scope}</b> • ${visHost ? "Frame do grid ✅" : "Frame errado…"}
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid: <b>${visHost ? "visível" : hasHost ? "detectado (não visível)" : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Se estiver “Frame errado…”, role até ver a tabela de <b>“Demais Procedimentos”</b>.
      </div>
    `;
  }

  // Só mostra os botões no frame certo
  function setUiVisibility() {
    const visHost = !!getGridHostVisible();
    ui.btn.style.display = visHost ? "block" : "none";
    ui.stop.style.display = visHost ? "block" : "none";
  }

  // ===== Expandir grupo “Demais Procedimentos” =====
  function findGroupHeaderByTitle() {
    // acha o SPAN do título e sobe até o header clicável
    const spans = Array.from(document.querySelectorAll("span.wf-form-view__group-title"));
    const s = spans.find(x => (x.textContent || "").trim() === GROUP_TITLE_TXT);
    if (!s) return null;
    return s.closest("section.wf-form-view__group-header[role='button']") || null;
  }

  async function ensureGroupVisible() {
    const hdr = findGroupHeaderByTitle();
    if (!hdr) return false;

    try { hdr.scrollIntoView?.({ block: "center" }); } catch {}
    await backpressure(DELAY.short);

    // se já está visível, ok
    if (getGridHostVisible()) return true;

    // clique para expandir
    hdr.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    hdr.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    hdr.click();
    await backpressure(DELAY.long);

    return !!getGridHostVisible();
  }

  // ===== Inserir linha (shadow closed => hit-test no botão Inserir) =====
  function tryClickInsertByHitTest(host) {
    const r = host.getBoundingClientRect();

    // tenta achar o botão Inserir pelo aria-label varrendo a faixa superior
    const y = Math.max(8, Math.min(window.innerHeight - 8, r.top + 18));
    const xStart = Math.max(8, Math.min(window.innerWidth - 8, r.left + 10));
    const xEnd = Math.max(8, Math.min(window.innerWidth - 8, r.left + Math.min(280, r.width - 10)));

    for (let x = xStart; x <= xEnd; x += 14) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;

      const btn = el.closest?.("button") || (el.tagName === "BUTTON" ? el : null);
      const al = (btn?.getAttribute?.("aria-label") || "").toLowerCase();
      if (al.includes("inserir")) {
        btn.click();
        return true;
      }
    }

    // fallback: clique “provável” do +
    clickAt(Math.min(window.innerWidth - 10, r.left + 95), y);
    return true;
  }

  async function focusGridHost(host) {
    try { host.scrollIntoView?.({ block: "center" }); } catch {}
    const r = host.getBoundingClientRect();
    clickAt(Math.max(10, r.left + r.width * 0.35), Math.max(10, r.top + 80));
    await delay(DELAY.short);
  }

  async function tryInsertRow() {
    const host = getGridHostVisible();
    if (!host) return false;

    await focusGridHost(host);
    await backpressure(DELAY.short);

    tryClickInsertByHitTest(host);
    await backpressure(DELAY.mid);

    // atalho extra
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(DELAY.mid);

    // sucesso = PROCEDIMENTO editável
    const ok = await waitEditable("PROCEDIMENTO", 9000);
    return !!ok;
  }

  async function confirmRow() {
    // Enter + Ctrl+M
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  // ===== Runner principal =====
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }

    // só roda no frame certo
    if (!getGridHostVisible()) {
      logLine("err", "Este frame não tem o grid visível. Role até a tabela e tente de novo.");
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

      // tenta expandir (se já estiver aberto, ok)
      const groupOk = await ensureGroupVisible();
      if (!groupOk) {
        logLine("warn", "Não consegui abrir pelo header. (Se já estiver aberto, ignore).");
      }

      // garante grid visível
      const host = await waitFor(() => getGridHostVisible(), 15000, 250);
      if (!host) {
        logLine("err", "Grid não ficou visível aqui.", {
          dica: "Abra manualmente o grupo “Demais Procedimentos” e deixe a tabela aparecendo."
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

        // abre linha
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

        // TABELA
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

        await confirmRow();
        await backpressure(1100);

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

  // ===== Loop leve: mostra UI só no frame certo (sem piscar) =====
  let lastState = null;
  setInterval(() => {
    repaintHeader();
    setUiVisibility();

    const vis = !!getGridHostVisible();
    const state = vis ? "GRID_OK" : "NO_GRID";
    if (state !== lastState) {
      lastState = state;
      logLine("ok", vis ? "Grid visível neste frame ✅" : "Aguardando você rolar até o grid…");
    }
  }, 900);

  repaintHeader();
  setUiVisibility();
  logLine("ok", "Runner armado. Role até ver a tabela de “Demais Procedimentos”.");
})();
