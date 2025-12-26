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
  pending: "maskara_pending", // { device_code, user_code, expires_at, interval, verification_url }
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
  if (loginGate) loginGate.hidden = !!authenticated;
  if (appGate) appGate.hidden = !authenticated;
}

function showList() {
  $("pageList").hidden = false;
  $("pageDetails").hidden = true;
}

function showDetails() {
  $("pageList").hidden = true;
  $("pageDetails").hidden = false;
}

function setHeaderEmail(email) {
  const el = $("userEmail");
  if (el) el.textContent = email || "—";
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

/* ================= API ================= */

async function apiFetch(path) {
  if (!state.token) throw new Error("Sem token. Faça login.");

  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${state.token}` },
    cache: "no-store",
  });

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
  // 1) inicia device flow
  const res = await fetch(API_BASE + "/v1/auth/device/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha start login (${res.status}): ${txt || "sem corpo"}`);
  }

  const start = await res.json(); // { device_code, user_code, verification_url, expires_in, interval }
  const pending = {
    device_code: start.device_code,
    user_code: start.user_code,
    verification_url: start.verification_url,
    interval: Number(start.interval || 2),
    expires_at: Date.now() + Number(start.expires_in || 600) * 1000,
  };

  await setPending(pending);

  // 2) abre a página /auth
  await chrome.tabs.create({ url: pending.verification_url, active: true });

  toast(`Código: ${pending.user_code}`);
  logLine({ ok: true, msg: "Login iniciado. Use este código no site:", data: { user_code: pending.user_code } });

  // 3) começa polling (no popup aberto)
  await pollBackendLogin(pending);
}

async function pollBackendLogin(pending) {
  if (state.polling) return;
  state.polling = true;

  try {
    // loop até aprovar ou expirar
    while (Date.now() < pending.expires_at) {
      // espera interval
      await new Promise((r) => setTimeout(r, pending.interval * 1000));

      const r = await fetch(API_BASE + "/v1/auth/device/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ device_code: pending.device_code }),
      });

      // denied/expired podem vir com status != 200
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        // tenta extrair json
        let j = null;
        try { j = JSON.parse(txt); } catch {}
        const status = j?.status || "error";
        if (status === "expired") throw new Error("Login expirou. Clique em login novamente.");
        if (status === "denied") throw new Error("Usuário não autorizado.");
        throw new Error(`Poll falhou (${r.status}): ${txt || "sem corpo"}`);
      }

      const poll = await r.json(); // {status:"pending"} ou {status:"approved", token, email}
      if (poll.status === "approved" && poll.token) {
        state.token = poll.token;
        state.userEmail = poll.email || null;
        await setStoredAuth({ token: state.token, email: state.userEmail });
        await clearPending();

        setHeaderEmail(state.userEmail);
        setGate(true);

        toast("✅ Login concluído");
        logLine({ ok: true, msg: "Login concluído", data: { email: state.userEmail } });

        // carrega app
        await boot(true);
        return;
      }

      // continua pendente
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

/* ================= Kits ================= */

function renderKitsSelect() {
  const sel = $("kitSelect");
  if (!sel) return;
  sel.innerHTML = "";

  const kits = state.kits || [];
  if (!kits.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem kits";
    sel.appendChild(opt);
    sel.disabled = true;
    updateCodesHint();
    return;
  }

  sel.disabled = false;

  for (const k of kits) {
    const opt = document.createElement("option");
    opt.value = k.key;
    opt.textContent = k.label || k.key;
    sel.appendChild(opt);
  }

  if (!state.selectedKitKey) state.selectedKitKey = kits[0].key;
  sel.value = state.selectedKitKey;

  updateCodesHint();
}

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
    return;
  }

  const codes = extractCodesFromShared(kit.codes_ref);
  hint.textContent = `codes_ref: ${kit.codes_ref} · códigos: ${codes.length}`;
}

/* ================= Selection ================= */

function selectPlan(plan) {
  state.selectedPlan = plan;

  const pill = $("planPill");
  if (pill) pill.textContent = plan.name || plan.id || "Plano";

  $("planUrl").textContent = plan.portal_url || "";
  showDetails();

  if (!state.selectedKitKey && state.kits?.length) state.selectedKitKey = state.kits[0].key;
  renderKitsSelect();

  logLine({ ok: true, msg: "Plano selecionado", data: { plan: plan.id } });
}

/* ================= Actions ================= */

async function openPortal() {
  if (!state.selectedPlan?.portal_url) return toast("Sem portal");
  await chrome.tabs.create({ url: state.selectedPlan.portal_url, active: true });
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
    logLine({ ok: false, msg: "Kit sem códigos", data: { codes_ref: kit.codes_ref } });
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

    const payload = {
      planId: plan.id,
      planName: plan.name,
      portal_url: plan.portal_url,
      kitKey: kit.key,
      kitLabel: kit.label,
      codes_ref: kit.codes_ref,
      codes,
      detect: meta || null,
    };

    logLine({
      ok: true,
      msg: "Executando kit…",
      data: { plan: plan.id, kit: kit.key, codes: codes.length },
    });

    await setPayloadOnPage(tab.id, payload);

    // runnerBase opcional (se existir no pacote)
    try {
      const baseUrl = chrome.runtime.getURL("runnerBase.js");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN",
        func: async (url) => {
          if (window.__HP_BASE__) return { ok: true, already: true };
          const txt = await fetch(url).then((r) => r.text());
          const s = document.createElement("script");
          s.textContent = txt;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
          return { ok: true, loaded: true };
        },
        args: [baseUrl],
      });
    } catch {}

    const results = await injectAsConsole(tab.id, scriptText);
    const okSomewhere = Array.isArray(results) && results.some((r) => r?.result?.ok);

    logLine({
      ok: !!okSomewhere,
      msg: okSomewhere ? "Injeção OK (frame detectado)" : "Injeção executada (sem retorno)",
      data: { frames: results?.length || 0 },
    });

    toast("🎭 Kit enviado — botão aparecerá no portal");
  } catch (e) {
    console.error(e);
    toast("Falha ao executar kit");
    logLine({ ok: false, msg: "Falha ao executar kit", data: { error: String(e?.message || e) } });
  }
}

/* ================= Wire ================= */

function wire() {
  $("q").oninput = (e) => renderPlans(e.target.value);

  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = runKit;

  $("kitSelect").onchange = (e) => {
    state.selectedKitKey = e.target.value;
    updateCodesHint();
    const kit = getSelectedKit();
    logLine({ ok: true, msg: "Kit selecionado", data: { kit: kit?.key, codes_ref: kit?.codes_ref } });
  };

  $("btnRefresh").onclick = async () => {
    try {
      await boot(true);
      toast("Atualizado ✅");
    } catch (e) {
      toast("Falha ao atualizar");
      logLine({ ok: false, msg: "Falha ao atualizar", data: { error: String(e?.message || e) } });
    }
  };

  // Botão de login (mantém ID btnGoogleLogin do seu HTML)
  $("btnGoogleLogin")?.addEventListener("click", async () => {
    try {
      toast("Abrindo login…");
      await startBackendLogin();
    } catch (e) {
      toast("❌ Falha no login");
      logLine({ ok: false, msg: "Falha no login (backend)", data: { error: String(e?.message || e) } });
      // deixa gate fechado
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

  // 1) carrega auth do storage
  const stored = await getStoredAuth();
  state.token = stored.token || null;
  state.userEmail = stored.email || null;

  setHeaderEmail(state.userEmail);

  // 2) se não tem token, tenta “retomar” pending (se existir)
  if (!state.token) {
    setGate(false);

    if (stored.pending && stored.pending.device_code && stored.pending.expires_at > Date.now()) {
      // retoma polling automaticamente quando abrir o popup
      logLine({ ok: true, msg: "Retomando login pendente…", data: { user_code: stored.pending.user_code } });
      toast(`Login pendente: ${stored.pending.user_code}`);
      pollBackendLogin(stored.pending).catch((e) => {
        logLine({ ok: false, msg: "Falha ao retomar login", data: { error: String(e?.message || e) } });
      });
    } else {
      // limpa pending expirado
      if (stored.pending) await clearPending();
      toast("❌ Login necessário");
    }

    return;
  }

  // 3) autenticado
  setGate(true);

  await loadAll();
  renderPlans($("q")?.value || "");

  if (state.selectedPlan) selectPlan(state.selectedPlan);
  else showList();

  logLine({ ok: true, msg: "Carregado", data: { plans: state.plans.length, kits: state.kits.length } });
}

(async function init() {
  wire();
  await boot(false);
})();
