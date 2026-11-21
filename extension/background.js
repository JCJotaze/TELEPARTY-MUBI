// background.js — mantiene la conexión con el servidor de sincronización
// y reenvía eventos entre el servidor, el popup y la pestaña de MUBI.
//
// En Manifest V3 Chrome puede apagar este service worker cuando está inactivo,
// así que: (1) mandamos un ping cada 20 s para mantenerlo vivo mientras hay sala,
// y (2) guardamos la sala en chrome.storage.session para reconectar al despertar.

importScripts("config.js");

const KEEPALIVE_MS = 20_000;
const WAKING_AFTER_MS = 4_000;
const MUBI_TABS = ["*://*.mubi.com/*"];

let ws = null;
let keepaliveTimer = null;
let reconnectTimer = null;
let wakingTimer = null;
let reconnectDelay = 1000;
let latency = 0; // segundos, mitad del tiempo de ida y vuelta

const state = {
  status: "idle", // idle | connecting | waking | connected | error
  error: null,
  room: null,
  you: null,
  hostId: null,
  members: [],
};

// ---------- utilidades ----------

function publish() {
  chrome.runtime.sendMessage({ type: "state", state }).catch(() => {});
}

function setStatus(status, error = null) {
  state.status = status;
  state.error = error;
  publish();
}

async function getProfile() {
  const { profile } = await chrome.storage.sync.get("profile");
  return profile || { name: "", avatar: "🙂" };
}

async function getServerUrl() {
  const { customServerUrl } = await chrome.storage.local.get("customServerUrl");
  return customServerUrl || DEFAULT_SERVER_URL;
}

async function getSession() {
  return chrome.storage.session.get(["intent", "lastTabId"]);
}

// intent = { kind: "create" } | { kind: "join", room } | null
async function setIntent(intent) {
  await chrome.storage.session.set({ intent });
}

function sendWs(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

async function sendToMubi(message, { needResponse = false } = {}) {
  const { lastTabId } = await getSession();
  if (lastTabId != null) {
    try {
      return await chrome.tabs.sendMessage(lastTabId, message);
    } catch {
      await chrome.storage.session.remove("lastTabId");
    }
  }
  const tabs = await chrome.tabs.query({ url: MUBI_TABS });
  for (const tab of tabs) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, message);
      if (needResponse && res) return res;
    } catch {}
  }
  return null;
}

function toast(text) {
  sendToMubi({ type: "toast", text });
}

function who(member) {
  if (!member) return "Alguien";
  return `${member.avatar || ""} ${member.name || "Invitado"}`.trim();
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ---------- conexión ----------

function clearTimers() {
  clearInterval(keepaliveTimer);
  clearTimeout(reconnectTimer);
  clearTimeout(wakingTimer);
  keepaliveTimer = reconnectTimer = wakingTimer = null;
}

function closeSocket() {
  clearTimers();
  if (ws) {
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
    try {
      ws.close();
    } catch {}
    ws = null;
  }
}

async function connect() {
  closeSocket();
  const { intent } = await getSession();
  if (!intent) {
    Object.assign(state, { room: null, you: null, hostId: null, members: [] });
    setStatus("idle");
    return;
  }

  const url = await getServerUrl();
  setStatus("connecting");
  // El plan gratis de Render duerme el servidor; avisamos si tarda.
  wakingTimer = setTimeout(() => {
    if (state.status === "connecting") setStatus("waking");
  }, WAKING_AFTER_MS);

  try {
    ws = new WebSocket(url);
  } catch {
    setStatus("error", "La dirección del servidor no es válida");
    return;
  }

  ws.onopen = async () => {
    clearTimeout(wakingTimer);
    reconnectDelay = 1000;
    const profile = await getProfile();
    sendWs({ type: "hello", name: profile.name, avatar: profile.avatar });
    if (intent.kind === "create") sendWs({ type: "create" });
    else sendWs({ type: "join", room: intent.room });
    sendWs({ type: "ping", t: Date.now() });
    keepaliveTimer = setInterval(() => sendWs({ type: "ping", t: Date.now() }), KEEPALIVE_MS);
  };

  ws.onmessage = (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleServerMessage(data);
  };

  ws.onclose = () => {
    ws = null;
    clearTimers();
    scheduleReconnect();
  };

  ws.onerror = () => {}; // onclose se encarga
}

async function scheduleReconnect() {
  const { intent } = await getSession();
  if (!intent) return;
  if (state.status !== "waking") setStatus("connecting", "Reconectando…");
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

async function handleServerMessage(data) {
  switch (data.type) {
    case "joined":
      state.room = data.room;
      state.you = data.you;
      // Si se creó la sala, a partir de ahora "reconectar" = volver a unirse a ella.
      await setIntent({ kind: "join", room: data.room });
      setStatus("connected");
      break;
    case "members":
      state.members = Array.isArray(data.members) ? data.members : [];
      state.hostId = data.hostId;
      publish();
      break;
    case "joinedPeer":
      toast(`${who(data.member)} se unió a la sala`);
      break;
    case "left":
      toast(`${who(data.member)} salió de la sala`);
      break;
    case "pong":
      if (typeof data.t === "number" && data.t > 0) {
        latency = Math.min(2, (Date.now() - data.t) / 2000);
      }
      break;
    case "stateRequest": {
      const res = await sendToMubi({ type: "getPlayerState" }, { needResponse: true });
      if (res && typeof res.time === "number") {
        sendWs({ type: "event", action: "sync", time: res.time, paused: res.paused, lat: latency });
      }
      break;
    }
    case "event": {
      sendToMubi({
        type: "remoteEvent",
        action: data.action,
        time: data.time,
        paused: data.paused,
        lat: (data.lat || 0) + latency,
      });
      if (!data.silent) {
        const verb =
          data.action === "play" ? "▶️ reprodujo" : data.action === "pause" ? "⏸️ pausó" : `⏩ saltó a ${fmtTime(data.time)}`;
        toast(`${who(data.from)} ${verb}`);
      }
      break;
    }
    case "error": {
      const msg =
        data.code === "room_full"
          ? "La sala está llena (máximo 10 personas)"
          : data.code === "bad_room"
            ? "Código de sala inválido"
            : "Error del servidor";
      await setIntent(null);
      closeSocket();
      Object.assign(state, { room: null, you: null, hostId: null, members: [] });
      setStatus("error", msg);
      break;
    }
  }
}

async function startSession(intent) {
  await setIntent(intent);
  reconnectDelay = 1000;
  await connect();
}

async function leave() {
  sendWs({ type: "leave" });
  await setIntent(null);
  closeSocket();
  Object.assign(state, { room: null, you: null, hostId: null, members: [] });
  setStatus("idle");
}

// ---------- mensajes de popup y content script ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "getState":
      sendResponse(state);
      return false;
    case "create":
      startSession({ kind: "create" });
      break;
    case "join":
      startSession({ kind: "join", room: String(msg.room || "").trim().toLowerCase() });
      break;
    case "leave":
      leave();
      break;
    case "joinFromLink":
      if (state.room !== msg.room) {
        startSession({ kind: "join", room: String(msg.room || "").trim().toLowerCase() });
      }
      break;
    case "localEvent": {
      if (sender.tab) chrome.storage.session.set({ lastTabId: sender.tab.id });
      if (!state.room) break;
      // Solo el anfitrión manda correcciones periódicas.
      if (msg.action === "sync" && state.hostId !== state.you) break;
      sendWs({ type: "event", action: msg.action, time: msg.time, paused: msg.paused, lat: latency });
      break;
    }
  }
  return false;
});

// Si cambia el perfil o el servidor mientras hay sala, lo aplicamos.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.profile && changes.profile.newValue) {
    const p = changes.profile.newValue;
    sendWs({ type: "hello", name: p.name, avatar: p.avatar });
  }
  if (area === "local" && changes.customServerUrl && state.room) {
    reconnectDelay = 1000;
    connect();
  }
});

// Al despertar el service worker (o al abrir Chrome), retoma la sala si había una.
connect();
