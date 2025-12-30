// injected.js — roda no CONTEXTO REAL da página (MAIN world)
// 1) bridge: recebe window.postMessage(HP_RUN) e executa code via eval
// 2) nav: detecta navegação e dispara CustomEvent("__HP_NAV__")
// Guards evitam duplicar listeners

(() => {
  // =========================
  // 1) BRIDGE: HP_RUN -> eval
  // =========================
  if (!window.__HP_BRIDGE_WIRED__) {
    window.__HP_BRIDGE_WIRED__ = true;

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
          runnable + `\n\n//# sourceURL=healthplan-runner/${msg.planId || "plan"}.bridge.js`;

        (0, eval)(withSource);
      } catch (e) {
        console.error("❌ Falha ao executar via bridge:", e);
      }
    });
  }

  // =========================
  // 2) NAV: emite __HP_NAV__
  // =========================
  if (!window.__HP_NAV_WIRED__) {
    window.__HP_NAV_WIRED__ = true;

    const emit = (reason) => {
      try {
        const url = location.href;
        window.dispatchEvent(
          new CustomEvent("__HP_NAV__", {
            detail: { url, reason, ts: Date.now() },
          })
        );
      } catch {}
    };

    window.addEventListener("load", () => emit("load"), true);
    window.addEventListener("hashchange", () => emit("hashchange"), true);
    window.addEventListener("popstate", () => emit("popstate"), true);

    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    history.pushState = function (...args) {
      const r = _pushState.apply(this, args);
      emit("pushState");
      return r;
    };

    history.replaceState = function (...args) {
      const r = _replaceState.apply(this, args);
      emit("replaceState");
      return r;
    };

    emit("boot");
  }
})();
