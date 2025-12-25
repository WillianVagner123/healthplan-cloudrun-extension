const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scripts: []
};

/* ---------- UI ---------- */

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
}

function showDetails() {
  $("plansList").hidden = true;
  $("q").hidden = true;
  $("details").hidden = false;
}

/* ---------- API ---------- */

async function apiFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Erro API");
  return res.json();
}

async function loadPlans() {
  const data = await apiFetch("/v1/plans");
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
  $("logBox").value = "";

  const data = await apiFetch(`/v1/scripts/${plan.id}`);
  state.scripts = Object.values(data.scripts || {}).filter(Boolean);

  showDetails();
}

/* ---------- Actions ---------- */

function openPortal() {
  if (!state.selected) return;
  chrome.tabs.create({ url: state.selected.portal_url });
}

/* ---------- Script Execution ---------- */

async function executeScripts(silent = false) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return toast("Nenhuma aba ativa");

  if (!silent) {
    if (!confirm("🎭 Executar scripts diretamente no site aberto?")) return;
  }

  for (const code of state.scripts) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: (scriptText) => {

        // intercepta console.log
        const oldLog = console.log;
        console.log = function (...args) {
          oldLog.apply(console, args);
          window.postMessage({
            source: "maskara-log",
            payload: args.join(" ")
          }, "*");
        };

        try {
          new Function(scriptText)();
        } catch (e) {
          console.log("Erro no script:", e.message);
        }
      },
      args: [code]
    });
  }

  toast("Scripts executados ⚡");
}

/* ---------- Log Capture ---------- */

window.addEventListener("message", (event) => {
  if (event.data?.source === "maskara-log") {
    appendLog(event.data.payload);
  }
});

function appendLog(text) {
  const box = $("logBox");
  box.value += text + "\n";
  box.scrollTop = box.scrollHeight;
}

/* ---------- Wire ---------- */

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = () => executeScripts(false);
  $("btnRunSilent").onclick = () => executeScripts(true);
}

/* ---------- Init ---------- */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
