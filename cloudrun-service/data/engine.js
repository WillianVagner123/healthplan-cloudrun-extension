/**
 * O MASKARA – ENGINE UNIVERSAL
 * Compatível com jquery.mask, iframes e sistemas legados
 */

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ================= DOM SEARCH ================= */

async function waitFor(selector, timeout = 60000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // document principal
    let el = document.querySelector(selector);
    if (el) return { el, doc: document };

    // iframes
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        el = doc.querySelector(selector);
        if (el) return { el, doc };
      } catch {}
    }

    await delay(300);
  }

  throw new Error(`Timeout aguardando ${selector}`);
}

/* ================= MASK SAFE TYPING ================= */

async function typeLikeHuman(input, text, keyDelay = 60) {
  input.focus();
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  for (const ch of text) {
    const keyCode = ch.charCodeAt(0);

    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, key: ch, keyCode, which: keyCode
    }));

    input.value += ch;

    input.dispatchEvent(new KeyboardEvent("keypress", {
      bubbles: true, key: ch, keyCode, which: keyCode
    }));

    input.dispatchEvent(new Event("input", { bubbles: true }));

    input.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true, key: ch, keyCode, which: keyCode
    }));

    await delay(keyDelay);
  }

  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

/* ================= BREAKPOINT HUMANO ================= */

async function waitForUserConfirm(message = "Pressione OK para continuar") {
  alert(message);
}

/* ================= CORE RUNNER ================= */

async function runPlan(config) {
  console.log(`🎭 O Maskara | Plano: ${config.plan}`);

  if (config.breakpoint_before_start) {
    await waitForUserConfirm("🎭 Prepare a tela do sistema e clique OK");
  }

  const { el: firstField, doc } =
    await waitFor(config.first_selector, config.timeout || 60000);

  console.log("✅ Formulário detectado");

  for (let i = 0; i < config.codes.length; i++) {
    const idx = i + 1;
    const code = config.codes[i];

    console.log(`▶️ Inserindo ${idx}/${config.codes.length}: ${code}`);

    if (idx > 1 && config.add_button_id) {
      doc.getElementById(config.add_button_id)?.click();
      await delay(config.add_delay || 800);
    }

    const field =
      doc.querySelector(
        config.field_selector
          .replace("{i}", idx)
      );

    if (!field) {
      console.error("❌ Campo não encontrado:", idx);
      break;
    }

    await typeLikeHuman(field, code, config.key_delay || 60);

    if (config.quantity_selector) {
      const qty = doc.querySelector(
        config.quantity_selector.replace("{i}", idx)
      );
      if (qty) await typeLikeHuman(qty, "1", 40);
    }

    if (config.after_each_delay) {
      await delay(config.after_each_delay);
    }
  }

  console.log("🎉 O Maskara finalizou com sucesso");
}
