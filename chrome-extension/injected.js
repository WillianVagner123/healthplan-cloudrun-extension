// injected.js - roda no CONTEXTO REAL da página

(function () {
  function normalize(codeRaw) {
    const code = String(codeRaw || "").trim();

    const looksRunnable =
      code.startsWith("(async") ||
      code.startsWith("(()") ||
      code.startsWith("(function") ||
      code.startsWith("void ") ||
      code.startsWith(";(async") ||
      code.startsWith(";(function") ||
      code.includes("})();");

    if (looksRunnable) return code;

    return `(async () => {\n${code}\n})().catch(e => console.error("❌ Erro fatal:", e));`;
  }

  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "HP_RUN") return;

    try {
      const runnable = normalize(msg.code);
      const withSource =
        runnable +
        `\n\n//# sourceURL=healthplan-runner/${msg.planId || "plan"}.bridge.js`;

      (0, eval)(withSource);
    } catch (e) {
      console.error("❌ Falha ao executar via bridge:", e);
    }
  });
})();
