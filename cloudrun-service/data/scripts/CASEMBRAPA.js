/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "body"
  ],
  "actions": { "focus": "body" }
}*/

(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const scope = "CASEMBRAPA";
  const payload = window.__HP_PAYLOAD__ || {};
  const GRID_NAME = "gridSolicitacao_gridProcedimentosSimples";
  const GRID_HOST_SEL = `[data-grid-name='${GRID_NAME}']`;
  const GROUP_TITLE = "Demais Procedimentos";

  const DELAY = { tiny: 60, short: 120, mid: 220, long: 420 };
  const PAUSA_ENTRE_CODIGOS = 220;
  const QUANTIDADE_PADRAO = "1";
  const TABELA_PADRAO = "22";

  // trava por frame
  window.__HP_RUN_LOCKS__ = window.__HP_RUN_LOCKS__ || {};
  if (window.__HP_RUN_LOCKS__[scope] === undefined) window.__HP_RUN_LOCKS__[scope] = false;

  // =========================
  // UI (fixa / sem piscar)
  // =========================
  const LOGS = [];
  const nowTs = () => {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}]`;
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

  async function waitFor(fn, timeoutMs = 15000, stepMs = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await delay(stepMs);
    }
    return null;
  }

  function click(el) {
    if (!el) return false;
    try { el.scrollIntoView?.({ block: "center" }); } catch {}
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    return true;
  }

  function fireKey(target, type, opts) {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function backpressure(ms = 420) {
    await delay(ms);
    await new Promise((r) => requestAnimationFrame(() => r()));
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
    const fire = (type) =>
      el.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
        })
      );
    fire("keydown");
    fire("keypress");
    fire("keyup");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(DELAY.short);
    el.blur?.();
    await delay(DELAY.tiny);
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
  // Encontrar o grupo "Demais Procedimentos"
  // =========================
  function findGroupHeaderByTitle(titleText) {
    const headers = Array.from(document.querySelectorAll(".wf-form-view__group-header"));
    for (const h of headers) {
      const t = h.querySelector(".wf-form-view__group-title");
      if (!t) continue;
      const txt = (t.textContent || "").trim();
      if (txt.toLowerCase() === titleText.toLowerCase()) return h;
    }
    return null;
  }

  function findGroupBodyForHeader(headerEl) {
    if (!headerEl) return null;

    // o header tem data-for-group="386"
    const id = headerEl.getAttribute("data-for-group");
    if (id) {
      const body = document.querySelector(`.wf-form-view__group[data-group-name='${id}']`);
      if (body) return body;
    }

    // fallback: próximo irmão "grupo"
    let n = headerEl.nextElementSibling;
    while (n) {
      if (n.classList?.contains("wf-form-view__group")) return n;
      n = n.nextElementSibling;
    }
    return null;
  }

  async function ensureGroupOpen() {
    const header = findGroupHeaderByTitle(GROUP_TITLE);
    if (!header) return false;

    const body = findGroupBodyForHeader(header);

    // se o grid host já aparece visível, já está ok
    const hostNow = document.querySelector(GRID_HOST_SEL);
    if (hostNow && isVisible(hostNow)) return true;

    // tenta clicar no header para expandir
    click(header);
    await backpressure(360);

    // espera o grid host ficar visível
    const host = await waitFor(() => {
      const h = document.querySelector(GRID_HOST_SEL);
      if (h && isVisible(h)) return h;
      // às vezes o host existe mas a grid "anima"; aguarda
      if (body && isVisible(body)) {
        const hh = body.querySelector(GRID_HOST_SEL);
        if (hh && isVisible(hh)) return hh;
      }
      return null;
    }, 12000, 180);

    return !!host;
  }

  // =========================
  // Botão Inserir (aria-label="Inserir")
  // =========================
  function findInsertButtonNearGrid() {
    const host = document.querySelector(GRID_HOST_SEL);
    if (!host) return null;

    const group = host.closest(".wf-form-view__group") || host.parentElement;
    if (!group) return null;

    // pega o botão MAIS PRÓXIMO dentro do grupo
    const btn = group.querySelector(`button[aria-label="Inserir"]`);
    if (btn && isVisible(btn)) return btn;

    // fallback: procura no documento todo (se toolbar fica fora do grupo)
    const btn2 = document.querySelector(`button[aria-label="Inserir"]`);
    if (btn2 && isVisible(btn2)) return btn2;

    return null;
  }

  async function hasEditorSoon() {
    const proc = await waitEditable("PROCEDIMENTO", 900);
    return !!proc;
  }

  // =========================
  // Inserir linha: botão Inserir -> atalhos fallback
  // =========================
  async function tryInsertRow() {
    const okGroup = await ensureGroupOpen();
    if (!okGroup) return false;

    const host = document.querySelector(GRID_HOST_SEL);
    if (!host || !isVisible(host)) return false;

    // ✅ 1) clicar no button correto (aria-label="Inserir")
    const btnIns = findInsertButtonNearGrid();
    if (btnIns) {
      logLine("ok", "Clicando no botão Inserir (aria-label).");
      click(btnIns);
      await backpressure(520);
      if (await hasEditorSoon()) return true;
    } else {
      logLine("warn", "Botão Inserir não encontrado (tentando atalhos).");
    }

    // ✅ 2) fallback Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup", { key: "Insert", code: "Insert" });
    await backpressure(520);
    if (await hasEditorSoon()) return true;

    // ✅ 3) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup", { key: "n", code: "KeyN", ctrlKey: true });
    await backpressure(520);
    if (await hasEditorSoon()) return true;

    // ✅ 4) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup", { key: "i", code: "KeyI", altKey: true });
    await backpressure(520);
    if (await hasEditorSoon()) return true;

    return false;
  }

  async function confirmRow() {
    // Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup", { key: "Enter", code: "Enter" });
    await backpressure(180);

    // Ctrl+Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup", { key: "Enter", code: "Enter", ctrlKey: true });
    await backpressure(220);

    // Ctrl+M (fallback do seu antigo)
    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup", { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(420);
  }

  // =========================
  // Runner
  // =========================
  let STOP = false;
  ui.stop.onclick = () => {
    STOP = true;
    logLine("warn", "Parada solicitada. Vou interromper após a linha atual.");
  };

  function paintHeader() {
    const codesCount = Array.isArray(payload.codes) ? payload.codes.length : 0;
    const kit = payload.kitKey || "—";
    const hasGrid = !!document.querySelector(GRID_HOST_SEL);
    const visGrid = (() => {
      const h = document.querySelector(GRID_HOST_SEL);
      return !!(h && isVisible(h));
    })();

    ui.head.innerHTML = `
      <b>${scope}</b>
      <div style="opacity:.9;margin-top:6px">
        Kit: <b>${kit}</b> • códigos: <b>${codesCount}</b><br/>
        Grid: <b>${hasGrid ? (visGrid ? "detectado ✅" : "detectado (não visível)") : "não detectado"}</b>
      </div>
      <div style="opacity:.75;margin-top:6px">
        Deixe o grupo <b>“${GROUP_TITLE}”</b> aberto/visível e clique no botão azul.
      </div>
    `;
  }

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) {
      logLine("warn", "Nenhum código no payload. Rode pelo popup.");
      return;
    }
    if (window.__HP_RUN_LOCKS__[scope]) {
      logLine("warn", "Já executando…");
      return;
    }

    STOP = false;
    window.__HP_RUN_LOCKS__[scope] = true;

    try {
      paintHeader();

      logLine("ok", "Preparando tela… (abrindo grupo / esperando grid)");
      const okGroup = await ensureGroupOpen();
      if (!okGroup) {
        logLine("err", "Não consegui deixar o grupo visível.", {
          dica: `Abra manualmente o grupo “${GROUP_TITLE}” e deixe a grade aparecendo.`,
        });
        return;
      }

      logLine("ok", "Iniciando inserção…", {
        total: list.length,
        tabela: TABELA_PADRAO,
        qtd: QUANTIDADE_PADRAO,
      });

      for (let i = 0; i < list.length; i++) {
        if (STOP) {
          logLine("warn", "Execução interrompida pelo usuário.");
          break;
        }

        const code = String(list[i]);

        // abrir linha (até 3 tentativas)
        let opened = false;
        for (let t = 0; t < 3; t++) {
          opened = await tryInsertRow();
          if (opened) break;
          logLine("warn", `Falha ao abrir linha (tentativa ${t + 1}/3)`, { code });
          await backpressure(650);
        }
        if (!opened) {
          logLine("err", "Não consegui abrir a linha para inserir. Parando.", { code });
          break;
        }

        // tabela
        const tab = await waitEditable("TABELACOBRANCA", 1500);
        if (tab) {
          await setValueAndEnter(tab, TABELA_PADRAO);
          await backpressure(180);
        }

        // procedimento
        const proc = await waitEditable("PROCEDIMENTO", 20000);
        if (!proc) {
          logLine("warn", "PROCEDIMENTO não ficou editável (pulando)", { code });
          await backpressure(900);
          continue;
        }
        await setValueAndEnter(proc, code);
        await backpressure(520);

        // quantidade
        let qtdOk = false;
        for (let tent = 0; tent < 3; tent++) {
          const qtd = await waitEditable("COBRADOQDE", 6500);
          if (qtd) {
            await setValueAndEnter(qtd, QUANTIDADE_PADRAO);
            qtdOk = true;
            break;
          }
          await backpressure(250);
        }

        await confirmRow();
        await backpressure(650);

        // sair do modo edição
        await waitNotEditable("PROCEDIMENTO", 25000);
        await backpressure(350);

        logLine("ok", `Inserido ${code} (${i + 1}/${list.length})`, { qtdOk });
        await delay(PAUSA_ENTRE_CODIGOS);
      }

      logLine("ok", "Finalizado 🎉");
    } catch (e) {
      logLine("err", "Erro fatal", { error: String(e?.message || e) });
    } finally {
      window.__HP_RUN_LOCKS__[scope] = false;
      paintHeader();
    }
  }

  // clique do botão da UI
  ui.btn.onclick = async () => {
    const list = Array.isArray(payload.codes) ? payload.codes : [];
    logLine("ok", "Clique no botão recebido.", { codes: list.length, kitKey: payload.kitKey || null });
    await runInsercao(list);
  };

  // =========================
  // Observação leve (não travar)
  // =========================
  let lastPaint = 0;
  let pending = false;

  function schedulePaint() {
    if (pending) return;
    pending = true;
    const go = () => {
      pending = false;
      const now = Date.now();
      if (now - lastPaint > 250) {
        lastPaint = now;
        paintHeader();
      }
    };
    if ("requestIdleCallback" in window) {
      requestIdleCallback(go, { timeout: 500 });
    } else {
      setTimeout(go, 200);
    }
  }

  const mo = new MutationObserver(() => schedulePaint());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => paintHeader(), 1200);

  // boot
  paintHeader();
  logLine("ok", "Runner armado. Abra o SP-SADT e deixe “Demais Procedimentos” visível.", {
    href: location.href,
    kitKey: payload.kitKey || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0,
  });
})();
