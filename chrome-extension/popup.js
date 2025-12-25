const $ = (id) => document.getElementById(id);

const state = {
  plans: [],
  selected: null,
  scripts: null,
  apiBase: "https://healthplan-api-153673459631.southamerica-east1.run.app",
  clientKey: ""
};

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 1200);
}

function showList() {
  $("details").hidden = true;
  $("settings").hidden = true;
  $("plansList").hidden = false;
  $("q").hidden = false;
}

function showDetails() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("settings").hidden = true;
  $("details").hidden = false;
}

function showSettings() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("details").hidden = true;
  $("settings").hidden = false;
}

function renderList(filter = "") {
  const list = $("plansList");
  list.innerHTML = "";

  const q = filter.trim().toLowerCase();
  const items = state.plans.filter(p =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if (items.length === 0) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<div class="label">Nada encontrado</div><div class="hint">Tente outro termo.</div>`;
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
        ${(p.tags || []).slice(0,3).map(t => `<span class="badge">${t}</span>`).join("")}
        <span class="badge">→</span>
      </div>
    `;
    el.addEventListener("click", () => selectPlan(p));
    list.appendChild(el);
  }
}

async function loadPlans() {
  const res = await apiFetch("/v1/plans");
  if (!res.ok) throw new Error("Falha ao carregar planos: " + res.status);
  const data = await res.json();
  state.plans = data.plans || [];
  renderList($("q").value || "");
}

async function selectPlan(plan) {
  state.selected = plan;
  $("planName").textContent = `${plan.name}`;
  $("planUrl").textContent = plan.portal_url;

  // carregar scripts do plano
  const res = await apiFetch(`/v1/scripts/${encodeURIComponent(plan.id)}`);
  if (!res.ok) throw new Error("Falha ao carregar scripts: " + res.status);
  const data = await res.json();
  state.scripts = data.scripts || {};

  // popular combo
  const groups = (plan.script_groups || []).map(g => g.key);
  const select = $("scriptGroup");
  select.innerHTML = "";
  for (const key of groups) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  }

  // set initial script
  const first = groups[0] || Object.keys(state.scripts)[0];
  if (first) {
    select.value = first;
    $("scriptBox").value = state.scripts[first] || "";
  } else {
    $("scriptBox").value = "Nenhum script disponível.";
  }

  showDetails();
}

async function openPortal() {
  if (!state.selected) return;
  await chrome.tabs.create({ url: state.selected.portal_url, active: true });
}

async function copyScript() {
  const text = $("scriptBox").value || "";
  if (!text.trim()) return toast("Sem script");
  await navigator.clipboard.writeText(text);
  toast("Copiado ✅");
}

function wire() {
  $("q").addEventListener("input", (e) => renderList(e.target.value));
  $("btnBack").addEventListener("click", showList);

  $("btnOpen").addEventListener("click", openPortal);
  $("btnCopy").addEventListener("click", copyScript);

  $("scriptGroup").addEventListener("change", (e) => {
    const key = e.target.value;
    $("scriptBox").value = state.scripts?.[key] || "";
  });
}

async function main() {
  wire();
  showList();

  try {
    await loadPlans();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar");
  }
}
main();

