/*@maskara{
  "mustUrlIncludes": ["/solicitacoes/exames/novo"],
  "detectAny": ["#form-principal", "#form-principal\\:procedimentos"],
  "actions": {}
}*/

/**
 * QUALIREDE / SERPRO — Inserção robusta de procedimentos via KIT (O Maskara)
 * ✅ NÃO precisa preencher `CODES` manualmente.
 *
 * O script tenta pegar os códigos do kit assim (em ordem):
 * 1) window.__MASKARA_KIT__ / window.__MASKARA_STATE__ / window.Maskara (se o popup injetou algo no page context)
 * 2) localStorage: procura chaves que pareçam do Maskara e extrai { codes_ref, codigos }
 * 3) Fallback: você define `CODES_REF` (ex: "coleta_completa") e cola seus kits em KITS_EMBUTIDOS (1 vez só)
 *
 * Como rodar:
 * 1) Abra a página da guia (onde aparecem as linhas Tabela/Código/Descrição).
 * 2) Abra o console e cole tudo.
 * 3) Rode:  await runInsertFromKit()   (ele tenta achar o kit selecionado)
 *    ou:    await runInsertFromKit({ codes_ref: "coleta_completa" })
 */

(() => {
  if (window.__PROC_INSERTER_KIT_V1__) {
    console.log("PROC_INSERTER_KIT: já carregado.");
    return;
  }
  window.__PROC_INSERTER_KIT_V1__ = true;

  // =========================
  // CONFIG
  // =========================
  const TABLE_DEFAULT = "22"; // 22 - TUSS _ Procedimentos e eventos em saúde
  const CFG = {
    timeoutRowReady: 25000,
    timeoutAutocomplete: 30000,
    timeoutDescFill: 30000,
    step: 120,
    typeDelay: 35,
    betweenRowsDelay: 80,
    retriesPerCode: 2,
    scrollIntoView: true,
    forceTableEveryRow: true,
  };

  // =========================
  // FALLBACK (opcional)
  // Se você quiser garantir SEM depender de localStorage/window,
  // basta colocar seus kits aqui (como o popup tem).
  // =========================
  const KITS_EMBUTIDOS = {
    // "coleta_completa": ["40316106","40316157", ...]
  };

  // =========================
  // UTILS
  // =========================
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log("PROC_INSERTER_KIT:", ...a);
  const warn = (...a) => console.warn("PROC_INSERTER_KIT:", ...a);
  const err = (...a) => console.error("PROC_INSERTER_KIT:", ...a);

  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }
  function key(el, type, k) {
    el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  }

  async function waitFor(cond, { timeout = 20000, step = 120, label = "cond" } = {}) {
    const t0 = Date.now();
    while (true) {
      let ok = false;
      try { ok = await cond(); } catch {}
      if (ok) return true;
      if (Date.now() - t0 > timeout) throw new Error("timeout: " + label);
      await delay(step);
    }
  }

  function scrollToEl(el) {
    if (!el || !CFG.scrollIntoView) return;
    try { el.scrollIntoView({ behavior: "instant", block: "center" }); }
    catch { try { el.scrollIntoView(); } catch {} }
  }

  // =========================
  // DOM — linhas/controles
  // =========================
  function getRowByIndex(i) {
    return document.getElementById(
      `form-principal:procedimentos-solicitados-list:tabelaProcedimentos:${i}:rowProcedimento`
    );
  }

  function getRowControls(row) {
    const selTabela = q("select[id$=':procedimento:tabela']", row);
    const inpCodigo = q("input[id$=':procedimento:codigo']", row);
    const inpDesc   = q("input[id$=':procedimento:descricao']", row);
    const qtd       = q("input[id$=':quantidadeSolicitada']", row);
    return { selTabela, inpCodigo, inpDesc, qtd };
  }

  function getSpinnerNear(input) {
    // O HTML mostra <span class="form-control-feedback"> com ícone de spinner
    const grp = input?.closest(".has-feedback") || input?.parentElement;
    if (!grp) return null;
    const sp = q(".form-control-feedback i.fa-spinner", grp);
    return sp ? sp : null;
  }

  async function waitAjaxIdleForInput(input, timeout, label) {
    const spinner = getSpinnerNear(input);
    if (!spinner) return; // nem sempre existe
    await waitFor(() => !spinner.classList.contains("fa-spin"), { timeout, label, step: CFG.step });
  }

  function findIncludeButton() {
    // botão verde "Incluir Procedimento"
    const byText = qa("button, a, input[type=button], input[type=submit]")
      .find(el => (el.innerText || el.value || "").trim().toLowerCase() === "incluir procedimento");
    if (byText) return byText;

    // fallback: procura botão verde com esse texto
    return qa("button.btn, a.btn").find(el =>
      (el.innerText || "").toLowerCase().includes("incluir") &&
      (el.innerText || "").toLowerCase().includes("proced")
    );
  }

  async function ensureRowExists(i) {
    // Se a linha i não existir, tenta clicar em "Incluir Procedimento" até existir
    let row = getRowByIndex(i);
    if (row) return row;

    const btn = findIncludeButton();
    if (!btn) throw new Error("Não achei o botão 'Incluir Procedimento' para criar novas linhas.");

    log(`Linha ${i} não existe ainda. Criando...`);
    const t0 = Date.now();
    while (!row) {
      btn.click();
      await delay(250);
      row = getRowByIndex(i);
      if (Date.now() - t0 > CFG.timeoutRowReady) break;
    }
    if (!row) throw new Error(`Não consegui criar a linha ${i} (timeout).`);
    return row;
  }

  // =========================
  // Autocomplete — seleção “de verdade”
  // =========================
  function getTypeaheadMenuForInput(input) {
    // bootstrap typeahead costuma criar um .typeahead/.dropdown-menu no body
    // mas nem sempre dá pra mapear. Tentamos achar o menu visível mais recente.
    const menus = qa("ul.typeahead, ul.dropdown-menu, .typeahead.dropdown-menu, .dropdown-menu");
    const visible = menus.filter(m => m.offsetParent !== null && m.getClientRects().length > 0);
    // pega o mais “recente” no DOM
    return visible.length ? visible[visible.length - 1] : null;
  }

  async function typeInto(input, text) {
    input.focus();
    input.value = "";
    fire(input, "input");
    await delay(20);

    for (const ch of String(text)) {
      input.value += ch;
      fire(input, "input");
      await delay(CFG.typeDelay);
    }
    fire(input, "change");
  }

  async function selectFirstSuggestion(input, timeoutLabel) {
    // Estratégia:
    // 1) espera aparecer menu
    // 2) ArrowDown + Enter para “selecionar”
    await waitFor(() => {
      const m = getTypeaheadMenuForInput(input);
      return !!(m && (m.querySelector("li, a, button, span")));
    }, { timeout: CFG.timeoutAutocomplete, label: timeoutLabel });

    // Pressiona para escolher primeira opção
    key(input, "keydown", "ArrowDown");
    await delay(40);
    key(input, "keydown", "Enter");
    await delay(80);
  }

  async function fillProcedureRow({ index, code, table = TABLE_DEFAULT }) {
    const row = await ensureRowExists(index);
    scrollToEl(row);

    const { selTabela, inpCodigo, inpDesc } = getRowControls(row);
    if (!selTabela || !inpCodigo || !inpDesc) {
      throw new Error(`Controles não encontrados na linha ${index}.`);
    }

    // Define tabela
    if (CFG.forceTableEveryRow) {
      selTabela.value = table;
      fire(selTabela, "change");
      await delay(60);
    } else if (!selTabela.value) {
      selTabela.value = table;
      fire(selTabela, "change");
      await delay(60);
    }

    // Se já tiver descrição preenchida, considera ok
    const already = (inpDesc.value || "").trim();
    if (already.length > 0) {
      log(`(${index}) já preenchido:`, code, "=>", already);
      return { ok: true, index, code, desc: already, skipped: true };
    }

    // Digita código e seleciona do autocomplete (o “de verdade”)
    await typeInto(inpCodigo, code);

    // Espera ajax/lookup do código
    await waitAjaxIdleForInput(inpCodigo, CFG.timeoutAutocomplete, `spinner código ${index}`);

    // Seleciona sugestão (isso costuma preencher descrição e nota técnica)
    await selectFirstSuggestion(inpCodigo, `menu autocomplete ${index}`);

    // Espera descrição preencher
    await waitFor(() => (inpDesc.value || "").trim().length > 0, {
      timeout: CFG.timeoutDescFill,
      label: `desc preencher ${index}`,
      step: CFG.step,
    });

    // Alguns JSF só “salvam” com blur/change
    fire(inpCodigo, "change");
    fire(inpDesc, "change");

    const desc = (inpDesc.value || "").trim();
    log(`(${index}) OK:`, code, "=>", desc);
    return { ok: true, index, code, desc };
  }

  // =========================
  // KIT — extração automática
  // =========================
  function normalizeCodes(arr) {
    return (arr || [])
      .map(x => String(x).trim())
      .filter(Boolean)
      .map(x => x.replace(/\D+/g, "")) // só dígitos
      .filter(x => x.length >= 4);     // corta lixo
  }

  function tryGetKitFromWindow() {
    // Variações comuns (você pode adaptar quando souber o nome real)
    const candidates = [
      window.__MASKARA_KIT__,
      window.__MASKARA_STATE__?.kit,
      window.__MASKARA_STATE__?.selectedKit,
      window.Maskara?.state?.kit,
      window.Maskara?.selectedKit,
      window.__LAST_KIT__,
    ].filter(Boolean);

    for (const c of candidates) {
      // aceitamos { codes_ref, codigos } ou { ref, codes } etc
      const codes_ref =
        c.codes_ref || c.ref || c.kit_ref || c.id || c.key || c.slug || null;
      const codigos =
        c.codigos || c.codes || c.items || c.procedimentos || c.procs || null;

      const out = {
        codes_ref,
        codigos: normalizeCodes(codigos),
        raw: c,
        source: "window",
      };
      if (out.codigos.length) return out;
    }
    return null;
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function tryGetKitFromLocalStorage(preferRef) {
    // Procura chaves que pareçam do Maskara
    const keys = Object.keys(localStorage || {});
    const maskKeys = keys.filter(k =>
      /maskara|kit|kits|codes_ref|proced/i.test(k)
    );

    // tenta achar alguma estrutura com kits
    for (const k of maskKeys) {
      const val = localStorage.getItem(k);
      if (!val) continue;
      const obj = safeJsonParse(val);
      if (!obj) continue;

      // Possibilidade A: obj já é { codes_ref, codigos }
      if (obj && typeof obj === "object") {
        const directRef = obj.codes_ref || obj.ref || obj.kit_ref;
        const directCodes = obj.codigos || obj.codes || obj.items;
        const d = normalizeCodes(directCodes);
        if (d.length) {
          if (!preferRef || preferRef === directRef) {
            return { codes_ref: directRef || preferRef || null, codigos: d, raw: obj, source: `localStorage:${k}` };
          }
        }

        // Possibilidade B: obj.kits é um mapa { ref: [codes...] }
        if (obj.kits && typeof obj.kits === "object") {
          const refs = Object.keys(obj.kits);
          const chosen = preferRef && obj.kits[preferRef] ? preferRef : refs[0];
          const d2 = normalizeCodes(obj.kits[chosen]);
          if (d2.length) return { codes_ref: chosen, codigos: d2, raw: obj, source: `localStorage:${k}.kits` };
        }

        // Possibilidade C: obj é um array de kits [{ codes_ref, codigos }]
        if (Array.isArray(obj)) {
          const found = preferRef
            ? obj.find(x => (x?.codes_ref || x?.ref || x?.kit_ref) === preferRef)
            : obj.find(x => normalizeCodes(x?.codigos || x?.codes || x?.items).length);

          if (found) {
            const ref = found.codes_ref || found.ref || found.kit_ref || preferRef || null;
            const d3 = normalizeCodes(found.codigos || found.codes || found.items);
            if (d3.length) return { codes_ref: ref, codigos: d3, raw: found, source: `localStorage:${k}[array]` };
          }
        }
      }
    }

    // Log útil para você ajustar depois (mostra as chaves candidatas)
    log("Não achei kit pronto no localStorage. Chaves candidatas:", maskKeys);
    return null;
  }

  function tryGetKitFromEmbedded(preferRef) {
    const ref = preferRef || Object.keys(KITS_EMBUTIDOS)[0] || null;
    if (!ref) return null;
    const d = normalizeCodes(KITS_EMBUTIDOS[ref]);
    if (!d.length) return null;
    return { codes_ref: ref, codigos: d, raw: KITS_EMBUTIDOS, source: "embedded" };
  }

  function resolveKit({ codes_ref } = {}) {
    // 1) window
    const w = tryGetKitFromWindow();
    if (w && (!codes_ref || w.codes_ref === codes_ref || w.codigos.length)) return w;

    // 2) localStorage
    const ls = tryGetKitFromLocalStorage(codes_ref);
    if (ls) return ls;

    // 3) embedded
    const em = tryGetKitFromEmbedded(codes_ref);
    if (em) return em;

    return null;
  }

  // =========================
  // EXEC
  // =========================
  async function runInsertFromKit(opts = {}) {
    const kit = resolveKit(opts);
    if (!kit) {
      throw new Error(
        "Não consegui localizar os códigos do KIT (window/localStorage/embedded). " +
        "Me diga qual chave do localStorage o popup usa OU cole os kits em KITS_EMBUTIDOS."
      );
    }

    const codes = kit.codigos;
    log("KIT carregado:", { source: kit.source, codes_ref: kit.codes_ref, total: codes.length });

    // Se a página já tiver N linhas, começa do próximo vazio.
    // Mas aqui eu sigo a ordem: linha 0..N-1.
    const results = [];
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      let ok = false;
      let lastErr = null;

      for (let attempt = 1; attempt <= CFG.retriesPerCode; attempt++) {
        try {
          log(`Inserindo (${i + 1}/${codes.length}) code=${code} tentativa=${attempt}`);
          const r = await fillProcedureRow({ index: i, code, table: TABLE_DEFAULT });
          results.push(r);
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
          warn(`Falhou code=${code} na linha ${i} (tentativa ${attempt}):`, e?.message || e);
          // pequena pausa e tenta de novo (às vezes autocomplete falha)
          await delay(300);
        }
      }

      if (!ok) {
        results.push({ ok: false, index: i, code, error: String(lastErr?.message || lastErr) });
        // não trava tudo: continua
      }

      await delay(CFG.betweenRowsDelay);
    }

    const okCount = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok);
    log(`Finalizado. OK=${okCount}/${results.length}. Falhas=${fail.length}`);
    if (fail.length) console.table(fail);

    return results;
  }

  // Exponho no window pra você rodar do console
  window.runInsertFromKit = runInsertFromKit;
  window.__PROC_INSERTER_getKitDebug = () => resolveKit({});

  log("Pronto. Rode: await runInsertFromKit()  (ou await runInsertFromKit({ codes_ref: 'coleta_completa' }))");
})();
