const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scriptCode: null
};

/* ================= UI ================= */

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1400);
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

/* ================= API ================= */

async function apiFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Erro ao acessar API");
  return res.json();
}

async function loadPlans() {
  const data = await apiFetch("/v1/plans");
  state.plans = data.plans || [];
  renderList();
}

/* ================= Render ================= */

function renderList(filter = "") {
  const list = $("plansList");
  list.innerHTML = "";

  const q = filter.toLowerCase();
  const items = state.plans.filter(p =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q)
  );

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
        <div class="meta">${p.portal_url}</div>
      </div>
      <span class="badge">→</span>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  }
}

/* ================= Selection ================= */

async function selectPlan(plan) {
  state.selected = plan;
  state.scriptCode = null;

  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  try {
    const data = await apiFetch(`/v1/scripts/${plan.id}`);

    // A API DEVE DEVOLVER:
    // { code: "(() => { ... })()" }
    state.scriptCode = data.code || null;

    if (!state.scriptCode) {
      toast("Nenhum script disponível");
      return;
    }

    showDetails();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar script");
  }
}

/* ================= Actions ================= */

function openPortal() {
  if (!state.selected) return;
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
    const ok = confirm("🎭 Executar automação diretamente no site aberto?");
    if (!ok) return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (code) => {
        try {
          new Function(code)();
        } catch (e) {
          console.error("❌ Erro na automação:", e);
        }
      },
      args: [state.scriptCode]
    });

    toast("Scripts executados ⚡");
  } catch (e) {
    console.error(e);
    toast("Falha ao executar script");
  }
}

/* ================= Wire ================= */

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = () => executeScript({ silent: false });
  $("btnRunSilent").onclick = () => executeScript({ silent: true });
}

/* ================= Init ================= */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
