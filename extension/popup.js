const serverUrlInput = document.getElementById("serverUrl");
const roomInput = document.getElementById("room");
const nameInput = document.getElementById("name");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const statusEl = document.getElementById("status");
const peersEl = document.getElementById("peers");

function setStatus(connected, error) {
  if (connected) {
    statusEl.textContent = "Conectado";
    statusEl.className = "status online";
  } else {
    statusEl.textContent = error ? `Desconectado (${error})` : "Desconectado";
    statusEl.className = "status offline";
  }
}

chrome.storage.local.get("mubiSyncLast", (data) => {
  if (data.mubiSyncLast) {
    serverUrlInput.value = data.mubiSyncLast.serverUrl || "";
    roomInput.value = data.mubiSyncLast.room || "";
    nameInput.value = data.mubiSyncLast.name || "";
  }
  chrome.runtime.sendMessage({ type: "getStatus" }, (res) => {
    if (res) setStatus(res.connected, null);
  });
});

connectBtn.addEventListener("click", () => {
  const serverUrl = serverUrlInput.value.trim();
  const room = roomInput.value.trim();
  const name = nameInput.value.trim();
  if (!serverUrl || !room) {
    setStatus(false, "faltan datos");
    return;
  }
  chrome.runtime.sendMessage({ type: "connect", serverUrl, room, name });
});

disconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "disconnect" });
  setStatus(false, null);
  peersEl.textContent = "";
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "status") {
    setStatus(msg.connected, msg.error);
  } else if (msg.type === "peers") {
    peersEl.textContent = msg.count > 1 ? `${msg.count} personas en la sala` : "Esperando a la otra persona…";
  }
});
