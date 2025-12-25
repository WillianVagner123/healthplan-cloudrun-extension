// ================================
// O MASKARA 🎭⚡ — popup.js FINAL
// ================================

// Helper seguro
const $ = (id) => document.getElementById(id);

// API fixa (sem settings)
const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

// Estado global
const state = {
  plans: [],
  selected: null,
  scripts: {},
};

// Toast
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 1400);
}

// --------------------
// Navegação de telas
// --------------------
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

// --------------------
// API
// --------------------
function apiFetch(path) {
  return fetch(API_BASE.replace(/\/$/, "") + path);
}

// --------------------
// Renderização
// --------------------
function renderList(filter = "") {
  const list = $("plansList");
  list.innerHTML = "";

  const q = filter.toLowerCase().trim();
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

  items.forEach(p => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="name">${p.name}</div>
        <div class="meta">${p.portal_url}</div>
      </div>
      <div class="badge">→</div>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  });
}

// --------------------
// Load planos
// --------------------
async function loadPlans() {
  const res = await apiFetch("/v1/plans");
  if (!res.ok) throw new Error("Erro ao carregar planos");
  const data = await res.json();
  state.plans = data.plans || [];
  renderList("");
}

// --------------------
// Selecionar plano
// --------------------
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

  Object.keys(state.scripts).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    select.appendChild(opt);
  });

  const first = Object.keys(state.scripts)[0];
  $("scriptBox").value = first ? state.scripts[first] : "Nenhum script.";

  showDetails();
}

// --------------------
// Ações
// --------------------
async function openPortal() {
  if (!state.selected) return;
  await chrome.tabs.create({ url: state.selected.portal_url, active: true });
}

async function copyScript() {
  const txt = $("scriptBox").value;
  if (!txt.trim()) return toast("Sem script");
  await navigator.clipboard.writeText(txt);
  toast("Copiado ✅");
}

async function runScriptsOnSite() {
  const modal = $("maskaraModal");
  const progressWrap = modal.querySelector(".progress-wrap");
  const progressFill = $("progressFill");
  const progressLabel = $("progressLabel");

  modal.hidden = false;
  progressWrap.hidden = true;
  if (!state.selected) {
    toast("Selecione um plano");
    return;
  }

  $("btnCancel").onclick = () => modal.hidden = true;

  $("btnConfirm").onclick = async () => {
    const scripts = Object.values(state.scripts);
    modal.querySelector(".modal-actions").hidden = true;
    progressWrap.hidden = false;

    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab?.id) {
      toast("Abra o portal");
      modal.hidden = true;
      return;
    }

    for (let i = 0; i < scripts.length; i++) {
      try {
        progressLabel.textContent = `Rodando script ${i+1}/${scripts.length}`;
        progressFill.style.width = `${((i+1)/scripts.length)*100}%`;

        await chrome.scripting.executeScript({
          target:{ tabId: tab.id },
          func: new Function(scripts[i])
        });

      } catch (err) {
        console.error("Falha no script", i, err);
        toast(`Erro no script ${i+1}`);
        modal.hidden = true;
        return; // 🛑 rollback automático
      }
    }

    modal.hidden = true;
    toast("🎭 Scripts executados com sucesso!");
  };
}

// --------------------
// Eventos
// --------------------
function wire() {
  $("q").addEventListener("input", (e) => renderList(e.target.value));
  $("btnBack").addEventListener("click", showList);

  $("btnOpen").addEventListener("click", openPortal);
  $("btnCopy").addEventListener("click", copyScript);

  // 🎭⚡ AQUI é o único lugar que chama o modal
  $("btnRun").addEventListener("click", runScriptsOnSite);

  $("scriptGroup").addEventListener("change", (e) => {
    const key = e.target.value;
    $("scriptBox").value = state.scripts?.[key] || "";
  });
}


// --------------------
// Init
// --------------------
(async function main() {
  wire();
  showList();
  try {
    await loadPlans();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar");
  }
})();
