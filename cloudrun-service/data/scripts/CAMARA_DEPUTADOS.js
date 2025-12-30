/*@maskara{
  "mustUrlIncludes": ["camara", "camara.leg.br", "deputados"],
  "detectAny": [
    "input[name='EVENTO']",
    "a[title*='Salvar / Novo']",
    "a[title^='Salvar / Novo']",
    "a[accesskey='N']"
  ],
  "actions": { "focus": "input[name='EVENTO']" }
}*/

(() => {
  // =====================================================
  // 0) ANTI-BOOT DUPLO
  // =====================================================
  const BOOT_KEY = "__HP_CAMARA_BOOT_AT__";
  const now = Date.now();
  if (window[BOOT_KEY] && (now - window[BOOT_KEY]) < 500) return;
  window[BOOT_KEY] = now;

  // =====================================================
  // 1) API GLOBAL
  // =====================================================
  if (!window.__HP_CAMARA_API__) window.__HP_CAMARA_API__ = {};
  const API = window.__HP_CAMARA_API__;

  const payload = window.__HP_PAYLOAD__ || {};
  const scope = "CAMARA_DEPUTADOS";

  const B = window.__HP_BASE__ || null;
  const delay = B?.delay || ((ms) => new Promise(r => setTimeout(r, ms)));
  const log  = (...a) => (B?.logScope ? B.logScope(scope, ...a) : console.log(scope + ":", ...a));
  const warn = (...a) => (B?.warnScope ? B.warnScope(scope, ...a) : console.warn(scope + ":", ...a));
  const err  = (...a) => (B?.errScope ? B.errScope(scope, ...a) : console.error(scope + ":", ...a));

  // =====================================================
  // 2) STATE
  // =====================================================
  const STORE_KEY = "hp_runner_state_camara_v4";
  const loadState = () => { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "null"); } catch { return null; } };
  const saveState = (st) => sessionStorage.setItem(STORE_KEY, JSON.stringify(st));
  const clearState = () => sessionStorage.removeItem(STORE_KEY);

  const codesFromPopup = Array.isArray(payload.codes) ? payload.codes : [];

  // =====================================================
  // 3) HELPERS (frame-aware)
  // =====================================================
  function qsInDoc(doc, sel) { try { return doc?.querySelector(sel) || null; } catch { return null; } }

  function findContextDoc() {
    // tenta no documento atual
    const d0 = document;
    const evento0 = qsInDoc(d0, "input[name='EVENTO']");
    const btn0 =
      qsInDoc(d0, "a[title^='Salvar / Novo']") ||
      qsInDoc(d0, "a[title*='Salvar / Novo']") ||
      qsInDoc(d0, "a[accesskey='N']");
    if (evento0 && btn0) return d0;

    // tenta em iframes / frames (mesma origem)
    try {
      for (let i = 0; i < window.frames.length; i++) {
        const fr = window.frames[i];
        let d;
        try { d = fr.document; } catch { continue; }
        const evento = qsInDoc(d, "input[name='EVENTO']");
        const btn =
          qsInDoc(d, "a[title^='Salvar / Novo']") ||
          qsInDoc(d, "a[title*='Salvar / Novo']") ||
          qsInDoc(d, "a[accesskey='N']");
        if (evento && btn) return d;
      }
    } catch {}
    return null;
  }

  function pageHasRegistroNaoEncontrado(doc) {
    try {
      const t = (doc?.body?.innerText || "").toLowerCase();
      return t.includes("registro não encontrado") || t.includes("verifique mensagens nos campos");
    } catch {
      return false;
    }
  }

  function getViewStateFingerprint(doc) {
    // ASP.NET clássico: __VIEWSTATE e/ou __EVENTVALIDATION mudam após postback
    const vs = qsInDoc(doc, "input[name='__VIEWSTATE']")?.value || "";
    const ev = qsInDoc(doc, "input[name='__EVENTVALIDATION']")?.value || "";
    return (vs.slice(0, 64) + "|" + ev.slice(0, 64));
  }

  function fire(doc, el, type) {
    try { el.dispatchEvent(new doc.defaultView.Event(type, { bubbles: true })); } catch {}
  }

  async function ghostType(doc, el, text, charDelay = 25) {
    el.focus();
    el.value = "";
    fire(doc, el, "input"); fire(doc, el, "change");
    for (const ch of String(text)) {
      el.value += ch;
      fire(doc, el, "input");
      await delay(charDelay);
    }
    fire(doc, el, "change");
  }

  async function waitStableAfterClick(st, timeoutMs = 25000) {
    // Espera o postback "terminar" antes de avançar idx.
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const doc = findContextDoc();

      // se não achou doc ainda, só espera (o frame pode estar recarregando)
      if (!doc) { await delay(350); continue; }

      // condição 1: mensagem de registro não encontrado (clássica)
      if (pageHasRegistroNaoEncontrado(doc)) return { ok: true, kind: "not_found" };

      // condição 2: viewstate mudou (postback concluiu)
      const fp = getViewStateFingerprint(doc);
      if (st.postback?.fpAfter && fp !== st.postback.fpAfter) return { ok: true, kind: "viewstate_changed" };

      // condição 3: campo EVENTO foi limpo/voltou
      const evento = qsInDoc(doc, "input[name='EVENTO']");
      if (evento && String(evento.value || "").trim() === "") return { ok: true, kind: "evento_cleared" };

      await delay(350);
    }

    return { ok: false, kind: "timeout" };
  }

  // =====================================================
  // 4) LOOP (com wait-postback)
  // =====================================================
  async function stepOnce() {
    const st = loadState() || { idx: 0, running: false, phase: "idle", lastCode: null, codes: null, postback: null };

    if (!st.running || !Array.isArray(st.codes) || st.codes.length === 0) {
      return;
    }

    if (st.idx >= st.codes.length) {
      log("🎉 Finalizado! Total:", st.codes.length);
      clearState();
      return;
    }

    // Se estamos em "clicked", precisamos ESPERAR o postback estabilizar antes de avançar.
    if (st.phase === "clicked" && st.lastCode) {
      const res = await waitStableAfterClick(st, 25000);

      if (res.ok) {
        if (res.kind === "not_found") warn("⚠️ Registro não encontrado:", st.lastCode, "→ próximo.");
        else log("✅ Postback OK:", st.lastCode, `(${res.kind}) → próximo.`);

        st.idx++;
        st.phase = "idle";
        st.lastCode = null;
        st.postback = null;
        saveState(st);
      } else {
        // ainda não terminou: NÃO faz nada (watchdog tentará de novo)
        warn("⏳ Aguardando postback… (timeout parcial)");
      }
      return;
    }

    // fase idle: digitar e clicar
    const doc = findContextDoc();
    if (!doc) return;

    const evento = qsInDoc(doc, "input[name='EVENTO']");
    const btn =
      qsInDoc(doc, "a[title^='Salvar / Novo']") ||
      qsInDoc(doc, "a[title*='Salvar / Novo']") ||
      qsInDoc(doc, "a[accesskey='N']");

    if (!evento || !btn) return;

    const code = st.codes[st.idx];
    log(`▶️ (${st.idx + 1}/${st.codes.length})`, code);

    await ghostType(doc, evento, code, 25);

    // marca postback: fingerprint ANTES (para comparar depois)
    const fpBefore = getViewStateFingerprint(doc);

    st.phase = "clicked";
    st.lastCode = code;
    st.postback = { startedAt: Date.now(), fpAfter: fpBefore };
    saveState(st);

    log("🖱️ Clicando Salvar / Novo…");
    try { btn.click(); } catch {}
  }

  // =====================================================
  // 5) WATCHDOG
  // =====================================================
  let watchdogActive = false;
  let inFlight = false;

  async function tick() {
    if (inFlight) return;

    const st = loadState();
    if (!st?.running || !st.codes?.length) return;

    inFlight = true;
    try { await stepOnce(); }
    catch (e) { err("watchdog erro:", e); }
    finally { inFlight = false; }
  }

  function startWatchdog() {
    if (watchdogActive) return;
    watchdogActive = true;

    // tick frequente, mas com lock + espera de postback => não atropela
    setInterval(() => { tick().catch(() => {}); }, 700);
  }

  API.resume = async () => { await tick(); };

  // =====================================================
  // 6) AUTO-START / AUTO-RESUME
  // =====================================================
  const st0 = loadState();

  if (st0?.running && Array.isArray(st0.codes) && st0.codes.length) {
    startWatchdog();
  } else if (codesFromPopup.length) {
    saveState({
      idx: 0,
      running: true,
      phase: "idle",
      lastCode: null,
      codes: codesFromPopup,
      postback: null
    });
    startWatchdog();
  } else {
    warn("Sem codes no payload e sem estado salvo. (Não iniciou)");
  }

  log("🛡️ Runner + Watchdog v2 ativos", { total: codesFromPopup.length });
})();
