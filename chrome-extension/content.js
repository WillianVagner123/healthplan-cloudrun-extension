// Recebe logs do código injetado (world MAIN) via window.postMessage e encaminha para o SW.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== "MASKARA_LOG") return;

  chrome.runtime.sendMessage({
    type: "MASKARA_LOG",
    level: data.level || "log",
    args: data.args || [],
    ts: data.ts || Date.now(),
  });
});
