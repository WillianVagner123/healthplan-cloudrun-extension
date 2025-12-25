// Service Worker: guarda logs por aba para o popup conseguir exibir depois.
const MAX_LINES = 250;
const logsByTab = new Map(); // tabId -> [{ts, level, args[]}]

function pushLog(tabId, entry) {
  const arr = logsByTab.get(tabId) || [];
  arr.push(entry);
  if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES);
  logsByTab.set(tabId, arr);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    if (msg?.type === "MASKARA_LOG" && sender?.tab?.id != null) {
      pushLog(sender.tab.id, {
        ts: msg.ts || Date.now(),
        level: msg.level || "log",
        args: Array.isArray(msg.args) ? msg.args : [String(msg.args ?? "")],
      });
      sendResponse?.({ ok: true });
      return true;
    }

    if (msg?.type === "GET_LOGS") {
      const tabId = msg.tabId;
      const arr = logsByTab.get(tabId) || [];
      sendResponse?.({ ok: true, logs: arr });
      return true;
    }

    if (msg?.type === "CLEAR_LOGS") {
      const tabId = msg.tabId;
      logsByTab.set(tabId, []);
      sendResponse?.({ ok: true });
      return true;
    }
  } catch (e) {
    // ignore
  }
});
