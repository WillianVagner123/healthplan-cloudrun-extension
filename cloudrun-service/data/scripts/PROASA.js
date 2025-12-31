/*@maskara{
  "mustUrlIncludes": ["saw.trixti.com.br", "/saw/tiss/SolicitacaoDeSPSADT40.do"],
  "detectAny": [
    "#procedimentosSolicitados\\[0\\]\\.codigo",
    "#qata-adicionar",
    "select[id='procedimentosSolicitados[0].tipoTabela']"
  ],
  "topOnly": true
}*/

(() => {
  const scope = "TRIXTI_SPSADT";
  const payload = window.__HP_PAYLOAD__ || {};
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log(scope + ":", ...a);

  // ===== CONFIG =====
  const ALL_CODES = payload.codes || [
    "40301087", "40301150", "40301222",
    // ...
  ];

  const TABELA = payload.tabela || "22";       // TUSS Procedimentos
  const QTD_PADRAO = String(payload.qtd || "1"); // Quantidade padrão
  const MAX_POR_RODADA = 30;

  const BTN_ADD_SEL = "#qata-adicionar";

  // ===== DOM HELPERS =====
  const selId = (id) => "#" + CSS.escape(id);
  const idField = (i, field) => `procedimentosSolicitados[${i}].${field}`;

  const elCodigo = (i) => document.querySelector(selId(idField(i, "codigo")));
  const elDesc   = (i) => document.querySelector(selId(idField(i, "descricao")));
  const elTabela = (i) => document.querySelector(`select[id='procedimentosSolicitados[${i}].tipoTabela']`);

  // Quantidade (tentativas comuns)
  const elQtd = (i) =>
    document.querySelector(selId(idField(i, "qtSolicitada"))) ||
    document.querySelector(selId(idField(i, "qtdSolicitada"))) ||
    document.querySelector(selId(idField(i, "quantidade"))) ||
    document.querySelector(selId(idField(i, "qt"))) ||
    // fallback por name (alguns sistemas usam name sem id igual)
    document.querySelector(`[name='procedimentosSolicitados[${i}].qtSolicitada']`) ||
    document.querySelector(`[name='procedimentosSolicitados[${i}].qtdSolicitada']`) ||
    document.querySelector(`[name='procedimentosSolicitados[${i}].quantidade']`) ||
    null;

  const btnAdd = () =>
    document.querySelector(BTN_ADD_SEL) ||
    document.querySelector("[onclick*='adicionarProcedimentoSolicitado']") ||
    document.querySelector("input[name='btnAdicionarProcedimentoSolicitado']");

  const setVal = (el, v) => {
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
    setter ? setter.call(el, v) : (el.value = v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const waitFor = async (fn, timeoutMs = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = fn();
      if (v) return v;
      await delay(150);
    }
    return null;
  };

  async function ensureLine(i) {
    if (elCodigo(i) && elTabela(i)) return true;
    for (let t = 0; t < 40; t++) {
      const b = btnAdd();
      if (!b) throw new Error("Botão Adicionar não encontrado (#qata-adicionar).");
      b.click();
      const ok = await waitFor(() => elCodigo(i) && elTabela(i), 5000);
      if (ok) return true;
      await delay(250);
    }
    return false;
  }

  async function validateLine(i) {
    const fnName = `capturarProcedimentoSolicitadoEValidar${i + 1}`;
    const fn = window[fnName];

    if (typeof fn === "function") {
      try { fn(); } catch (e) { console.warn(scope + ": falha " + fnName, e); }
    } else {
      elCodigo(i)?.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    // Espera descrição (quando o sistema preencher)
    await waitFor(() => {
      const d = elDesc(i);
      return d && String(d.value || "").trim().length > 0;
    }, 6000);
  }

  // ===== CORE INSERT =====
  async function runBatch(startIndex) {
    const endIndex = Math.min(startIndex + MAX_POR_RODADA, ALL_CODES.length);
    const batch = ALL_CODES.slice(startIndex, endIndex);

    if (!batch.length) {
      alert("Sem códigos nesta faixa.");
      return;
    }

    log("Iniciando lote", { startIndex, endIndex: endIndex - 1, totalNoLote: batch.length, tabela: TABELA, qtd: QTD_PADRAO });

    // garante que existam linhas suficientes (no máximo 30 linhas por rodada)
    for (let i = 0; i < batch.length; i++) {
      const line = i; // sempre começa da linha 0 na tela (1ª página)
      const code = batch[i];

      if (line >= MAX_POR_RODADA) break;

      const ok = await ensureLine(line);
      if (!ok) { log("Não consegui criar linha", line); break; }

      setVal(elTabela(line), TABELA);
      setVal(elCodigo(line), code);

      // Quantidade
      const q = elQtd(line);
      if (q) setVal(q, QTD_PADRAO);

      await validateLine(line);

      const desc = elDesc(line)?.value || "";
      log("OK", { line, code, qtd: q?.value || "(não encontrado)", desc: desc.slice(0, 80) });

      await delay(120);
    }

    log("Lote finalizado ✅");
    alert(`Finalizado: inseridos ${batch.length} códigos (${startIndex + 1}–${endIndex}).`);
  }

  // ===== UI PANEL =====
  function mountUI() {
    const existing = document.getElementById("hp-trixti-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "hp-trixti-panel";
    panel.style.cssText = `
      position: fixed; right: 16px; top: 16px; z-index: 999999;
      background: #111; color: #fff; padding: 12px 12px 10px;
      border-radius: 12px; width: 300px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font-family: Arial, sans-serif;
    `;

    const title = document.createElement("div");
    title.textContent = "TRIXTI SP/SADT • Inserção";
    title.style.cssText = "font-weight: 700; margin-bottom: 8px; font-size: 14px;";
    panel.appendChild(title);

    const info = document.createElement("div");
    info.style.cssText = "font-size: 12px; opacity: .9; margin-bottom: 10px; line-height: 1.35;";
    info.textContent = `Total de códigos: ${ALL_CODES.length}. Limite: 30 por rodada. Qtd padrão: ${QTD_PADRAO}.`;
    panel.appendChild(info);

    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:8px;";

    const b1 = document.createElement("button");
    b1.textContent = "Inserir 1–30";
    b1.style.cssText = "flex:1; padding:10px; border:0; border-radius:10px; cursor:pointer; font-weight:700;";
    b1.onclick = () => runBatch(0);

    const b2 = document.createElement("button");
    b2.textContent = "Inserir 31+";
    b2.style.cssText = "flex:1; padding:10px; border:0; border-radius:10px; cursor:pointer; font-weight:700;";
    b2.onclick = () => runBatch(30);

    row.appendChild(b1);
    row.appendChild(b2);
    panel.appendChild(row);

    const hint = document.createElement("div");
    hint.style.cssText = "margin-top:10px; font-size:11px; opacity:.8;";
    hint.textContent = "Dica: se você já tem linhas preenchidas, limpe ou use a segunda tela antes de rodar de novo.";
    panel.appendChild(hint);

    const close = document.createElement("div");
    close.textContent = "×";
    close.title = "Fechar";
    close.style.cssText = `
      position:absolute; right:10px; top:6px; cursor:pointer;
      font-size:18px; line-height:18px; opacity:.8;
    `;
    close.onclick = () => panel.remove();
    panel.appendChild(close);

    document.body.appendChild(panel);
  }

  mountUI();
  log("Painel criado ✅");
})();
