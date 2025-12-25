/* =========================================================
 * O MASKARA ENGINE v1.0
 * ========================================================= */

(function () {

  /* ================= CONFIG GLOBAL ================= */

  const DEFAULTS = {
    debug: true,
    breakpoint: false,
    maxRetry: 3,
    waitTimeout: 30000,
    charDelay: 40,
    stepDelay: 600,
    backendDelay: 5000
  };

  /* ================= UTILS ================= */

  const log = (plan, ...msg) =>
    DEFAULTS.debug && console.log(`🎭 [${plan}]`, ...msg);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function waitFor(selector, timeout = DEFAULTS.waitTimeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(300);
    }
    throw new Error(`Timeout aguardando ${selector}`);
  }

  async function typeHuman(el, text) {
    el.focus();
    el.value = "";
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(DEFAULTS.charDelay);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function restart(plan, fn) {
    for (let i = 1; i <= DEFAULTS.maxRetry; i++) {
      try {
        log(plan, `Tentativa ${i}/${DEFAULTS.maxRetry}`);
        await fn();
        return;
      } catch (e) {
        console.error(`❌ [${plan}] erro tentativa ${i}`, e);
        if (i === DEFAULTS.maxRetry) throw e;
        await sleep(2000);
      }
    }
  }

  /* ================= API PUBLICA ================= */

  window.MaskaraEngine = {

    async run(config) {

      const {
        plan,
        codes,
        selectors
      } = config;

      if (DEFAULTS.breakpoint) debugger;

      await restart(plan, async () => {

        log(plan, "⏳ Aguardando formulário...");

        const first = await waitFor(selectors.firstItem);

        log(plan, "✅ Formulário pronto");

        for (let i = 0; i < codes.length; i++) {

          const idx = i + 1;
          const code = codes[i];

          if (idx > 1 && selectors.addButton) {
            document.querySelector(selectors.addButton)?.click();
            await sleep(DEFAULTS.stepDelay);
          }

          const campo = document.querySelector(
            selectors.itemTemplate.replace("{i}", idx)
          );

          if (!campo)
            throw new Error(`Campo ${idx} não encontrado`);

          await typeHuman(campo, code);

          log(plan, `✔ Código inserido: ${code}`);

          if (selectors.qtyTemplate) {
            const qtd = document.querySelector(
              selectors.qtyTemplate.replace("{i}", idx)
            );
            if (qtd) {
              qtd.value = "1";
              qtd.dispatchEvent(new Event("input", { bubbles: true }));
              qtd.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }

          // modal biometria
          if (selectors.modal) {
            await sleep(800);
            const modal = document.querySelector(selectors.modal);
            if (modal && modal.classList.contains("in")) {
              log(plan, "ℹ️ Modal detectado");
              document.querySelector(selectors.modalCheck)?.click();
              document.querySelector(selectors.modalOk)?.click();
              await sleep(1500);
            }
          }

          await sleep(DEFAULTS.backendDelay);
        }

        log(plan, "🎉 Execução finalizada com sucesso");
      });
    }
  };

})();
