/* =========================================================
   O MASKARA 🎭⚡
   popup.js — versão final
   ========================================================= */

const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scripts: {}
};

/* ===================== UI HELPERS ===================== */

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

/* ===================== API ===================== */

function apiFetch(path) {
  return fetch(API_BASE + path);
}

async function loadPlans() {
  try {
    const res = await apiFetch("/v1/plans");
    const data = await res.json();
    state.plans = data.plans || [];
    renderList();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar planos");
  }
}

/* ===================== RENDER ===================== */

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
      <div class="badges">
        ${(p.tags || []).slice(0, 3).map(t => `<span class="badge">${t}</span>`).join("")}
        <span class="badge">→</span>
      </div>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  }
}

/* ===================== PLAN SELECTION ===================== */

async function selectPlan(plan) {
  state.selected = plan;

  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  try {
    const res = await apiFetch(`/v1/scripts/${encodeURIComponent(plan.id)}`);
    const data = await res.json();
    state.scripts = data.scripts || {};
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar scripts");
    return;
  }

  const select = $("scriptGroup");
  select.innerHTML = "";

  const keys = Object.keys(state.scripts);

  if (!keys.length) {
    $("scriptBox").value = "Nenhum script disponível.";
    return showDetails();
  }

  keys.forEach(k => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    select.appendChild(o);
  });

  select.value = keys[0];
  $("scriptBox").value = state.scripts[keys[0]] || "";

  showDetails();
}

/* ===================== ACTIONS ===================== */

async function openPortal() {
  if (!state.selected) return;
  await chrome.tabs.create({
    url: state.selected.portal_url,
    active: true
  });
}

async function copyScript() {
  const txt = $("scriptBox").value || "";
  if (!txt.trim()) return toast("Nada para copiar");
  await navigator.clipboard.writeText(txt);
  toast("Copiado ✅");
}

/* ===================== SCRIPT EXECUTION ===================== */

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
            console.error("❌ Erro no script:", e);
          }
        }, wait);
      },
      args: [code, delay]
    });
  }

  toast("Scripts executados ⚡");
}

/* ===== MODOS ===== */

function runWithDelay() {
  executeScripts(3000); // 🎭 tempo para navegação/login
}

function runSilent() {
  executeScripts(0); // ⚡ direto
}

/* ===================== WIRE ===================== */

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnCopy").onclick = copyScript;
  $("btnRun").onclick = runWithDelay;
  $("btnRunSilent").onclick = runSilent;

  $("scriptGroup").onchange = e =>
    ($("scriptBox").value = state.scripts[e.target.value] || "");
}

/* ===================== INIT ===================== */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
