const $ = (id) => document.getElementById(id);

const els = {
  planSelect: $("planSelect"),
  scriptSelect: $("scriptSelect"),
  codeBox: $("codeBox"),
  btnCopy: $("btnCopy"),
  btnRun: $("btnRun"),
  btnReload: $("btnReload"),
  pillUrl: $("pillUrl"),
  pillVersion: $("pillVersion"),
  logBox: $("logBox"),
  btnClearLogs: $("btnClearLogs"),
  btnSettings: $("btnSettings"),
  settingsCard: $("settingsCard"),
  btnCloseSettings: $("btnCloseSettings"),
  apiBase: $("apiBase"),
  clientKey: $("clientKey"),
  btnSaveSettings: $("btnSaveSettings"),
  btnTestApi: $("btnTestApi"),
  settingsHint: $("settingsHint"),
};

const state = {
  tabId: null,
  plans: [],
  scripts: {}, // key -> code
  apiBase: "",
  clientKey: "",
  selectedPlanId: "",
  selectedScriptKey: "",
  logs: [],
};

function nowStr(ts = Date.now()) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function appendLog(level, args, ts = Date.now()) {
  const line = `[${nowStr(ts)}] ${String(level).toUpperCase()}: ${args.join(" ")}`;
  state.logs.push({ ts, level, args });
  if (state.logs.length > 250) state.logs.splice(0, state.logs.length - 250);

  const text = state.logs.map(l => `[${nowStr(l.ts)}] ${String(l.level).toUpperCase()}: ${l.args.join(" ")}`).join("\n");
  els.logBox.textContent = text;
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

function setHint(msg, kind = "ok") {
  els.settingsHint.textContent = msg || "";
  els.settingsHint.style.color = kind === "error" ? "var(--danger)" : "var(--muted)";
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id ?? null;
}

async function loadSettings() {
  const data = await chrome.storage.sync.get({ apiBase: "", clientKey: "" });
  state.apiBase = data.apiBase || "";
  state.clientKey = data.clientKey || "";

  els.apiBase.value = state.apiBase;
  els.clientKey.value = state.clientKey;
}

async function saveSettings() {
  state.apiBase = (els.apiBase.value || "").trim().replace(/\/+$/, "");
  state.clientKey = (els.clientKey.value || "").trim();
  await chrome.storage.sync.set({ apiBase: state.apiBase, clientKey: state.clientKey });
}

async function apiFetch(path) {
  if (!state.apiBase) throw new Error("API Base não configurada (⚙️).");
  const url = `${state.apiBase}${path}`;
  const headers = {};
  if (state.clientKey) headers["X-Client-Key"] = state.clientKey;

  const res = await fetch(url, { headers });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { /* ignore */ }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function fillPlanSelect(plans) {
  els.planSelect.innerHTML = "";
  for (const p of plans) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.id})`;
    els.planSelect.appendChild(opt);
  }
}

function fillScriptSelect(scriptKeys, defaultKey) {
  els.scriptSelect.innerHTML = "";
  for (const key of scriptKeys) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    els.scriptSelect.appendChild(opt);
  }
  const toSelect = defaultKey && scriptKeys.includes(defaultKey) ? defaultKey : (scriptKeys[0] || "");
  els.scriptSelect.value = toSelect;
  state.selectedScriptKey = toSelect;
}

function refreshCodeBox() {
  const key = state.selectedScriptKey;
  const code = state.scripts?.[key] || "";
  els.codeBox.value = code;
}

async function loadPlansAndSelect() {
  const data = await apiFetch("/v1/plans");
  const plans = data.plans || [];
  state.plans = plans;

  fillPlanSelect(plans);

  // mantém seleção se existir
  const desired = state.selectedPlanId || plans?.[0]?.id || "";
  state.selectedPlanId = desired;
  els.planSelect.value = desired;

  await loadScriptsForSelectedPlan();
}

async function loadScriptsForSelectedPlan() {
  const planId = els.planSelect.value;
  state.selectedPlanId = planId;

  const plan = state.plans.find(p => p.id === planId);
  els.pillUrl.textContent = `URL: ${plan?.portal_url || "—"}`;
  els.pillVersion.textContent = `v${plan?.version || "—"}`;

  const data = await apiFetch(`/v1/scripts/${encodeURIComponent(planId)}`);
  state.scripts = data.scripts || {};

  const keys = Object.keys(state.scripts);
  fillScriptSelect(keys, data.default_script);
  refreshCodeBox();
}

async function reloadLogs() {
  if (state.tabId == null) return;
  const resp = await chrome.runtime.sendMessage({ type: "GET_LOGS", tabId: state.tabId });
  state.logs = resp?.logs || [];
  const text = state.logs.map(l => `[${nowStr(l.ts)}] ${String(l.level).toUpperCase()}: ${l.args.join(" ")}`).join("\n");
  els.logBox.textContent = text;
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

async function clearLogs() {
  if (state.tabId == null) return;
  await chrome.runtime.sendMessage({ type: "CLEAR_LOGS", tabId: state.tabId });
  state.logs = [];
  els.logBox.textContent = "";
}

async function copyCode() {
  const code = els.codeBox.value || "";
  await navigator.clipboard.writeText(code);
  appendLog("log", ["📋 Código copiado."]);
}

async function runCodeInTab() {
  if (state.tabId == null) throw new Error("Aba ativa não encontrada.");
  const code = els.codeBox.value || "";
  if (!code.trim()) throw new Error("Script vazio.");

  appendLog("log", ["▶ Enviando script para a aba..."]);
  await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    world: "MAIN",
    args: [code],
    func: (codeStr) => {
      const stringify = (v) => {
        try {
          if (typeof v === "string") return v;
          return JSON.stringify(v);
        } catch (_e) {
          return String(v);
        }
      };

      const post = (level, ...args) => {
        window.postMessage(
          {
            type: "MASKARA_LOG",
            level,
            args: args.map(stringify),
            ts: Date.now(),
          },
          "*"
        );
      };

      const orig = { log: console.log, warn: console.warn, error: console.error };
      console.log = (...a) => { orig.log(...a); post("log", ...a); };
      console.warn = (...a) => { orig.warn(...a); post("warn", ...a); };
      console.error = (...a) => { orig.error(...a); post("error", ...a); };

      post("log", "✅ Wrapper de logs ativo. Executando...");
      try {
        (new Function(codeStr))();
        post("log", "✅ Execução iniciada.");
      } catch (e) {
        console.error(e);
        post("error", "❌ Erro ao executar:", e?.message || String(e));
      }

      // Mantém wrapper por um tempo para capturar logs assíncronos
      setTimeout(() => {
        console.log = orig.log;
        console.warn = orig.warn;
        console.error = orig.error;
        post("log", "ℹ️ Wrapper de logs encerrado.");
      }, 30000);
    },
  });
}

function toggleSettings(show) {
  els.settingsCard.classList.toggle("hidden", !show);
}

async function testApi() {
  try {
    await saveSettings();
    const data = await apiFetch("/health");
    setHint(`OK ✅ /health => ${JSON.stringify(data)}`, "ok");
  } catch (e) {
    setHint(`Falhou ❌ ${e.message}`, "error");
  }
}

async function init() {
  state.tabId = await getActiveTabId();
  await loadSettings();
  await reloadLogs();

  // UI events
  els.planSelect.addEventListener("change", async () => {
    try {
      await loadScriptsForSelectedPlan();
    } catch (e) {
      appendLog("error", [e.message]);
    }
  });

  els.scriptSelect.addEventListener("change", () => {
    state.selectedScriptKey = els.scriptSelect.value;
    refreshCodeBox();
  });

  els.btnReload.addEventListener("click", async () => {
    try {
      await loadPlansAndSelect();
      appendLog("log", ["⟳ Atualizado."]);
    } catch (e) {
      appendLog("error", [e.message]);
    }
  });

  els.btnCopy.addEventListener("click", () => copyCode().catch(e => appendLog("error", [e.message])));
  els.btnRun.addEventListener("click", () => runCodeInTab().catch(e => appendLog("error", [e.message])));

  els.btnClearLogs.addEventListener("click", () => clearLogs().catch(() => {}));

  els.btnSettings.addEventListener("click", () => toggleSettings(true));
  els.btnCloseSettings.addEventListener("click", () => toggleSettings(false));

  els.btnSaveSettings.addEventListener("click", async () => {
    try {
      await saveSettings();
      setHint("Salvo ✅", "ok");
    } catch (e) {
      setHint(e.message, "error");
    }
  });

  els.btnTestApi.addEventListener("click", () => testApi());

  // Live logs (enquanto popup estiver aberto)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "MASKARA_LOG") {
      const args = Array.isArray(msg.args) ? msg.args : [String(msg.args ?? "")];
      appendLog(msg.level || "log", args, msg.ts || Date.now());
    }
  });

  // Primeira carga
  try {
    await loadPlansAndSelect();
  } catch (e) {
    appendLog("error", [e.message]);
    setHint(e.message, "error");
    toggleSettings(true);
  }
}

init().catch((e) => appendLog("error", [e.message]));
