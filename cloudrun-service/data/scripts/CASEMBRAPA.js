/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "body"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  // =========================
  // CASEMBRAPA – Inserção “Demais Procedimentos” (Salútis / WF)
  // - Anti-pisca: líder fixo e UI só no frame visível com grid
  // - Inserção: tenta clicar no "+" do grid; fallback atalhos
  // - Passos lentos p/ evitar "busy data channel"
  // =========================

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // ===== Config =====
  const GRID_NAME = "gridSolicitacao_gridProcedimentosSimples";
  const GRID_HOST_SEL = `[data-grid-name='${GRID_NAME}']`;
  const GROUP_TITLE = "Demais Procedimentos";

  const DELAY = { tiny: 80, short: 150, mid: 260, long: 520 };
  const PAUSA_ENTRE_CODIGOS = 260;
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  // ===== Utils =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function backpressure(ms) { await sleep(ms); await raf(); }

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const rects = el.getClientRects?.();
    return !!(rects && rects.length);
  }

  function frameLooksReal() {
    // evita UI no frame minúsculo/invisível
    if (window.innerWidth < 520 || window.innerHeight < 360) return false;
    return true;
  }

  async function waitFor(fn, timeoutMs = 15000, stepMs = 140) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
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

  function click(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    return true;
  }

  // ===== Overlay (logs sem depender do console) =====
  const LOGS = [];
  const ts = () => {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
  };

  function ensureUI() {
    // Só desenha UI no frame que parece ser o "real"
    if (!frameLooksReal()) return null;

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
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
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
        display: none !important;
      `;
      document.documentElement.appendChild(stop);
    }

    return { wrap, head, box, btn, stop };
  }

  const ui = ensureUI();
  function log(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${ts()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(160);
    if (ui?.box) {
      ui.box.textContent = LOGS.join("\n\n");
      ui.box.scrollTop = 0;
    }
  }

  // ===== Lock + Stop flag =====
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;
  window.__HP_RUN_STOP__ = window.__HP_RUN_STOP__ || {};
  if (window.__HP_RUN_STOP__[scope] === undefined) window.__HP_RUN_STOP__[scope] = false;

  // =========================
  // Leader FIXO (sem “piscar”)
  // =========================
  // Critério: este frame é leader se:
  // - viewport decente
  // - grid host existe e está visível
  function iAmLeaderNow() {
    if (!frameLooksReal()) return false;
    const host = document.querySelector(GRID_HOST_SEL);
    return !!(host && isVisible(host));
  }

  function paintHeader() {
    if (!ui?.head) return;
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || "—";
    const host = document.querySelector(GRID_HOST_SEL);
    const leader = iAmLeaderNow();

    ui.head.innerHTML = `
      <b>${scope}</b> • ${leader ? "Frame com grid ✅" : "Abra a tela do grid…"}
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid: <b>${host ? (isVisible(host) ? "visível" : "existe (não visível)") : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe o grupo <b>${GROUP_TITLE}</b> aberto e a grade aparecendo.
      </div>
    `;
  }

  // =========================
  // Abrir o grupo “Demais Procedimentos”
  // =========================
  function findGroupHeader() {
    // header tem data-for-group e título no span
    const headers = Array.from(document.querySelectorAll(".wf-form-view__group-header"));
    const h = headers.find(x => (x.textContent || "").includes(GROUP_TITLE));
    return h || null;
  }

  function groupIsExpanded() {
    // Heurística: se o grid host está visível, consideramos ok
    const host = document.querySelector(GRID_HOST_SEL);
    return !!(host && isVisible(host));
  }

  async function ensureGroupOpen() {
    if (groupIsExpanded()) return true;

    const header = findGroupHeader();
    if (!header) {
      log("warn", "Não achei o header do grupo (procurei pelo título).", { grupo: GROUP_TITLE });
      return false;
    }

    // clicar no header algumas vezes
    for (let i = 0; i < 4; i++) {
      click(header);
      await backpressure(DELAY.long);
      if (groupIsExpanded()) return true;
    }

    return groupIsExpanded();
  }

  // =========================
  // Encontrar o botão “+” do toolbar do grid
  // =========================
  function findGridToolbarPlusButton() {
    const host = document.querySelector(GRID_HOST_SEL);
    if (!host) return null;

    // o toolbar costuma estar “perto” do host, dentro do mesmo bloco do grupo
    // subimos até um container razoável
    const group = host.closest(".wf-form-view__group") || host.parentElement;

    if (!group) return null;

    // pega botões/clickables com ícone de add/plus
    const candidates = Array.from(group.querySelectorAll("button, [role='button'], a, i.wf-icons, span.wf-icons"));

    const byTextOrIcon = candidates.find(el => {
      const t = (el.getAttribute("title") || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.textContent || "");
      const tt = t.toLowerCase();
      if (tt.includes("inser") || tt.includes("novo") || tt.includes("adicion") || tt.includes("incluir")) return true;
      // ícone + pode vir como texto "+"
      if (t.trim() === "+") return true;
      // wf-icons às vezes guarda "add"
      if (tt.includes("add") || tt.includes("plus")) return true;
      return false;
    });

    // fallback: o primeiro botão visível bem no topo do bloco do grid (onde fica o toolbar)
    const visibleButtons = candidates.filter(isVisible);
    return byTextOrIcon && isVisible(byTextOrIcon) ? byTextOrIcon : (visibleButtons[0] || null);
  }

  // =========================
  // Editores de célula (inputs name=...)
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

  async function pressEnter(el) {
    if (!el) return;
    el.focus?.();
    const fire = (type) => el.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13
    }));
    fire("keydown"); fire("keypress"); fire("keyup");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(DELAY.short);
    el.blur?.();
    await sleep(DELAY.short);
  }

  async function setValueAndEnter(input, value) {
    input.focus();
    input.value = "";
    fireInput(input);
    await sleep(DELAY.tiny);

    input.value = String(value);
    fireInput(input);
    await pressEnter(input);
    await sleep(DELAY.short);
  }

  // =========================
  // Inserir linha: 1) clique no "+"
  //             2) fallback atalhos
  // =========================
  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 900);
    return !!proc;
  }

  async function tryInsertRow() {
    // 0) garantir grupo aberto
    const okGroup = await ensureGroupOpen();
    if (!okGroup) return false;

    const host = document.querySelector(GRID_HOST_SEL);
    if (!host || !isVisible(host)) return false;

    // 1) clique no + do toolbar
    const plus = findGridToolbarPlusButton();
    if (plus) {
      log("ok", "Clicando no + do grid (toolbar)…");
      click(plus);
      await backpressure(DELAY.long);
      if (await hasEditorSoon()) return true;
    } else {
      log("warn", "Não encontrei o botão + do grid. Vou tentar atalhos.");
    }

    // 2) Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup",   { key: "Insert", code: "Insert" });
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    // 3) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup",   { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    // 4) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup",   { key: "i", code: "KeyI", altKey: true });
    await backpressure(DELAY.long);
    if (await hasEditorSoon()) return true;

    return false;
  }

  async function confirmRow() {
    // tenta Post/Confirm via Enter e Ctrl+M (seu fallback antigo)
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup",   { key: "Enter", code: "Enter" });
    await backpressure(DELAY.short);

    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(DELAY.long);
  }

  // =========================
  // RUN principal
  // =========================
  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      log("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }

    // só roda no frame que tem grid visível
    if (!iAmLeaderNow()) {
      log("warn", "Este frame não está com o grid visível. Abra a tela do SP-SADT e deixe o grupo aberto.");
      return;
    }

    if (window.__HP_RUN_LOCKS__[scope]) {
      log("warn", "Já executando…");
      return;
    }

    window.__HP_RUN_LOCKS__[scope] = true;
    window.__HP_RUN_STOP__[scope] = false;

    if (ui?.stop) ui.stop.style.display = "block";

    try {
      log("ok", "Iniciando inserção…", { total: list.length, tabela: TABELA_PADRAO, qtd: QUANTIDADE_PADRAO });

      // garantir grupo aberto antes de começar
      log("ok", "Preparando tela… (abrindo grupo / esperando grid)");
      const okGroup = await ensureGroupOpen();
      if (!okGroup) {
        log("err", "Não consegui deixar o grupo visível.", { dica: `Abra manualmente o grupo “${GROUP_TITLE}” e deixe a grade aparecendo.` });
        return;
      }

      // loop
      for (let i = 0; i < list.length; i++) {
        if (window.__HP_RUN_STOP__[scope]) {
          log("warn", "Execução interrompida pelo usuário.");
          break;
        }

        const code = String(list[i]);

        // abre linha (até 3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          log("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(900);
        }
        if (!opened) {
          log("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // tabela (se aparecer)
        const tab = await waitEditable("TABELACOBRANCA", 1400);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(DELAY.short);
        }

        // procedimento
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          log("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(1200);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(700);

        // quantidade
        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitEditable("COBRADOQDE", 6000);
          if (qtd) {
            await setValueAndEnter(qtd, QUANTIDADE_PADRAO);
            qtdOk = true;
            break;
          }
          await backpressure(300);
        }

        // confirma
        await confirmRow();
        await backpressure(900);

        // espera sair do modo edição
        await waitNotEditable("PROCEDIMENTO", 25000);
        await backpressure(650);

        log("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await sleep(PAUSA_ENTRE_CODIGOS);
      }

      log("ok", "Finalizado 🎉");
    } catch (e) {
      log("err", "Erro fatal", { error: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
      if (ui?.stop) ui.stop.style.display = "none";
    }
  }

  // =========================
  // UI events
  // =========================
  if (ui?.btn) {
    ui.btn.onclick = async () => {
      const list = Array.isArray(payload.codes) ? payload.codes : [];
      log("ok", "Clique no botão recebido.", { codes: list.length, kitKey: payload.kitKey || null });
      await runInsercao(list);
    };
  }

  if (ui?.stop) {
    ui.stop.onclick = () => {
      window.__HP_RUN_STOP__[scope] = true;
      log("warn", "Parar solicitado.");
    };
  }

  // =========================
  // Watch leve (sem MutationObserver agressivo)
  // =========================
  paintHeader();
  setInterval(() => {
    paintHeader();
    // se o grid aparecer, a UI fica pronta (sem “eleição”)
    // nada de reeleição/BC aqui pra não piscar.
  }, 700);

  log("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.", {
    href: location.href,
    kitKey: payload.kitKey || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0
  });
})();
