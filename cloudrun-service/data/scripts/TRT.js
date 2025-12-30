/*@maskara{
  "mustUrlIncludes": ["honorarios", "trf_social", "solicitacoes", "sp-sadt", "gdf.maida.health"],
  "detectAny": [
    "input#termoCodigoSolicitado",
    "ng-select#termoSolicitado",
    "input#termoQtdSolicitada",
    "button[aria-label='Confirmar Honorário']"
  ],
  "actions": { "focus": "input#termoCodigoSolicitado" }
}*/

(async () => {
  const scope = "TRT";
  const payload = window.__HP_PAYLOAD__ || {};

  const log  = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);
  const err  = (...a) => console.error(scope + ":", ...a);

  const WAIT = (ms) => new Promise(r => setTimeout(r, ms));

  // ===== KIT-only =====
  const codes = Array.isArray(payload.codes) ? payload.codes.map(String) : [];
  if (!codes.length) {
    warn("Sem payload.codes (kit).");
    return;
  }

  // qty default (ajuste aqui se quiser)
  const DEFAULT_QTY =
    (Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade) > 0)
      ? Number(payload.qtd ?? payload.defaultQty ?? payload.quantidade)
      : 11;

  function getQtyForCode(code) {
    const items = Array.isArray(payload.items) ? payload.items : null;
    if (items) {
      const hit = items.find(x => String(x?.code ?? x?.codigo ?? "") === String(code));
      const q = Number(hit?.qtd ?? hit?.qty ?? hit?.quantidade);
      if (Number.isFinite(q) && q > 0) return q;
    }
    return DEFAULT_QTY;
  }

  // ===== Angular-friendly setter =====
  function setNativeValue(input, value) {
    const { set: valueSetter } = Object.getOwnPropertyDescriptor(input, "value") || {};
    const proto = Object.getPrototypeOf(input);
    const { set: protoSetter } = Object.getOwnPropertyDescriptor(proto, "value") || {};
    (protoSetter || valueSetter).call(input, value);
  }

  function fireAngularInput(el, dataStr, inputType = "insertText") {
    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType,
        data: dataStr ?? null
      }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(el) {
    el.dispatchEvent(new KeyboardEvent("keydown",  { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
    el.dispatchEvent(new KeyboardEvent("keyup",    { bubbles:true, key:"Enter", code:"Enter", keyCode:13, which:13 }));
  }

  async function typeValueAngular(el, value) {
    el.focus();
    setNativeValue(el, "");
    fireAngularInput(el, "", "deleteContentBackward");
    await WAIT(10);

    setNativeValue(el, String(value));
    fireAngularInput(el, String(value), "insertText");
  }

  async function waitFor(fn, timeoutMs = 20000, stepMs = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (fn()) return true; } catch {}
      await WAIT(stepMs);
    }
    return false;
  }

  // ===== selectors do seu HTML =====
  const $ = (sel) => document.querySelector(sel);
  const codigoEl = () => $("#termoCodigoSolicitado");
  const qtdEl    = () => $("#termoQtdSolicitada");
  const valorEl  = () => $("#termoValorSolicitado");
  const termoNg  = () => $("ng-select#termoSolicitado");
  const confirmarBtn = () => $("button[aria-label='Confirmar Honorário']") || $("button.botao-success");

  function termoPreenchido() {
    const ns = termoNg();
    if (!ns) return false;
    if (ns.querySelector(".ng-value, .ng-value-label")) return true;
    const ti = ns.querySelector(".ng-input input");
    return !!((ti?.value || "").trim());
  }

  function formOk() {
    return !!codigoEl() && !!qtdEl() && !!termoNg() && !!confirmarBtn();
  }

  // ===== garante tela pronta =====
  const ready = await waitFor(() => formOk(), 60000, 200);
  if (!ready) {
    err("Form não ficou pronto (não achei campos/botão).");
    return;
  }

  log("🛡️ Iniciando lote", { total: codes.length, defaultQty: DEFAULT_QTY });

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const qty  = getQtyForCode(code);

    try {
      const ci = codigoEl();
      const qi = qtdEl();
      const vb = valorEl();
      const btn = confirmarBtn();

      if (!ci) throw new Error("Não achei #termoCodigoSolicitado");
      if (!qi) throw new Error("Não achei #termoQtdSolicitada");
      if (!btn) throw new Error("Não achei botão Confirmar Honorário");

      log(`▶️ (${i + 1}/${codes.length}) code=${code} qty=${qty}`);

      // 1) Código
      await typeValueAngular(ci, code);

      // 2) Enter para resolver termo/valor
      pressEnter(ci);

      // 3) Espera termo/valor preencher
      await waitFor(() => termoPreenchido() || ((vb?.value || "").trim() !== ""), 25000, 200);

      // 4) Quantidade
      await typeValueAngular(qi, String(qty));
      qi.dispatchEvent(new Event("blur", { bubbles: true }));

      // 5) Confirmar
      btn.click();

      log("✔ Confirmado", { code, qty });

      // Pausa entre itens (ajuste se precisar)
      await WAIT(1800);
    } catch (e) {
      err("✖ Falha", { code, error: e?.message || String(e) });
      await WAIT(1200);
    }
  }

  log("🎉 Fim do lote.");
})();
