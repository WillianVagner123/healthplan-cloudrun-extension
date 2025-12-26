const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scripts: {},          // { key: "code string" }
  selectedScriptKey: null,
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

function spinner(on, msg = "Carregando…") {
  const s = $("spinner");
  if (!s) return;
  s.textContent = msg;
  s.hidden = !on;
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
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Erro API ${res.status}: ${txt || "sem corpo"}`);
  }
  return res.json();
}

async function loadPlans() {
  spinner(true, "Carregando planos…");
  try {
    const data = await apiFetch("/v1/plans");
    state.plans = data.plans || [];
    renderList();
  } finally {
    spinner(false);
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
        <div class="name">${escapeHtml(p.name || p.id)}</div>
        <div class="meta">${escapeHtml(p.portal_url || "")}</div>
      </div>
      <span class="badge">→</span>
    `;
    el.onclick = () => selectPlan(p);
    list.appendChild(el);
  }
}

function renderScriptsSelect() {
  const sel = $("scriptSelect");
  sel.innerHTML = "";

  const keys = Object.keys(state.scripts || {});
  if (!keys.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem scripts";
    sel.appendChild(opt);
    sel.disabled = true;
    state.selectedScriptKey = null;
    state.scriptCode = null;
    return;
  }

  sel.disabled = false;

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  }

  // seleciona default
  if (!state.selectedScriptKey || !state.scripts[state.selectedScriptKey]) {
    state.selectedScriptKey = keys[0];
  }
  sel.value = state.selectedScriptKey;

  state.scriptCode = state.scripts[state.selectedScriptKey] || null;
}

/* ================= Selection ================= */

async function selectPlan(plan) {
  state.selected = plan;
  state.scripts = {};
  state.selectedScriptKey = null;
  state.scriptCode = null;

  $("planName").textContent = plan.name || plan.id || "Plano";
  $("planUrl").textContent = plan.portal_url || "";

  spinner(true, "Carregando scripts…");
  try {
    const data = await apiFetch(`/v1/scripts/${encodeURIComponent(plan.id)}`);

    // formato esperado:
    // { planId, name, version, scripts: { AMBOS: "...", ... }, default_script: "AMBOS" }
    const scripts = data.scripts || {};
    const defKey = data.default_script || Object.keys(scripts)[0] || null;

    state.scripts = scripts;
    state.selectedScriptKey = defKey;
    renderScriptsSelect();

    if (!state.scriptCode) {
      toast("Nenhum script disponível");
      return;
    }

    showDetails();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar scripts");
  } finally {
    spinner(false);
  }
}

/* ================= Actions ================= */

function openPortal() {
  if (!state.selected?.portal_url) return toast("Sem portal");
  chrome.tabs.create({ url: state.selected.portal_url });
}

/* ================= Script Execution ================= */
/**
 * Execução “igual console”: injeta <script> no MAIN world.
 * E usa allFrames=true para achar o frame certo.
 *
 * IMPORTANTÍSSIMO: NÃO usa sendMessage => nunca dá “Receiving end does not exist”.
 */
async function executeScript({ silent = false } = {}) {
  if (!state.scriptCode) return toast("Nenhum script carregado");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return toast("Nenhuma aba ativa");

  if (!silent) {
    const ok = confirm("⚡ Executar automação diretamente no site aberto?");
    if (!ok) return;
  }

  spinner(true, "Rodando no site…");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "MAIN",
      func: (code) => {
        try {
          // Só roda no frame onde o formulário existe
          const campo =
            document.getElementById("item_medico_1") ||
            document.querySelector("input[name='item_medico_1']");

          if (!campo) {
            return { ran: false, href: location.href };
          }

          // injeta como se fosse console
          const s = document.createElement("script");
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();

          return { ran: true, href: location.href };
        } catch (e) {
          return { ran: false, error: String(e), href: location.href };
        }
      },
      args: [state.scriptCode]
    });

    const ranSomewhere = (results || []).some((r) => r?.result?.ran);
    const anyError = (results || []).find((r) => r?.result?.error);

    if (anyError) {
      console.error("Erro no frame:", anyError.result);
    }

    toast(ranSomewhere ? "✅ Rodou no frame certo" : "❌ Abra Procedimentos/Serviços e tente");
  } catch (e) {
    console.error("executeScript falhou:", e);
    toast("Falha ao executar (permissões/host)");
  } finally {
    spinner(false);
  }
}

/* ================= Wire ================= */

function wire() {
  $("q").oninput = (e) => renderList(e.target.value);

  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;
  $("btnRun").onclick = () => executeScript({ silent: false });

  $("btnRefresh").onclick = async () => {
    showList();
    await loadPlans();
    toast("Atualizado ✅");
  };

  $("scriptSelect").onchange = (e) => {
    const key = e.target.value;
    state.selectedScriptKey = key;
    state.scriptCode = state.scripts?.[key] || null;
    toast(state.scriptCode ? `Script: ${key}` : "Script vazio");
  };
}

/* ================= Utils ================= */

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= Init ================= */

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
