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

  const CODES = payload.codes || [
    "40301087",
    "40301150",
    "40301222",
  ];
  const TABELA = payload.tabela || "22";
  const BTN_ADD_SEL = "#qata-adicionar";

  const selId = (id) => "#" + CSS.escape(id);
  const idField = (i, field) => `procedimentosSolicitados[${i}].${field}`;

  const elCodigo = (i) => document.querySelector(selId(idField(i, "codigo")));
  const elDesc   = (i) => document.querySelector(selId(idField(i, "descricao")));
  const elTabela = (i) => document.querySelector(`select[id='procedimentosSolicitados[${i}].tipoTabela']`);
  const btnAdd   = () => document.querySelector(BTN_ADD_SEL);

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
    for (let t = 0; t < 30; t++) {
      const b = btnAdd();
      if (!b) throw new Error("Botão Adicionar não encontrado (#qata-adicionar)");
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

    await waitFor(() => {
      const d = elDesc(i);
      return d && String(d.value || "").trim().length > 0;
    }, 6000);
  }

  (async () => {
    log("Iniciando", { total: CODES.length, tabela: TABELA });

    for (let i = 0; i < CODES.length; i++) {
      const code = CODES[i];
      log(`(${i + 1}/${CODES.length})`, "linha", i, "codigo", code);

      const ok = await ensureLine(i);
      if (!ok) { log("Não consegui criar linha", i); break; }

      setVal(elTabela(i), TABELA);
      setVal(elCodigo(i), code);

      await validateLine(i);

      const desc = elDesc(i)?.value || "";
      log("OK", { i, code, desc: desc.slice(0, 80) });

      await delay(120);
    }

    log("Finalizado ✅");
  })().catch((e) => console.error(scope + " fatal:", e));
})();
