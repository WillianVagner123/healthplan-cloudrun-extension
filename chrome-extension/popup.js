const $ = (id) => document.getElementById(id);

// ✅ sua API Cloud Run
const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scriptsMap: {},      // { key: "code" }
  scriptKey: "",       // key selecionada
  scriptCode: null     // código final pra executar
};

/* ================= UI ================= */

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1600);
}

function showList() {
  $("plansList").hidden = false;
  $("q").hidden = false;
  $("details").hidden = true;
}

function showDetails() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("details").hidden = false;
}

function setLoading(on) {
  const sp = $("spinner");
  if (sp) sp.hidden = !on;
}

/* ================= API ================= */

async function apiFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`Erro ao acessar API: ${res.status}`);
  return res.json();
}

async function loadPlans() {
  setLoading(true);
  try {
    const data = await apiFetch("/v1/plans");
    state.plans = data.plans || [];
    renderList();
  } finally {
    setLoading(false);
  }
}

/* ================= Render ================= */

function renderList(filter = "") {
  const list = $("plansList");
  list.innerHTML = "";

  const q = (filter || "").toLowerCase();
  const items = state.plans.filter((p) => {
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
        <div class="name">${p.name}</div>
        <div class="meta">${p.portal_url || ""}</div>
      </div>
      <span class="badge">→</span>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  }
}

/* ================= Helpers ================= */

function rebuildScriptDropdown() {
  const sel = $("scriptSelect");
  if (!sel) return;

  sel.innerHTML = "";
  const keys = Object.keys(state.scriptsMap || {});

  if (!keys.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem scripts";
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = keys.length <= 1 ? true : false;

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }

  // define seleção
  if (!state.scriptKey || !state.scriptsMap[state.scriptKey]) {
    state.scriptKey = keys[0];
  }
  sel.value = state.scriptKey;

  state.scriptCode = state.scriptsMap[state.scriptKey] || null;
}

/* ================= Selection ================= */

async function selectPlan(plan) {
  state.selected = plan;
  state.scriptsMap = {};
  state.scriptKey = "";
  state.scriptCode = null;

  $("planName").textContent = plan.name || plan.id;
  $("planUrl").textContent = plan.portal_url || "";

  setLoading(true);
  try {
    const data = await apiFetch(`/v1/scripts/${plan.id}`);

    // ✅ server devolve: { scripts: {KEY: "code"}, default_script: "KEY" }
    state.scriptsMap = data.scripts || {};

    const keys = Object.keys(state.scriptsMap);
    if (!keys.length) {
      toast("Nenhum script disponível");
      return;
    }

    state.scriptKey = data.default_script || keys[0];
    state.scriptCode = state.scriptsMap[state.scriptKey] || null;

    rebuildScriptDropdown();
    showDetails();
    toast("Plano carregado ✅");
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar scripts");
  } finally {
    setLoading(false);
  }
}

/* ================= Actions ================= */

function openPortal() {
  if (!state.selected?.portal_url) return;
  chrome.tabs.create({ url: state.selected.portal_url });
}

/* ================= Script Execution ================= */

async function executeScript({ silent = false } = {}) {
  if (!state.scriptCode) {
    toast("Nenhum script carregado");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    toast("Nenhuma aba ativa");
    return;
  }

  if (!silent) {
    const ok = confirm("🎭 Executar automação no site aberto?");
    if (!ok) return;
  }

  // pequeno delay pra DOM estabilizar
  await new Promise((r) => setTimeout(r, 600));

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (code) => {
        try {
          // ✅ Igual colar no console:
          // (0, eval) garante eval no escopo global
          (0, eval)(code);
        } catch (e) {
          console.error("❌ Erro na automação:", e);
          alert("❌ Erro na automação. Abra o Console (F12) para detalhes.");
        }
      },
      args: [state.scriptCode]
    });

    toast("Executado ⚡");
  } catch (e) {
    console.error(e);
    toast("Falha ao executar script");
  }
}

/* ================= Wire ================= */

function wire() {
  $("q").oninput = (e) => renderList(e.target.value);

  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = () => executeScript({ silent: false });
  $("btnRunSilent").onclick = () => executeScript({ silent: true });

  // dropdown de script
  const sel = $("scriptSelect");
  if (sel) {
    sel.onchange = () => {
      state.scriptKey = sel.value;
      state.scriptCode = state.scriptsMap[state.scriptKey] || null;
      toast(`Script: ${state.scriptKey}`);
    };
  }

  // botão refresh (se existir)
  const refresh = $("btnRefresh");
  if (refresh) {
    refresh.onclick = async () => {
      if (!state.selected) return;
      await selectPlan(state.selected);
    };
  }
}

/* ================= Init ================= */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
