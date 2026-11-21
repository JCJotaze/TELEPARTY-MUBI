// background.js — mantiene la conexión con el servidor de sincronización
// y reenvía eventos entre el servidor y la pestaña de Mubi.

let ws = null;
let currentRoom = null;
let mubiTabId = null;
let reconnectTimer = null;

function saveLastConnection(serverUrl, room, name) {
  chrome.storage.local.set({ mubiSyncLast: { serverUrl, room, name } });
}

function connect(serverUrl, room, name) {
  disconnect();
  currentRoom = room;

  try {
    ws = new WebSocket(serverUrl);
  } catch (e) {
    broadcastStatus(false, "URL de servidor inválida");
    return;
  }

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join", room, name }));
    broadcastStatus(true, null);
    saveLastConnection(serverUrl, room, name);
  };

  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (data.type === "event") {
      forwardToContent({ type: "remoteEvent", action: data.action, time: data.time });
    } else if (data.type === "peers") {
      chrome.runtime.sendMessage({ type: "peers", count: data.count }).catch(() => {});
    }
  };

  ws.onclose = () => {
    broadcastStatus(false, null);
  };

  ws.onerror = () => {
    broadcastStatus(false, "No se pudo conectar al servidor");
  };
}

function disconnect() {
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }
  currentRoom = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
}

function broadcastStatus(connected, error) {
  chrome.runtime.sendMessage({ type: "status", connected, room: currentRoom, error }).catch(() => {});
}

async function forwardToContent(message) {
  let tabId = mubiTabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ url: ["*://*.mubi.com/*"] });
    if (tabs.length) tabId = tabs[0].id;
  }
  if (tabId) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "connect") {
    connect(msg.serverUrl, msg.room, msg.name);
    sendResponse({ ok: true });
  } else if (msg.type === "disconnect") {
    disconnect();
    sendResponse({ ok: true });
  } else if (msg.type === "localEvent") {
    if (sender.tab) mubiTabId = sender.tab.id;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "event",
          room: currentRoom,
          action: msg.action,
          time: msg.time,
          ts: Date.now(),
        })
      );
    }
  } else if (msg.type === "getStatus") {
    sendResponse({
      connected: !!(ws && ws.readyState === WebSocket.OPEN),
      room: currentRoom,
    });
  }
  return true;
});
