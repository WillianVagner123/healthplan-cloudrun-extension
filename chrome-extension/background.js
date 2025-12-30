// background.js — Service Worker do Maskara (MV3)
// ✅ Logs + Google OAuth (launchWebAuthFlow)
// ✅ RUN_PLAN vindo do popup (sem mudar popup.js)
// ✅ Auto reinjeção pós refresh/postback + SPA (webNavigation: committed/completed/history/hash)
// ✅ storage.session (rápido) + storage.local (persistente) p/ sobreviver fechar navegador
// ✅ Anti-duplo inject (gap + debounce por URL) pra evitar runner 2x
// ✅ TOP FRAME ONLY (frameId=0) + allFrames:false

const MAX_LINES = 250;
const logsByTab = new Map();
const authState = { token: null, email: null };

// -------------------------------------------------------
// LOGS
// -------------------------------------------------------
function pushLog(tabId, entry) {
  const arr = logsByTab.get(tabId) || [];
  arr.push(entry);
  if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES);
  logsByTab.set(tabId, arr);
}

// -------------------------------------------------------
// GOOGLE OAUTH HELPERS
// -------------------------------------------------------
function parseHashParams(url) {
  const hash = (url.split("#")[1] || "").trim();
  const params = new URLSearchParams(hash);
  return Object.fromEntries(params.entries());
}

async function fetchUserEmail(accessToken) {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error("Falha ao buscar userinfo");
  const data = await r.json();
  return data?.email || null;
}

function startGoogleAuthInteractive() {
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL("oauth2");
    const clientId = chrome.runtime.getManifest().oauth2.client_id;
    const scopes = (chrome.runtime.getManifest().oauth2.scopes || []).join(" ");

    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&prompt=select_account`;

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!redirectUrl) return reject(new Error("Login cancelado ou sem redirect"));

        const params = parseHashParams(redirectUrl);
        const token = params.access_token;
        if (!token) return reject(new Error("access_token não retornou"));

        resolve(token);
      }
    );
  });
}

async function doGoogleLogin() {
  const token = await startGoogleAuthInteractive();
  const email = await fetchUserEmail(token);

  authState.token = token;
  authState.email = email;

  await chrome.storage.local.set({
    google_access_token: token,
    google_email: email,
    google_logged_in_at: Date.now(),
  });

  return { token, email };
}

async function loadAuthFromStorage() {
  const data = await chrome.storage.local.get(["google_access_token", "google_email"]);
  authState.token = data.google_access_token || null;
  authState.email = data.google_email || null;
}

chrome.runtime.onInstalled.addListener(() => loadAuthFromStorage().catch(() => {}));
chrome.runtime.onStartup.addListener(() => loadAuthFromStorage().catch(() => {}));

// -------------------------------------------------------
// CONTEXTO DO ÚLTIMO RUN POR ABA (session + local)
// -------------------------------------------------------
const KEY_PREFIX = "hp:lastRun:";          // session
const KEY_PREFIX_LOCAL = "hp:lastRunLocal:"; // local (persistente)
const KEY_DEBOUNCE_PREFIX = "hp:lastInject:";

async function setLastRun(tabId, ctx) {
  // session: rápido / SW-safe
  await chrome.storage.session.set({ [KEY_PREFIX + tabId]: ctx });
  // local: persiste se fechar o navegador
  await chrome.storage.local.set({ [KEY_PREFIX_LOCAL + tabId]: ctx });
}

async function getLastRun(tabId) {
  // tenta session primeiro
  const s = await chrome.storage.session.get(KEY_PREFIX + tabId);
  if (s && s[KEY_PREFIX + tabId]) return s[KEY_PREFIX + tabId];

  // fallback: local
  const l = await chrome.storage.local.get(KEY_PREFIX_LOCAL + tabId);
  return l[KEY_PREFIX_LOCAL + tabId] || null;
}

async function clearLastRun(tabId) {
  await chrome.storage.session.remove(KEY_PREFIX + tabId);
  await chrome.storage.local.remove(KEY_PREFIX_LOCAL + tabId);
}

function urlMatches(url, mustUrlIncludes = []) {
  if (!url) return false;
  if (!Array.isArray(mustUrlIncludes) || mustUrlIncludes.length === 0) return true;
  return mustUrlIncludes.some((s) => url.includes(s));
}

// -------------------------------------------------------
// ANTI DUPLO-INJECT (marca no TOP frame)
// -------------------------------------------------------
async function shouldInjectNow(tabId, minGapMs = 800) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false }, // TOP
      world: "MAIN",
      func: (gap) => {
        const now = Date.now();
        const last = window.__HP_LAST_INJECT_AT__ || 0;
        if (now - last < gap) return false;
        window.__HP_LAST_INJECT_AT__ = now;
        return true;
      },
      args: [minGapMs],
    });
    return !!res?.[0]?.result;
  } catch {
    return true;
  }
}

// -------------------------------------------------------
// BASE (helpers) — TOP frame only
// -------------------------------------------------------
function baseFunc() {
  if (window.__HP_BASE__) return;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function fireKey(el, type, key) {
    if (!el) return;
    el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key }));
  }

  function waitForElement(selector, { timeoutMs = 60000, root = document } = {}) {
    return new Promise((resolve) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);

      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      obs.observe(root.documentElement || root, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  async function ghostType(el, text, charDelay = 40) {
    el.focus();
    el.value = "";
    fire(el, "input");
    fire(el, "change");

    for (const ch of String(text)) {
      el.value += ch;
      fire(el, "input");
      await delay(charDelay);
    }

    fire(el, "change");
  }

  window.__HP_BASE__ = {
    delay,
    isVisible,
    fire,
    fireKey,
    waitForElement,
    ghostType,
    logScope: (scope, ...a) => console.log(scope + ":", ...a),
    warnScope: (scope, ...a) => console.warn(scope + ":", ...a),
    errScope: (scope, ...a) => console.error(scope + ":", ...a),
  };
}

// -------------------------------------------------------
// INJECTOR (BASE + PAYLOAD + RUNNER) — TOP FRAME ONLY
// -------------------------------------------------------
async function injectPlanRunner({ tabId, payloadObj, runnerJsString }) {
  if (!tabId) throw new Error("injectPlanRunner: tabId ausente");
  if (!runnerJsString || typeof runnerJsString !== "string") throw new Error("injectPlanRunner: runner vazio");

  // gap (TOP frame)
  const ok = await shouldInjectNow(tabId, 800);
  if (!ok) return;

  // 1) BASE
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false }, // TOP
    world: "MAIN",
    func: baseFunc,
  });

  // 2) PAYLOAD
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false }, // TOP
    world: "MAIN",
    func: (payload) => { window.__HP_PAYLOAD__ = payload; },
    args: [payloadObj || {}],
  });

  // 3) RUNNER
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false }, // TOP
    world: "MAIN",
    func: (code) => { (0, eval)(code); },
    args: [runnerJsString],
  });
}

// -------------------------------------------------------
// DEBOUNCE POR ABA+URL
// -------------------------------------------------------
async function debounceByUrl(tabId, url, source, minMs = 1200) {
  const key = KEY_DEBOUNCE_PREFIX + tabId;
  const now = Date.now();

  const obj = await chrome.storage.session.get(key);
  const last = obj[key] || null;

  if (last && last.url === url && (now - (last.ts || 0)) < minMs) return false;

  await chrome.storage.session.set({ [key]: { url, ts: now, source } });
  return true;
}

// -------------------------------------------------------
// REINJECTOR
// -------------------------------------------------------
async function reinjectIfNeeded(details, source) {
  const tabId = details?.tabId;
  if (!tabId) return;

  // só frame principal
  if (typeof details.frameId === "number" && details.frameId !== 0) return;

  const ctx = await getLastRun(tabId);
  if (!ctx) return;

  const url = details.url || "";
  if (!url.startsWith("http")) return;
  if (!urlMatches(url, ctx.mustUrlIncludes || [])) return;

  const ok = await debounceByUrl(tabId, url, source, 1200);
  if (!ok) return;

  await injectPlanRunner({
    tabId,
    payloadObj: ctx.payloadObj,
    runnerJsString: ctx.runnerJsString,
  });
}

// -------------------------------------------------------
// AUTO-REINJECT: webNavigation (inclui SPA)
// -------------------------------------------------------
const NAV_FILTER = { url: [{ schemes: ["http", "https"] }] };

chrome.webNavigation.onCommitted.addListener((d) => {
  reinjectIfNeeded(d, "committed").catch((e) => console.warn("onCommitted reinject failed:", e));
}, NAV_FILTER);

chrome.webNavigation.onCompleted.addListener((d) => {
  reinjectIfNeeded(d, "completed").catch((e) => console.warn("onCompleted reinject failed:", e));
}, NAV_FILTER);

chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  reinjectIfNeeded(d, "history").catch((e) => console.warn("onHistoryStateUpdated reinject failed:", e));
}, NAV_FILTER);

chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => {
  reinjectIfNeeded(d, "hash").catch((e) => console.warn("onReferenceFragmentUpdated reinject failed:", e));
}, NAV_FILTER);

chrome.tabs.onRemoved.addListener((tabId) => {
  clearLastRun(tabId).catch(() => {});
  chrome.storage.session.remove(KEY_DEBOUNCE_PREFIX + tabId).catch(() => {});
});

// -------------------------------------------------------
// MESSAGES
// -------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // ===== LOGS =====
    if (msg?.type === "MASKARA_LOG" && sender?.tab?.id != null) {
      pushLog(sender.tab.id, {
        ts: msg.ts || Date.now(),
        level: msg.level || "log",
        args: Array.isArray(msg.args) ? msg.args : [String(msg.args ?? "")],
      });
      return sendResponse({ ok: true });
    }

    if (msg?.type === "GET_LOGS") {
      const arr = logsByTab.get(msg.tabId) || [];
      return sendResponse({ ok: true, logs: arr });
    }

    if (msg?.type === "CLEAR_LOGS") {
      logsByTab.set(msg.tabId, []);
      return sendResponse({ ok: true });
    }

    // ===== GOOGLE AUTH =====
    if (msg?.type === "GOOGLE_STATUS") {
      if (!authState.token) await loadAuthFromStorage();
      return sendResponse({ ok: true, authenticated: !!authState.token, email: authState.email });
    }

    if (msg?.type === "GOOGLE_LOGIN") {
      try {
        const { token, email } = await doGoogleLogin();
        return sendResponse({ ok: true, token, email });
      } catch (e) {
        console.error("GOOGLE_LOGIN erro:", e);
        return sendResponse({ ok: false, error: String(e?.message || e) });
      }
    }

    if (msg?.type === "GOOGLE_LOGOUT") {
      authState.token = null;
      authState.email = null;
      await chrome.storage.local.remove(["google_access_token", "google_email", "google_logged_in_at"]);
      return sendResponse({ ok: true });
    }

    // ===== RUN_PLAN =====
    if (msg?.type === "RUN_PLAN") {
      const tabId = msg.tabId ?? sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: "RUN_PLAN sem tabId (e sem sender.tab.id)" });

      const payloadObj = msg.payloadObj ?? msg.payload ?? {};
      const runnerJsString = msg.runnerJsString ?? msg.runner ?? "";
      let mustUrlIncludes = msg.mustUrlIncludes ?? payloadObj.mustUrlIncludes ?? [];

      if (!Array.isArray(mustUrlIncludes) || mustUrlIncludes.length === 0) {
        try {
          const tab = await chrome.tabs.get(tabId);
          const url = tab?.url || "";
          if (url) mustUrlIncludes = [new URL(url).host];
        } catch {}
      }

      await setLastRun(tabId, { payloadObj, runnerJsString, mustUrlIncludes });

      // injeta imediatamente
      await injectPlanRunner({ tabId, payloadObj, runnerJsString });

      return sendResponse({ ok: true });
    }

    return sendResponse({ ok: false, error: "Mensagem não tratada" });
  })().catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true; // async
});
