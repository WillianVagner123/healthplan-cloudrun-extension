/* popup.js — O Maskara (Cloud Run + Backend Auth + Kits)
   - Login via Cloud Run (Device Code):
     POST /v1/auth/device/start -> abre /auth -> POST /v1/auth/device/poll
   - Usa Authorization: Bearer <maskara_token>
   - Lista planos/kits/codes
   - Injeta script do plano no MAIN world + payload window.__HP_PAYLOAD__
*/

const $ = (id) => document.getElementById(id);
const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const STORAGE_KEYS = {
  token: "maskara_token",
  email: "maskara_email",
  pending: "maskara_pending",
};

const state = {
  token: null,
  userEmail: null,

  plans: [],
  selectedPlan: null,

  kits: [],
  selectedKitKey: null,
  sharedCodes: {},

  logs: [],
  polling: false,
};

/* ================= UI ================= */

function setTopStep(stepNum) {
  const chips = document.querySelectorAll(".stepChip");
  if (!chips || !chips.length) return;

  chips.forEach((ch) => {
    const n = Number(ch.getAttribute("data-step") || "0");
    ch.classList.toggle("stepOn", n === Number(stepNum));
  });
}

function syncStepsUI() {
  const details = document.getElementById("pageDetails");
  const isDetails = details && !details.hidden;

  const backTop = document.getElementById("btnBackTop");
  if (backTop) backTop.hidden = !isDetails;

  setTopStep(isDetails ? 2 : 1);
}

function logLine(obj) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const line = { ts: `[${hh}:${mm}:${ss}]`, ...obj };
  state.logs.unshift(line);
  renderLogs();
}

function renderLogs() {
  const box = $("logBox");
  if (!box) return;
  box.value = state.logs
    .slice(0, 200)
    .map((l) => {
      const mark = l.ok === true ? "✅" : l.ok === false ? "❌" : "•";
      const extra = l.data ? `\n${JSON.stringify(l.data, null, 2)}` : "";
      return `${l.ts} ${mark} ${l.msg}${extra}`;
    })
    .join("\n\n");
  box.scrollTop = 0;
}

function toast(msg) {
  const t = $("toast");
  if (!t) return console.log(msg);
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2000);
}

function setGate(authenticated) {
  const loginGate = $("loginGate");
  const appGate = $("appGate");
  const stepperWrap = document.getElementById("stepperWrap");

  if (loginGate) loginGate.hidden = !!authenticated;
  if (appGate) appGate.hidden = !authenticated;
  if (stepperWrap) stepperWrap.hidden = !authenticated;

  // ✅ modo "apenas login"
  document.body.classList.toggle("login-only", !authenticated);
}

function showList() {
  $("pageList").hidden = false;
  $("pageDetails").hidden = true;
  syncStepsUI();
}

function showDetails() {
  $("pageList").hidden = true;
  $("pageDetails").hidden = false;
  syncStepsUI();
}

function setHeaderEmail(email) {
  const el = $("userEmail");
  if (el) el.textContent = email || "—";

  const ok = $("authOk");
  if (ok) ok.hidden = !email; // ✅ aparece quando tem email
}

/* ================= Storage ================= */

async function getStoredAuth() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.token,
    STORAGE_KEYS.email,
    STORAGE_KEYS.pending,
  ]);
  return {
    token: data[STORAGE_KEYS.token] || null,
    email: data[STORAGE_KEYS.email] || null,
    pending: data[STORAGE_KEYS.pending] || null,
  };
}

async function setStoredAuth({ token, email }) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.token]: token || null,
    [STORAGE_KEYS.email]: email || null,
  });
}

async function clearStoredAuth() {
  await chrome.storage.local.remove([STORAGE_KEYS.token, STORAGE_KEYS.email]);
}

async function setPending(pendingObj) {
  await chrome.storage.local.set({ [STORAGE_KEYS.pending]: pendingObj || null });
}

async function clearPending() {
  await chrome.storage.local.remove([STORAGE_KEYS.pending]);
}

/* ================= Auth Expiry / Logout ================= */

let __tokenExpiryTimer = null;

function b64urlToJson(seg) {
  try {
    let s = String(seg || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad) s += "=".repeat(4 - pad);
    const decoded = atob(s);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function getJwtExpMs(token) {
  // JWT = header.payload.signature
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  const payload = b64urlToJson(parts[1]);
  if (!payload || typeof payload.exp !== "number") return null;

  return payload.exp * 1000; // exp em segundos -> ms
}

function clearTokenExpiryTimer() {
  if (__tokenExpiryTimer) {
    clearTimeout(__tokenExpiryTimer);
    __tokenExpiryTimer = null;
  }
}

function scheduleTokenExpiryLogout() {
  clearTokenExpiryTimer();

  const expMs = getJwtExpMs(state.token);
  if (!expMs) return; // se não for JWT, cai por 401/403

  const SKEW_MS = 30 * 1000; // derruba 30s antes de expirar
  const waitMs = Math.max(0, expMs - Date.now() - SKEW_MS);

  __tokenExpiryTimer = setTimeout(() => {
    forceLogout("token_expired_timer");
  }, waitMs);
}

async function forceLogout(reason = "expired") {
  try {
    clearTokenExpiryTimer();

    state.token = null;
    state.userEmail = null;

    state.plans = [];
    state.kits = [];
    state.sharedCodes = {};

    state.selectedPlan = null;
    state.selectedKitKey = null;

    await clearStoredAuth();
    await clearPending();

    setHeaderEmail(null);
    setGate(false);
    showList();

    toast("Sessão expirada — faça login novamente");
    logLine({
      ok: false,
      msg: "Sessão expirada — voltando para login",
      data: { reason },
    });
  } catch (e) {
    console.error(e);
  }
}

/* ================= API ================= */

async function apiFetch(path) {
  if (!state.token) throw new Error("Sem token. Faça login.");

  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${state.token}` },
    cache: "no-store",
  });

  // ✅ token expirou / inválido → volta pro login
  if (res.status === 401 || res.status === 403) {
    await forceLogout("api_unauthorized");
    throw new Error("Sessão expirada (401/403).");
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erro API ${res.status}: ${txt || "sem corpo"}`);
  }

  return res.json();
}

async function loadAll() {
  const plansData = await apiFetch("/v1/plans");
  state.plans = plansData.plans || [];

  const kitsData = await apiFetch("/v1/kits");
  state.kits = kitsData.kits || [];

  const shared = await apiFetch("/v1/codes/shared");
  state.sharedCodes = shared || {};
}

/* ================= Backend Login (Device Code) ================= */

async function startBackendLogin() {
  const res = await fetch(API_BASE + "/v1/auth/device/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Falha start login (${res.status}): ${txt || "sem corpo"}`
    );
  }

  const start = await res.json();
  const pending = {
    device_code: start.device_code,
    user_code: start.user_code,
    verification_url: start.verification_url,
    interval: Number(start.interval || 2),
    expires_at: Date.now() + Number(start.expires_in || 600) * 1000,
  };

  await setPending(pending);
  await chrome.tabs.create({ url: pending.verification_url, active: true });

  toast(`Código: ${pending.user_code}`);
  logLine({
    ok: true,
    msg: "Login iniciado. Use este código no site:",
    data: { user_code: pending.user_code },
  });

  await pollBackendLogin(pending);
}

async function pollBackendLogin(pending) {
  if (state.polling) return;
  state.polling = true;

  try {
    while (Date.now() < pending.expires_at) {
      await new Promise((r) => setTimeout(r, pending.interval * 1000));

      const r = await fetch(API_BASE + "/v1/auth/device/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ device_code: pending.device_code }),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let j = null;
        try {
          j = JSON.parse(txt);
        } catch {}
        const status = j?.status || "error";
        if (status === "expired")
          throw new Error("Login expirou. Clique em login novamente.");
        if (status === "denied") throw new Error("Usuário não autorizado.");
        throw new Error(`Poll falhou (${r.status}): ${txt || "sem corpo"}`);
      }

      const poll = await r.json();
      if (poll.status === "approved" && poll.token) {
        state.token = poll.token;
        state.userEmail = poll.email || null;
        await setStoredAuth({ token: state.token, email: state.userEmail });
        await clearPending();

        scheduleTokenExpiryLogout(); // ✅ agenda expiração (se for JWT)

        setHeaderEmail(state.userEmail);
        setGate(true);

        toast("✅ Login concluído");
        logLine({
          ok: true,
          msg: "Login concluído",
          data: { email: state.userEmail },
        });

        await boot(true);
        return;
      }
    }
    throw new Error("Login expirou. Clique em login novamente.");
  } finally {
    state.polling = false;
  }
}

/* ================= Render plans ================= */

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPlans(filter = "") {
  const list = $("plansList");
  if (!list) return;
  list.innerHTML = "";

  const q = (filter || "").toLowerCase();
  const items = (state.plans || []).filter((p) => {
    const name = (p.name || "").toLowerCase();
    const id = (p.id || "").toLowerCase();
    return !q || name.includes(q) || id.includes(q);
  });

  if (!items.length) {
    list.innerHTML = `
      <div class="card">
        <div class="label">Nada encontrado</div>
        <div class="hint">Tente outro termo.</div>
      </div>`;
    return;
  }

  for (const p of items) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="name">${escapeHtml(p.name || p.id)}</div>
        <div class="meta">${escapeHtml(p.portal_url || "")}</div>
      </div>
      <span class="badge">→</span>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  }
}

/* ================= Kits (Dropdown custom) ================= */

function renderKitsSelect() {
  // 🔁 Mantém o nome da função pra você não precisar trocar chamadas no resto do código.
  // Agora ela renderiza o dropdown custom (kitDD), não mais <select>.

  const btnLabel = $("kitDDLabel");
  const list = $("kitDDList");

  const kits = state.kits || [];

  if (!kits.length) {
    if (btnLabel) btnLabel.textContent = "Sem kits";
    if (list)
      list.innerHTML = `<div class="ddItem" style="opacity:.75; cursor:default;">Sem kits</div>`;
    updateCodesHint();
    syncStepsUI();
    return;
  }

  if (!state.selectedKitKey) state.selectedKitKey = kits[0].key;

  const kit = getSelectedKit();
  if (btnLabel)
    btnLabel.textContent = kit?.label || kit?.key || "— Escolha um kit —";

  updateCodesHint();
  renderKitsDropdown(""); // lista completa
  syncStepsUI();
}

function openKitMenu() {
  const menu = $("kitDDMenu");
  const btn = $("kitDDBtn");
  const search = $("kitDDSearch");
  if (!menu || !btn) return;

  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");

  if (search) {
    search.value = "";
    search.focus();
  }
  renderKitsDropdown("");
}

function closeKitMenu() {
  const menu = $("kitDDMenu");
  const btn = $("kitDDBtn");
  if (!menu || !btn) return;

  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}

function toggleKitMenu() {
  const menu = $("kitDDMenu");
  if (!menu) return;
  menu.hidden ? openKitMenu() : closeKitMenu();
}

function setKitKey(key) {
  state.selectedKitKey = key;

  const kit = getSelectedKit();
  const lbl = $("kitDDLabel");
  if (lbl) lbl.textContent = kit?.label || kit?.key || "— Escolha um kit —";

  updateCodesHint();
  syncStepsUI();

  logLine({
    ok: true,
    msg: "Kit selecionado",
    data: { kit: kit?.key, codes_ref: kit?.codes_ref },
  });
}

function renderKitsDropdown(filter = "") {
  const list = $("kitDDList");
  if (!list) return;
  list.innerHTML = "";

  const q = (filter || "").toLowerCase().trim();
  const kits = (state.kits || []).filter((k) => {
    const label = (k.label || k.key || "").toLowerCase();
    return !q || label.includes(q);
  });

  if (!kits.length) {
    const empty = document.createElement("div");
    empty.className = "ddItem";
    empty.style.opacity = "0.75";
    empty.style.cursor = "default";
    empty.textContent = "Nada encontrado";
    list.appendChild(empty);
    return;
  }

  for (const k of kits) {
    const codes = extractCodesFromShared(k.codes_ref);
    const item = document.createElement("div");

    item.className =
      "ddItem" + (k.key === state.selectedKitKey ? " selected" : "");
    item.innerHTML = `
      <div>
        <div>${escapeHtml(k.label || k.key)}</div>
        <div class="sub">codes_ref: ${escapeHtml(
          k.codes_ref
        )} · ${codes.length} códigos</div>
      </div>
      <div class="ddTick">${k.key === state.selectedKitKey ? "✅" : ""}</div>
    `;

    item.onclick = () => {
      setKitKey(k.key);
      closeKitMenu();
    };

    list.appendChild(item);
  }
}

/* === Mantém as funções originais (não mexe) === */

function getSelectedKit() {
  return (state.kits || []).find((k) => k.key === state.selectedKitKey) || null;
}

function extractCodesFromShared(codesRef) {
  const shared = state.sharedCodes || {};
  const v = shared?.[codesRef];

  if (Array.isArray(v)) return v.map(String);
  if (v && Array.isArray(v.codes)) return v.codes.map(String);

  return [];
}

function updateCodesHint() {
  const kit = getSelectedKit();
  const hint = $("codesInfo");
  if (!hint) return;

  if (!kit) {
    hint.textContent = "Códigos: —";
    syncStepsUI();
    return;
  }

  const codes = extractCodesFromShared(kit.codes_ref);
  hint.textContent = `codes_ref: ${kit.codes_ref} · códigos: ${codes.length}`;
  syncStepsUI();
}

/* ================= Selection ================= */

function selectPlan(plan) {
  state.selectedPlan = plan;

  const pill = $("planPill");
  if (pill) pill.textContent = plan.name || plan.id || "Plano";

  $("planUrl").textContent = plan.portal_url || "";
  showDetails();

  if (!state.selectedKitKey && state.kits?.length)
    state.selectedKitKey = state.kits[0].key;
  renderKitsSelect();

  logLine({ ok: true, msg: "Plano selecionado", data: { plan: plan.id } });
}

/* ================= Actions ================= */

async function openPortal() {
  if (!state.selectedPlan?.portal_url) return toast("Sem portal");
  await chrome.tabs.create({ url: state.selectedPlan.portal_url, active: true });
  syncStepsUI();
}

function parseMaskaraMeta(scriptText) {
  const re = /\/\*@maskara\s*({[\s\S]*?})\s*\*\//m;
  const m = String(scriptText || "").match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function setPayloadOnPage(tabId, payload) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    func: (p) => {
      window.__HP_PAYLOAD__ = p;
    },
    args: [payload],
  });
}

async function injectAsConsole(tabId, code) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    func: (js) => {
      const s = document.createElement("script");
      s.textContent = js;
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      return { ok: true, href: location.href };
    },
    args: [String(code || "")],
  });
}

async function runKit() {
  const plan = state.selectedPlan;
  if (!plan) return toast("Selecione um plano");

  const kit = getSelectedKit();
  if (!kit) return toast("Selecione um kit");

  const codes = extractCodesFromShared(kit.codes_ref);
  if (!codes.length) {
    toast("❌ Nenhum código no kit (shared_codes)");
    logLine({
      ok: false,
      msg: "Kit sem códigos",
      data: { codes_ref: kit.codes_ref },
    });
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return toast("Nenhuma aba ativa");

  try {
    const data = await apiFetch(`/v1/scripts/${encodeURIComponent(plan.id)}`);
    const scripts = data.scripts || {};
    const key = data.default_script || Object.keys(scripts)[0];
    const scriptText = scripts[key];

    if (!scriptText) throw new Error("script vazio");

    const meta = parseMaskaraMeta(scriptText);
    const runNonce = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const payload = {
      planId: plan.id,
      planName: plan.name,
      portal_url: plan.portal_url,
      kitKey: kit.key,
      kitLabel: kit.label,
      codes_ref: kit.codes_ref,
      codes,
      detect: meta || null,
      runNonce,
    };

    setTopStep(3);

    await setPayloadOnPage(tab.id, payload);

    try {
      const mustUrlIncludes =
        meta && Array.isArray(meta.mustUrlIncludes) && meta.mustUrlIncludes.length
          ? meta.mustUrlIncludes
          : [String(plan.portal_url || "").split("/")[2] || "geap"];

      await chrome.runtime.sendMessage({
        type: "RUN_PLAN",
        tabId: tab.id,
        payloadObj: payload,
        runnerJsString: scriptText,
        mustUrlIncludes,
      });

      logLine({
        ok: true,
        msg: "Background armado (auto-continue ativado)",
        data: { mustUrlIncludes, runNonce },
      });
    } catch (e) {
      logLine({
        ok: false,
        msg: "Falha ao armar background (auto-continue pode falhar)",
        data: { error: String(e?.message || e), runNonce },
      });
    }

    logLine({
      ok: true,
      msg: "Executando kit… (injeção direta pelo popup)",
      data: { plan: plan.id, kit: kit.key, codes: codes.length, runNonce },
    });

    const results = await injectAsConsole(tab.id, scriptText);
    const okSomewhere = Array.isArray(results) && results.some((r) => r?.result?.ok);

    logLine({
      ok: !!okSomewhere,
      msg: okSomewhere
        ? "Injeção OK (frame detectado)"
        : "Injeção executada (sem retorno)",
      data: { frames: results?.length || 0, runNonce },
    });

    toast("🎭 Kit enviado — botão aparecerá no portal");
  } catch (e) {
    console.error(e);
    toast("Falha ao executar kit");
    logLine({
      ok: false,
      msg: "Falha ao executar kit",
      data: { error: String(e?.message || e) },
    });
  } finally {
    syncStepsUI();
  }
}

/* ================= Wire ================= */

function wire() {
  $("q")?.addEventListener("input", (e) => renderPlans(e.target.value));

  // ✅ agora não quebra se faltar botão
  $("btnBack")?.addEventListener("click", showList);
  $("btnBackTop")?.addEventListener("click", showList);

  $("btnOpen")?.addEventListener("click", openPortal);
  $("btnRun")?.addEventListener("click", runKit);

  // Dropdown custom do KIT
  $("kitDDBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleKitMenu();
  });

  $("kitDDSearch")?.addEventListener("input", (e) => {
    renderKitsDropdown(e.target.value || "");
  });

  // fechar ao clicar fora
  document.addEventListener("click", (e) => {
    const dd = $("kitDD");
    const menu = $("kitDDMenu");
    if (!dd || !menu || menu.hidden) return;
    if (!dd.contains(e.target)) closeKitMenu();
  });

  // fechar com ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeKitMenu();
  });

  $("btnRefresh")?.addEventListener("click", async () => {
    try {
      await boot(true);
      toast("Atualizado ✅");
    } catch (e) {
      toast("Falha ao atualizar");
      logLine({
        ok: false,
        msg: "Falha ao atualizar",
        data: { error: String(e?.message || e) },
      });
    }
  });

  $("btnGoogleLogin")?.addEventListener("click", async () => {
    try {
      toast("Abrindo login…");
      await startBackendLogin();
    } catch (e) {
      toast("❌ Falha no login");
      logLine({
        ok: false,
        msg: "Falha no login (backend)",
        data: { error: String(e?.message || e) },
      });
      setGate(false);
    }
  });
}

/* ================= Init ================= */

async function boot(forceReload = false) {
  if (forceReload) {
    state.plans = [];
    state.kits = [];
    state.sharedCodes = {};
  }

  const stored = await getStoredAuth();
  state.token = stored.token || null;
  state.userEmail = stored.email || null;

  // ✅ agenda expiração (se for JWT)
  if (state.token) scheduleTokenExpiryLogout();

  setHeaderEmail(state.userEmail);

  if (!state.token) {
    setGate(false);

    if (
      stored.pending &&
      stored.pending.device_code &&
      stored.pending.expires_at > Date.now()
    ) {
      logLine({
        ok: true,
        msg: "Retomando login pendente…",
        data: { user_code: stored.pending.user_code },
      });
      toast(`Login pendente: ${stored.pending.user_code}`);
      pollBackendLogin(stored.pending).catch((e) => {
        logLine({
          ok: false,
          msg: "Falha ao retomar login",
          data: { error: String(e?.message || e) },
        });
      });
    } else {
      if (stored.pending) await clearPending();
      toast("❌ Login necessário");
    }
    return;
  }

  setGate(true);

  await loadAll();
  renderPlans($("q")?.value || "");

  if (state.selectedPlan) selectPlan(state.selectedPlan);
  else showList();

  logLine({
    ok: true,
    msg: "Carregado",
    data: { plans: state.plans.length, kits: state.kits.length },
  });
  syncStepsUI();
}

(async function init() {
  wire();
  await boot(false);
  syncStepsUI();
})();
