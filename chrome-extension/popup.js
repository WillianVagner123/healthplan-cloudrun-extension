const $ = (id) => document.getElementById(id);

const DEFAULT_API_BASE =
  "https://healthplan-api-153673459631.southamerica-east1.run.app";

/* ---------- state ---------- */
const state = {
  plans: [],
  selected: null,
  scripts: {},
  apiBase: DEFAULT_API_BASE,
  clientKey: ""
};

/* ---------- api ---------- */
function apiFetch(path) {
  const base = state.apiBase.replace(/\/$/, "");
  const url = base + path;

  const headers = {};
  if (state.clientKey) {
    headers["X-Client-Key"] = state.clientKey;
  }

  return fetch(url, { headers });
}

/* ---------- ui helpers ---------- */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1200);
}

function showList() {
  $("plansList").hidden = false;
  $("q").hidden = false;
  $("details").hidden = true;
  $("settings") && ($("settings").hidden = true);
}

function showDetails() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("details").hidden = false;
  $("settings") && ($("settings").hidden = true);
}

/* ---------- render ---------- */
function renderList(filter = "") {
  const list = $("plansList");
  list.innerHTML = "";

  const q = filter.trim().toLowerCase();

  const items = state.plans.filter((p) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(q))
  );

  if (items.length === 0) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="label">Nada encontrado</div>
      <div class="hint">Tente outro termo.</div>
    `;
    list.appendChild(div);
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
      <div class="badges">
        ${(p.tags || [])
          .slice(0, 3)
          .map((t) => `<span class="badge">${t}</span>`)
          .join("")}
        <span class="badge">→</span>
      </div>
    `;
    el.addEventListener("click", () => selectPlan(p));
    list.appendChild(el);
  }
}

/* ---------- data ---------- */
async function loadPlans() {
  const res = await apiFetch("/v1/plans");
  if (!res.ok) throw new Error("Erro ao carregar planos");

  const data = await res.json();
  state.plans = data.plans || [];
  renderList($("q").value || "");
}

async function selectPlan(plan) {
  state.selected = plan;

  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  const res = await apiFetch(`/v1/scripts/${encodeURIComponent(plan.id)}`);
  if (!res.ok) throw new Error("Erro ao carregar scripts");

  const data = await res.json();
  state.scripts = data.scripts || {};

  const select = $("scriptGroup");
  select.innerHTML = "";

  const groups = Object.keys(state.scripts);

  if (groups.length === 0) {
    $("scriptBox").value = "Nenhum script disponível.";
  } else {
    for (const key of groups) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);
    }
    select.value = groups[0];
    $("scriptBox").value = state.scripts[groups[0]];
  }

  showDetails();
}

/* ---------- actions ---------- */
async function openPortal() {
  if (!state.selected) return;
  await chrome.tabs.create({
    url: state.selected.portal_url,
    active: true
  });
}

async function copyScript() {
  const text = $("scriptBox").value || "";
  if (!text.trim()) {
    toast("Sem script");
    return;
  }
  await navigator.clipboard.writeText(text);
  toast("Copiado ✅");
}

/* ---------- events ---------- */
function wire() {
  $("q").addEventListener("input", (e) =>
    renderList(e.target.value)
  );

  $("btnBack").addEventListener("click", showList);
  $("btnOpen").addEventListener("click", openPortal);
  $("btnCopy").addEventListener("click", copyScript);

  $("scriptGroup").addEventListener("change", (e) => {
    const key = e.target.value;
    $("scriptBox").value = state.scripts[key] || "";
  });
}

/* ---------- init ---------- */
async function main() {
  wire();
  showList();

  try {
    await loadPlans();
  } catch (err) {
    console.error(err);
    toast("Erro ao carregar planos");
  }
}

main();
