const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scripts: {}
};

/* ---------- UI helpers ---------- */

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1200);
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

/* ---------- API ---------- */

function apiFetch(path) {
  return fetch(API_BASE + path);
}

async function loadPlans() {
  const res = await apiFetch("/v1/plans");
  const data = await res.json();
  state.plans = data.plans || [];
  renderList();
}

/* ---------- Render ---------- */

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

/* ---------- Selection ---------- */

async function selectPlan(plan) {
  state.selected = plan;
  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  const res = await apiFetch(`/v1/scripts/${plan.id}`);
  const data = await res.json();
  state.scripts = data.scripts || {};

  const select = $("scriptGroup");
  select.innerHTML = "";

  Object.keys(state.scripts).forEach(k => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    select.appendChild(o);
  });

  select.value = Object.keys(state.scripts)[0] || "";
  $("scriptBox").value = state.scripts[select.value] || "";

  showDetails();
}

/* ---------- Actions ---------- */

async function openPortal() {
  if (!state.selected) return;
  chrome.tabs.create({ url: state.selected.portal_url });
}

async function copyScript() {
  await navigator.clipboard.writeText($("scriptBox").value || "");
  toast("Copiado ✅");
}

/* ---------- Script execution ---------- */

async function executeScripts() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return toast("Nenhuma aba ativa");

  const scripts = Object.values(state.scripts).filter(Boolean);

  for (const code of scripts) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: new Function(code)
    });
  }

  toast("Scripts executados ⚡");
}

function runWithConfirm() {
  if (!confirm("🎭 Executar scripts diretamente no site aberto?")) return;
  executeScripts();
}

function runSilent() {
  executeScripts();
}

/* ---------- Wire ---------- */

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnCopy").onclick = copyScript;
  $("btnRun").onclick = runWithConfirm;
  $("btnRunSilent").onclick = runSilent;

  $("scriptGroup").onchange = e =>
    ($("scriptBox").value = state.scripts[e.target.value] || "");
}

/* ---------- Init ---------- */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
async function executeScripts(delay = 0) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    toast("Nenhuma aba ativa");
    return;
  }

  const scripts = Object.values(state.scripts || {}).filter(Boolean);
  if (!scripts.length) {
    toast("Nenhum script disponível");
    return;
  }

  for (const code of scripts) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (scriptText, wait) => {
        setTimeout(() => {
          try {
            console.log("🎭 O Maskara executando script...");
            new Function(scriptText)();
          } catch (e) {
            console.error("Erro no script:", e);
          }
        }, wait);
      },
      args: [code, delay]
    });
  }

  toast("Scripts executados ⚡");
}
