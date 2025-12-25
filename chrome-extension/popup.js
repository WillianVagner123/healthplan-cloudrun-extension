const $ = (id) => document.getElementById(id);

const DEFAULT_API_BASE =
  "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scripts: {},
  apiBase: DEFAULT_API_BASE,
  clientKey: ""
};

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1400);
}

function showList() {
  $("plansList").hidden = false;
  $("q").hidden = false;
  $("details").hidden = true;
  $("settings").hidden = true;
}

function showDetails() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("details").hidden = false;
  $("settings").hidden = true;
}

function apiFetch(path) {
  const url = state.apiBase.replace(/\/$/, "") + path;
  const headers = {};
  if (state.clientKey) headers["X-Client-Key"] = state.clientKey;
  return fetch(url, { headers });
}

async function loadPlans() {
  const res = await apiFetch("/v1/plans");
  if (!res.ok) throw new Error("Erro " + res.status);
  const data = await res.json();
  state.plans = data.plans || [];
  renderList("");
}

function renderList(filter) {
  const list = $("plansList");
  list.innerHTML = "";

  const q = filter.toLowerCase();
  const items = state.plans.filter(p =>
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

async function selectPlan(plan) {
  state.selected = plan;
  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  const res = await apiFetch(`/v1/scripts/${plan.id}`);
  const data = await res.json();
  state.scripts = data.scripts || {};

  const select = $("scriptGroup");
  select.innerHTML = "";

  for (const key of Object.keys(state.scripts)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  }

  select.value = Object.keys(state.scripts)[0] || "";
  $("scriptBox").value = state.scripts[select.value] || "";

  showDetails();
}

async function openPortal() {
  chrome.tabs.create({ url: state.selected.portal_url });
}

async function runOnSite() {
  const script = $("scriptBox").value;
  if (!script.trim()) return toast("Sem script");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (code) => eval(code),
    args: [script]
  });

  toast("🎭 Executado!");
}

async function copyScript() {
  await navigator.clipboard.writeText($("scriptBox").value);
  toast("Copiado 📋");
}

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = runOnSite;
  $("btnCopy").onclick = copyScript;
  $("scriptGroup").onchange = e =>
    $("scriptBox").value = state.scripts[e.target.value] || "";
}

(async function main() {
  wire();
  showList();
  try {
    await loadPlans();
  } catch {
    toast("Erro ao carregar planos");
  }
})();
