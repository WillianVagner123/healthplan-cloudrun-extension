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

/* ================= API ================= */

async function apiFetch(path) {
  const res = await fetch(API_BASE + path, { cache: "no-store" });
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
    !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
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
    const scripts = data.scripts || {};
    const defKey = data.default_script || Object.keys(scripts)[0];
    state.scriptCode = defKey ? scripts[defKey] : null;

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

/* ================= Bridge Execution ================= */

async function executeScript({ silent = false } = {}) {
  if (!state.scriptCode) return toast("Nenhum script carregado");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return toast("Nenhuma aba ativa");

  if (!silent && !confirm("⚡ Executar automação no site aberto?")) return;

  try {
    // roda em TODOS os frames
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN",
      func: (code) => {
        // só executa no frame que contém o campo
        const hasField =
          document.getElementById("item_medico_1") ||
          document.querySelector("input[name='item_medico_1']");

        if (!hasField) return { ran: false, where: location.href };

        // executa “como console”: injeta <script>
        const s = document.createElement("script");
        s.textContent = code;
        (document.head || document.documentElement).appendChild(s);
        s.remove();

        return { ran: true, where: location.href };
      },
      args: [state.scriptCode]
    });

    const ranSomewhere = results?.some(r => r?.result?.ran);
    if (ranSomewhere) toast("Script executado ⚡ (frame certo)");
    else toast("Não achei o frame do formulário (abra Procedimentos/Serviços)");

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
