const $ = (id) => document.getElementById(id);

const API_BASE = "https://healthplan-api-153673459631.southamerica-east1.run.app";

const state = {
  plans: [],
  selected: null,
  scriptCode: null
};

async function apiFetch(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Erro ao acessar API");
  return res.json();
}

function toast(msg) {
  const t = $("toast");
  if (!t) return alert(msg);
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

async function loadPlans() {
  const data = await apiFetch("/v1/plans");
  state.plans = data.plans || [];
  renderList();
}

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

async function selectPlan(plan) {
  state.selected = plan;
  state.scriptCode = null;

  $("planName").textContent = plan.name;
  $("planUrl").textContent = plan.portal_url;

  try {
    // ✅ seu backend retorna { scripts: { KEY: "..." }, default_script: "KEY" }
    const data = await apiFetch(`/v1/scripts/${plan.id}`);
    const key = data.default_script;
    const code = data.scripts?.[key] || null;

    if (!code) {
      toast("Nenhum script disponível");
      return;
    }

    state.scriptCode = code;
    showDetails();
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar script");
  }
}

function openPortal() {
  if (!state.selected) return;
  chrome.tabs.create({ url: state.selected.portal_url });
}

/**
 * ✅ INJETA O BOTÃO FLUTUANTE NA PÁGINA
 * - cria #hpRunnerFloatingBtn
 * - salva o code em window.__HP_RUNNER_CODE__
 * - ao clicar no botão (NA PÁGINA), executa o script
 */
async function injectFloatingButton(plan, code) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Nenhuma aba ativa");

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (planName, scriptCode) => {
      try {
        // remove antigo se existir
        const old = document.getElementById("hpRunnerFloatingBtn");
        if (old) old.remove();

        // guarda o código no window (pra clicar depois)
        window.__HP_RUNNER_CODE__ = String(scriptCode || "");

        const btn = document.createElement("button");
        btn.id = "hpRunnerFloatingBtn";
        btn.type = "button";
        btn.textContent = `⚡ Inserir Procedimentos (${planName})`;

        btn.style.cssText = `
          position: fixed;
          top: 110px;
          right: 18px;
          z-index: 2147483647;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(14,165,233,.95);
          color: #fff;
          font-weight: 800;
          letter-spacing: .2px;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(0,0,0,.35);
          backdrop-filter: blur(8px);
          user-select: none;
        `;

        btn.onmouseenter = () => (btn.style.transform = "translateY(-1px)");
        btn.onmouseleave = () => (btn.style.transform = "translateY(0px)");

        const hint = document.createElement("div");
        hint.id = "hpRunnerFloatingHint";
        hint.textContent = "Dica: abra a seção Procedimentos/Serviços antes de clicar.";
        hint.style.cssText = `
          position: fixed;
          top: 160px;
          right: 18px;
          z-index: 2147483647;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(0,0,0,.65);
          color: rgba(255,255,255,.9);
          font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;
          box-shadow: 0 10px 30px rgba(0,0,0,.25);
        `;

        btn.onclick = async () => {
          try {
            if (!window.__HP_RUNNER_CODE__?.trim()) {
              console.warn("HP Runner: script vazio");
              alert("Nenhum script carregado.");
              return;
            }
            // executa como console
            new Function(window.__HP_RUNNER_CODE__)();
          } catch (e) {
            console.error("HP Runner: erro ao executar", e);
            alert("Erro ao executar automação. Veja o Console.");
          }
        };

        document.body.appendChild(btn);
        document.body.appendChild(hint);

        console.log("✅ HP Runner: botão flutuante injetado.");
      } catch (e) {
        console.error("HP Runner: falha ao injetar botão", e);
        alert("Falha ao injetar botão. Veja o Console.");
      }
    },
    args: [plan?.name || plan?.id || "Plano", code]
  });
}

function wire() {
  $("q").oninput = e => renderList(e.target.value);
  $("btnBack").onclick = showList;
  $("btnOpen").onclick = openPortal;

  // ✅ NOVO BOTÃO NO POPUP (injeta o botão flutuante na página)
  const injectBtn = $("btnInject");
  if (injectBtn) {
    injectBtn.onclick = async () => {
      if (!state.selected || !state.scriptCode) {
        toast("Selecione um plano (e carregue o script) primeiro.");
        return;
      }
      try {
        await injectFloatingButton(state.selected, state.scriptCode);
        toast("Botão injetado na página ✅");
      } catch (e) {
        console.error(e);
        toast("Falha ao injetar botão");
      }
    };
  }
}

(async function init() {
  wire();
  showList();
  await loadPlans();
})();
