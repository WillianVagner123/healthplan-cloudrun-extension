/* popup.js — O Maskara (Cloud Run + Google Auth + Kits)
   - Lista planos do Cloud Run
   - Seleciona plano -> tela de kit
   - Busca kits (/v1/kits) e códigos compartilhados (/v1/codes/shared)
   - Executa o script do plano “igual console” (MAIN world)
   - Define window.__HP_PAYLOAD__ antes de injetar o script (para runners IIFE)

   ✅ FIX:
   - Auth só no clique (MV3 bloqueia popup se não for user gesture)
   - Ajuste de IDs (logBox/codesInfo/pageDetails)
*/

const $ = (id) => document.getElementById(id);
const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  userEmail: null,

  plans: [],
  selectedPlan: null,

  kits: [],
  selectedKitKey: null,
  sharedCodes: {},

  logs: [],
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
    .map((l) => `${l.ts} ${l.ok ? "✅" : l.ok === false ? "❌" : "•"} ${l.msg}${l.data ? `\n${JSON.stringify(l.data, null, 2)}` : ""}`)
    .join("\n\n");
  box.scrollTop = 0;
}

function toast(msg) {
  const t = $("toast");
  if (!t) return console.log(msg);
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1800);
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

/* ================= Google Auth (via Service Worker) ================= */

async function googleStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GOOGLE_STATUS" });
    if (res?.ok) return res;
  } catch {}
  return { ok: true, authenticated: false, email: null };
}

async function googleLogin() {
  const res = await chrome.runtime.sendMessage({ type: "GOOGLE_LOGIN" });
  if (!res?.ok) throw new Error(res?.error || "Falha no login");
  return res; // { token, email }
}

/* ================= API ================= */

async function apiFetch(path) {
  if (!state.userEmail) throw new Error("Usuário não autenticado");

  const res = await fetch(API_BASE + path, {
    headers: { "X-User-Email": state.userEmail },
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
    func: (p) => { window.__HP_PAYLOAD__ = p; },
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

    logLine({ ok: true, msg: "Executando kit…", data: { plan: plan.id, kit: kit.key, codes: codes.length } });

    await setPayloadOnPage(tab.id, payload);

    // runnerBase opcional
    try {
      const baseUrl = chrome.runtime.getURL("runnerBase.js");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN",
        func: async (url) => {
          if (window.__HP_BASE__) return { ok: true, already: true };
          const txt = await fetch(url).then(r => r.text());
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

    const okSomewhere = Array.isArray(results) && results.some(r => r?.result?.ok);
    logLine({
      ok: !!okSomewhere,
      msg: okSomewhere ? "Injeção OK (frame detectado)" : "Injeção executada (sem retorno)",
      data: { frames: results?.length || 0 }
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
    } catch {
      toast("Falha ao atualizar");
    }
  };

  $("btnGoogleLogin")?.addEventListener("click", async () => {
    try {
      toast("Abrindo login…");
      const r = await googleLogin();
      state.userEmail = r.email || null;
      if ($("userEmail")) $("userEmail").textContent = state.userEmail || "—";

      // agora autenticou, carrega
      await boot(true);
    } catch (e) {
      toast("❌ Falha no login");
      logLine({ ok: false, msg: "Falha no login Google", data: { error: String(e?.message || e) } });
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

  // 1) status sem popup
  const st = await googleStatus();
  state.userEmail = st.email || null;

  if ($("userEmail")) $("userEmail").textContent = state.userEmail || "—";

  if (!st.authenticated) {
    setGate(false);
    toast("❌ Login Google necessário");
    return;
  }

  // 2) autenticado → carrega app
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
