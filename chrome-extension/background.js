// background.js — Service Worker do Maskara
// Logs + Google OAuth (launchWebAuthFlow)

const MAX_LINES = 250;
const logsByTab = new Map();

const authState = {
  token: null,
  email: null,
};

function pushLog(tabId, entry) {
  const arr = logsByTab.get(tabId) || [];
  arr.push(entry);
  if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES);
  logsByTab.set(tabId, arr);
}

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
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error("Login cancelado ou sem redirect"));
          return;
        }

        const params = parseHashParams(redirectUrl);
        const token = params.access_token;
        if (!token) {
          reject(new Error("access_token não retornou"));
          return;
        }

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
  const data = await chrome.storage.local.get([
    "google_access_token",
    "google_email",
  ]);
  authState.token = data.google_access_token || null;
  authState.email = data.google_email || null;
}

chrome.runtime.onInstalled.addListener(() => {
  loadAuthFromStorage().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  loadAuthFromStorage().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // ===== LOGS =====
    if (msg?.type === "MASKARA_LOG" && sender?.tab?.id != null) {
      pushLog(sender.tab.id, {
        ts: msg.ts || Date.now(),
        level: msg.level || "log",
        args: Array.isArray(msg.args) ? msg.args : [String(msg.args ?? "")],
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "GET_LOGS") {
      const arr = logsByTab.get(msg.tabId) || [];
      sendResponse({ ok: true, logs: arr });
      return;
    }

    if (msg?.type === "CLEAR_LOGS") {
      logsByTab.set(msg.tabId, []);
      sendResponse({ ok: true });
      return;
    }

    // ===== GOOGLE AUTH =====
    if (msg?.type === "GOOGLE_STATUS") {
      if (!authState.token) await loadAuthFromStorage();
      sendResponse({
        ok: true,
        authenticated: !!authState.token,
        email: authState.email,
      });
      return;
    }

    if (msg?.type === "GOOGLE_LOGIN") {
      try {
        const { token, email } = await doGoogleLogin();
        sendResponse({ ok: true, token, email });
      } catch (e) {
        console.error("GOOGLE_LOGIN erro:", e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }

    if (msg?.type === "GOOGLE_LOGOUT") {
      authState.token = null;
      authState.email = null;
      await chrome.storage.local.remove([
        "google_access_token",
        "google_email",
        "google_logged_in_at",
      ]);
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Mensagem não tratada" });
  })();

  return true; // mantém canal aberto
});
