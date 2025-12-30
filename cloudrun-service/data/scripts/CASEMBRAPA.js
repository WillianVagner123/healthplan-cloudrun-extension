/*@maskara{
  "mustUrlIncludes": ["casembrapa"],
  "detectAny": [
    "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']",
    "input[name='PROCEDIMENTO']"
  ],
  "actions": { "focus": "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']" }
}*/

(() => {
  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CASEMBRAPA";

  const HAS_TARGET = !!document.querySelector("[data-grid-name='gridSolicitacao_gridProcedimentosSimples']");
  if (!HAS_TARGET) return;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log(scope + ":", ...a);
  const warn = (...a) => console.warn(scope + ":", ...a);

  const gridHostSel = "[data-grid-name='gridSolicitacao_gridProcedimentosSimples']";

  function fireKey(target, type, opts) {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...opts }));
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

  async function focusGrid() {
    const host = document.querySelector(gridHostSel);
    if (!host) return null;
    host.scrollIntoView?.({ block: "center" });
    host.click?.();
    host.focus?.();
    await delay(120);
    return host;
  }

  async function tryInsertRow() {
    const host = await focusGrid();
    if (!host) return false;

    // 1) tecla Insert
    fireKey(document, "keydown", { key: "Insert", code: "Insert" });
    fireKey(document, "keyup", { key: "Insert", code: "Insert" });
    await delay(250);

    // Procura input habilitado
    let proc = await waitFor(() =>
      document.querySelector("input[name='PROCEDIMENTO']:not([disabled])"),
      1200
    );
    if (proc) return true;

    // 2) Ctrl+N
    fireKey(document, "keydown", { key: "n", code: "KeyN", ctrlKey: true });
    fireKey(document, "keyup", { key: "n", code: "KeyN", ctrlKey: true });
    await delay(250);

    proc = await waitFor(() =>
      document.querySelector("input[name='PROCEDIMENTO']:not([disabled])"),
      1200
    );
    if (proc) return true;

    // 3) Alt+I
    fireKey(document, "keydown", { key: "i", code: "KeyI", altKey: true });
    fireKey(document, "keyup", { key: "i", code: "KeyI", altKey: true });
    await delay(250);

    proc = await waitFor(() =>
      document.querySelector("input[name='PROCEDIMENTO']:not([disabled])"),
      1200
    );
    return !!proc;
  }

  async function typeAndEnter(input, value) {
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fireKey(input, "keydown", { key: "Enter", code: "Enter" });
    fireKey(input, "keyup", { key: "Enter", code: "Enter" });
    await delay(150);
  }

  async function confirmRow() {
    // Muitos grids confirmam ao sair do campo / Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter" });
    fireKey(document, "keyup", { key: "Enter", code: "Enter" });
    await delay(200);

    // fallback: Ctrl+Enter
    fireKey(document, "keydown", { key: "Enter", code: "Enter", ctrlKey: true });
    fireKey(document, "keyup", { key: "Enter", code: "Enter", ctrlKey: true });
    await delay(200);
  }

  async function runInsercao(codes) {
    const list = Array.isArray(codes) ? codes : [];
    if (!list.length) return warn("Lista vazia.");

    log("▶️ Iniciando…", { total: list.length, kit: payload.kitKey });

    for (let i = 0; i < list.length; i++) {
      const code = list[i];

      const inserted = await tryInsertRow();
      if (!inserted) {
        warn("❌ Não consegui acionar 'Inserir' (atalhos falharam).", { code });
        break;
      }

      const proc = await waitFor(
        () => document.querySelector("input[name='PROCEDIMENTO']:not([disabled])"),
        8000
      );
      if (!proc) {
        warn("⚠️ Campo PROCEDIMENTO editável não apareceu.", { code });
        continue;
      }
      await typeAndEnter(proc, code);

      const qtd = await waitFor(
        () => document.querySelector("input[name='COBRADOQDE']:not([disabled])"),
        2000
      );
      if (qtd) await typeAndEnter(qtd, "1");

      await confirmRow();

      log("✅ Inserido", code, `(${i + 1}/${list.length})`);
      await delay(900);
    }

    log("🎉 Finalizado!");
  }

  // botão flutuante simples
  const btn = document.createElement("button");
  btn.textContent = "⚡ Inserir Procedimentos";
  btn.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:12px 14px;border-radius:14px;border:none;background:#0d6efd;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.25);";
  btn.onclick = () => runInsercao(payload.codes || []);
  document.body.appendChild(btn);

  log("✅ Runner carregado (closed shadow detected).");
})();
