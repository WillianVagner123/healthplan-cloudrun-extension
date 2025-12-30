/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "button[aria-label='Inserir']",
    "input[name='PROCEDIMENTO']"
  ],
  "actions": { "focus": "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  // =========================
  // ✅ FRAME FILTER (igual GEAP)
  // Só continua se ESTE frame tem a grade + botão Inserir (real)
  // =========================
  const GRID_HOST_SEL = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  function findGridHost() {
    try { return document.querySelector(GRID_HOST_SEL); } catch { return null; }
  }

  function findInsertButton(root) {
    // seu botão real:
    // <button ... aria-label="Inserir"><i class="wf-icons">add</i>...</button>
    try {
      const direct = document.querySelector("button[aria-label='Inserir']");
      if (direct) return direct;

      // fallback: botão com ícone add dentro da área da grid
      const area = root || document;
      const byIcon = area.querySelector("button .wf-icons")
        ? Array.from(area.querySelectorAll("button")).find(b => {
            const i = b.querySelector(".wf-icons");
            return i && (i.textContent || "").trim() === "add";
          })
        : null;

      return byIcon || null;
    } catch {
      return null;
    }
  }

  const gridHost = findGridHost();
  const insertBtn = gridHost ? findInsertButton(gridHost.closest("section") || document) : null;

  // Se não for o frame certo, sai SILENCIOSO (importantíssimo)
  if (!gridHost || !insertBtn) return;

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

  async function waitFor(fn, timeoutMs = 20000, stepMs = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await delay(stepMs);
    }
    return null;
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fireKey(el, type, opts) {
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
  }

  async function pressEnter(el) {
    el.focus?.();
    fireKey(el, "keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    fireKey(el, "keyup",   { key: "Enter", code: "Enter", keyCode: 13, which: 13 });
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(140);
    el.blur?.();
    await delay(80);
  }

  async function setValueAndEnter(el, value) {
    el.focus?.();
    el.value = "";
    fireInput(el);
    await delay(60);

    el.value = String(value);
    fireInput(el);
    await delay(60);

    await pressEnter(el);
  }

  async function backpressure(ms = 250) {
    await delay(ms);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }

  // =========================
  // UI (não pisca)
  // =========================
  const LOGS = [];
  const ui = (() => {
    const wrapId = "hp_case_wrap_v3";
    let wrap = document.getElementById(wrapId);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = wrapId;
      wrap.style.cssText = `
        position: fixed !important;
        right: 14px !important;
        top: 14px !important;
        width: 380px !important;
        max-width: calc(100vw - 28px) !important;
        z-index: 2147483647 !important;
        font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto !important;
        color: #fff !important;
      `;
      document.documentElement.appendChild(wrap);
    }

    wrap.innerHTML = `
      <div style="background: rgba(0,0,0,.78); border-radius: 12px; padding: 10px 12px; box-shadow: 0 10px 24px rgba(0,0,0,.25)">
        <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
          <div>
            <b>${scope}</b><div style="opacity:.85">Kit: <b>${payload.kitKey || "—"}</b> • códigos: <b>${Array.isArray(payload.codes) ? payload.codes.length : 0}</b></div>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="hp_case_run_v3" style="padding:8px 10px;border-radius:10px;border:none;background:#0d6efd;color:#fff;font-weight:800;cursor:pointer;">⚡ Inserir</button>
            <button id="hp_case_stop_v3" style="padding:8px 10px;border-radius:10px;border:none;background:#dc3545;color:#fff;font-weight:800;cursor:pointer;">⛔ Parar</button>
          </div>
        </div>
        <div id="hp_case_hint_v3" style="margin-top:8px; opacity:.9">
          Frame OK ✅ (grade + botão Inserir detectados)
        </div>
      </div>
      <div id="hp_case_logs_v3" style="margin-top:8px;background: rgba(0,0,0,.65); border-radius: 12px; padding: 10px 12px; max-height: 260px; overflow:auto; white-space: pre-wrap; box-shadow: 0 10px 24px rgba(0,0,0,.18)"></div>
    `;

    return {
      wrap,
      btnRun: document.getElementById("hp_case_run_v3"),
      btnStop: document.getElementById("hp_case_stop_v3"),
      hint: document.getElementById("hp_case_hint_v3"),
      logs: document.getElementById("hp_case_logs_v3"),
    };
  })();

  function ts() {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}]`;
  }

  function log(kind, msg, data) {
    const mark = kind === "ok" ? "✅" : kind === "warn" ? "⚠️" : kind === "err" ? "❌" : "•";
    const line = `${ts()} ${mark} ${msg}${data ? `\n${JSON.stringify(data, null, 2)}` : ""}`;
    LOGS.unshift(line);
    LOGS.splice(160);
    ui.logs.textContent = LOGS.join("\n\n");
    ui.logs.scrollTop = 0;
  }

  // =========================
  // Ações específicas do Salutis / wf-grid
  // =========================
  function findGroupHeaderDemais() {
    // header do grupo: <section class="wf-form-view__group-header"...> ... <span>Demais Procedimentos</span>
    const spans = Array.from(document.querySelectorAll("span.wf-form-view__group-title"));
    const sp = spans.find(s => (s.textContent || "").trim().toLowerCase() === "demais procedimentos");
    return sp ? sp.closest("section.wf-form-view__group-header") : null;
  }

  async function ensureGroupOpen() {
    const header = findGroupHeaderDemais();
    if (!header) return true; // não força, só segue

    // rola pra ele
    try { header.scrollIntoView?.({ block: "center" }); } catch {}
    await delay(120);

    // alguns temas usam atributo aria-expanded no header (nem sempre)
    const aria = header.getAttribute("aria-expanded");
    if (aria === "true") return true;

    // se o gridHost está visível, já está aberto
    if (isVisible(gridHost)) return true;

    // tenta abrir clicando no header
    header.click();
    await delay(600);

    // espera grid aparecer
    const ok = await waitFor(() => isVisible(findGridHost()), 8000, 150);
    return !!ok;
  }

  function findConfirmButton() {
    // tenta achar um botão de confirmar (check) na toolbar do grid
    // fallback: Ctrl+M
    const root = (gridHost.closest("section") || document);

    // por aria-label
    const byAria = root.querySelector("button[aria-label*='Confirm'], button[aria-label*='Salvar'], button[aria-label*='Gravar']");
    if (byAria) return byAria;

    // por ícone check
    const btns = Array.from(root.querySelectorAll("button"));
    const byIcon = btns.find(b => {
      const i = b.querySelector(".wf-icons");
      const t = (i?.textContent || "").trim();
      return t === "check" || t === "done";
    });
    return byIcon || null;
  }

  async function clickButton(btn) {
    if (!btn) return false;
    try { btn.scrollIntoView?.({ block: "center" }); } catch {}
    await delay(60);
    btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    btn.click();
    btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await delay(180);
    return true;
  }

  // inputs possíveis (Salutis muda nomes)
  const FIELD_TABLE_CANDIDATES = ["TABELACOBRANCA", "TABELA", "TABELAITEM", "TABELA_COBRANCA"];
  const FIELD_PROC = "PROCEDIMENTO";
  const FIELD_QTD_CANDIDATES = ["COBRADOQDE", "QTDSOLICITADA", "QTD_SOLICITADA", "QTD", "QTDE"];

  async function waitEditableByNames(names, timeoutMs = 10000) {
    const arr = Array.isArray(names) ? names : [names];
    return waitFor(() => {
      for (const n of arr) {
        const el = document.querySelector(`input[name='${n}']`);
        if (el && isVisible(el) && !el.disabled && !el.readOnly) return el;
      }
      return null;
    }, timeoutMs, 120);
  }

  async function openNewRow() {
    // botão Inserir real
    const currentGrid = findGridHost();
    const btn = findInsertButton(currentGrid?.closest("section") || document) || insertBtn;

    if (!btn) return false;

    // clica inserir
    await clickButton(btn);

    // espera o editor de PROCEDIMENTO aparecer
    const proc = await waitEditableByNames(FIELD_PROC, 12000);
    return !!proc;
  }

  async function confirmRow() {
    const btn = findConfirmButton();
    if (btn) {
      await clickButton(btn);
      await backpressure(350);
      return;
    }

    // fallback: Ctrl+M (seu antigo)
    fireKey(document, "keydown", { key: "m", code: "KeyM", ctrlKey: true });
    fireKey(document, "keyup",   { key: "m", code: "KeyM", ctrlKey: true });
    await backpressure(450);
  }

  // =========================
  // RUN
  // =========================
  let STOP = false;

  async function runInsercao() {
    const list = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
    if (!list.length) {
      log("warn", "Sem códigos no payload (rode pelo popup).");
      return;
    }

    STOP = false;
    ui.hint.textContent = "Executando… (você pode clicar em ⛔ Parar)";

    log("ok", "Preparando tela… (abrindo grupo / esperando grade)");

    const okGroup = await ensureGroupOpen();
    if (!okGroup) {
      log("warn", "Não consegui abrir o grupo automaticamente. Abra manualmente 'Demais Procedimentos' e tente de novo.");
    }

    // garante que o grid está visível no frame
    const okGrid = await waitFor(() => {
      const g = findGridHost();
      return g && isVisible(g);
    }, 15000, 150);

    if (!okGrid) {
      log("err", "Grid não ficou visível neste frame.", {
        dica: "Role até 'Demais Procedimentos' e deixe a grade aparecendo (linhas visíveis)."
      });
      ui.hint.textContent = "Pareceu frame errado/grade não visível.";
      return;
    }

    log("ok", "Grade detectada e visível. Iniciando inserção…", { total: list.length });

    // defaults
    const TABELA_PADRAO = "22";
    const QTD_PADRAO = "1";

    for (let i = 0; i < list.length; i++) {
      if (STOP) {
        log("warn", "Parado pelo usuário.");
        break;
      }

      const code = list[i];

      // abre linha
      let opened = false;
      for (let t = 0; t < 3; t++) {
        opened = await openNewRow();
        if (opened) break;
        await backpressure(500);
      }
      if (!opened) {
        log("err", "Não consegui clicar em Inserir / abrir editor.", { code });
        break;
      }

      // tabela (se existir)
      const tab = await waitEditableByNames(FIELD_TABLE_CANDIDATES, 1200);
      if (tab) {
        await setValueAndEnter(tab, TABELA_PADRAO);
        await backpressure(180);
      }

      // procedimento (obrigatório)
      const proc = await waitEditableByNames(FIELD_PROC, 12000);
      if (!proc) {
        log("warn", "Campo PROCEDIMENTO não apareceu. Pulando.", { code });
        await backpressure(600);
        continue;
      }
      await setValueAndEnter(proc, code);
      await backpressure(250);

      // quantidade (tenta várias possibilidades)
      const qtd = await waitEditableByNames(FIELD_QTD_CANDIDATES, 2200);
      if (qtd) {
        await setValueAndEnter(qtd, QTD_PADRAO);
        await backpressure(200);
      }

      // confirmar
      await confirmRow();
      await backpressure(450);

      log("ok", `Inserido ${code} (${i + 1}/${list.length})`);
      await backpressure(300);  // folga pra não “travar”
    }

    ui.hint.textContent = STOP ? "Parado." : "Finalizado ✅";
    log("ok", STOP ? "Execução interrompida." : "Finalizado 🎉");
  }

  ui.btnRun.onclick = () => {
    log("ok", "Clique no botão recebido.", { codes: Array.isArray(payload.codes) ? payload.codes.length : 0, kitKey: payload.kitKey });
    runInsercao().catch(e => log("err", "Erro fatal", { error: String(e?.message || e) }));
  };

  ui.btnStop.onclick = () => {
    STOP = true;
    ui.hint.textContent = "Parando…";
  };

  log("ok", "Runner armado (frame correto).", {
    href: location.href,
    kitKey: payload.kitKey || null,
    codes: Array.isArray(payload.codes) ? payload.codes.length : 0
  });
})();
