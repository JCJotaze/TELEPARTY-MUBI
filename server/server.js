// server.js — servidor de sincronización para Watch Party for MUBI.
// No transmite video ni audio: solo reenvía comandos (play/pausa/tiempo)
// entre los navegadores que están en la misma sala. No guarda nada en disco.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 8080;
// IDs de extensión permitidos, separados por coma (ej: "abcdef...,ghijk...").
// Si está vacío se acepta cualquier extensión de Chrome, pero nunca páginas web.
const ALLOWED_EXTENSION_IDS = (process.env.ALLOWED_EXTENSION_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_ROOM_SIZE = 10;
const MAX_PAYLOAD = 4 * 1024; // bytes
const RATE_LIMIT = { tokens: 30, refillPerSec: 10 }; // ráfaga de 30, 10 msg/s sostenido
const LIVENESS_INTERVAL = 30_000;

const ROOM_RE = /^[a-z0-9]{3}-[a-z0-9]{3}$/;
const ACTIONS = new Set(["play", "pause", "seek", "sync"]);
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sin 0/o, 1/l/i

const rooms = new Map(); // code -> { members: Map<id, ws>, hostId }

const privacyHtml = fs.readFileSync(path.join(__dirname, "privacy.html"), "utf8");

// ---------- HTTP (salud + política de privacidad) ----------

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/" || url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`ok · ${rooms.size} salas activas`);
  } else if (url === "/privacy") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(privacyHtml);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
  }
});

// ---------- WebSocket ----------

function originAllowed(origin) {
  if (!origin) return false;
  const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  if (!m) return false;
  return ALLOWED_EXTENSION_IDS.length === 0 || ALLOWED_EXTENSION_IDS.includes(m[1]);
}

const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_PAYLOAD,
  verifyClient: ({ origin }) => originAllowed(origin),
});

function newRoomCode() {
  for (;;) {
    let s = "";
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    const code = `${s.slice(0, 3)}-${s.slice(3)}`;
    if (!rooms.has(code)) return code;
  }
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function memberInfo(ws) {
  return { id: ws.id, name: ws.name, avatar: ws.avatar };
}

function broadcast(room, obj, except) {
  for (const client of room.members.values()) {
    if (client !== except) send(client, obj);
  }
}

function broadcastMembers(code) {
  const room = rooms.get(code);
  if (!room) return;
  broadcast(room, {
    type: "members",
    hostId: room.hostId,
    members: [...room.members.values()].map(memberInfo),
  });
}

function leaveRoom(ws) {
  const code = ws.room;
  if (!code) return;
  ws.room = null;
  const room = rooms.get(code);
  if (!room) return;
  room.members.delete(ws.id);
  if (room.members.size === 0) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === ws.id) room.hostId = room.members.keys().next().value;
  broadcast(room, { type: "left", member: memberInfo(ws) });
  broadcastMembers(code);
}

function joinRoom(ws, code) {
  leaveRoom(ws);
  let room = rooms.get(code);
  if (!room) {
    room = { members: new Map(), hostId: ws.id };
    rooms.set(code, room);
  }
  if (room.members.size >= MAX_ROOM_SIZE) {
    send(ws, { type: "error", code: "room_full" });
    return;
  }
  room.members.set(ws.id, ws);
  ws.room = code;
  send(ws, { type: "joined", room: code, you: ws.id });
  broadcast(room, { type: "joinedPeer", member: memberInfo(ws) }, ws);
  broadcastMembers(code);
  // Pide al anfitrión el estado actual para que el recién llegado se ponga al día.
  const host = room.members.get(room.hostId);
  if (host && host !== ws) send(host, { type: "stateRequest" });
}

function takeToken(ws) {
  const now = Date.now();
  const b = ws.bucket;
  b.tokens = Math.min(RATE_LIMIT.tokens, b.tokens + ((now - b.last) / 1000) * RATE_LIMIT.refillPerSec);
  b.last = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

wss.on("connection", (ws) => {
  ws.id = crypto.randomUUID();
  ws.room = null;
  ws.name = "Invitado";
  ws.avatar = "🙂";
  ws.isAlive = true;
  ws.bucket = { tokens: RATE_LIMIT.tokens, last: Date.now() };
  ws.strikes = 0;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    if (!takeToken(ws)) {
      if (++ws.strikes > 50) ws.close(1008, "Demasiados mensajes");
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    switch (data.type) {
      case "hello": {
        ws.name = cleanText(data.name, 24) || "Invitado";
        ws.avatar = cleanText(data.avatar, 8) || "🙂";
        if (ws.room) broadcastMembers(ws.room);
        break;
      }
      case "create": {
        joinRoom(ws, newRoomCode());
        break;
      }
      case "join": {
        const code = cleanText(data.room, 16).toLowerCase();
        if (!ROOM_RE.test(code)) {
          send(ws, { type: "error", code: "bad_room" });
          return;
        }
        joinRoom(ws, code);
        break;
      }
      case "leave": {
        leaveRoom(ws);
        send(ws, { type: "leftRoom" });
        break;
      }
      case "ping": {
        send(ws, { type: "pong", t: typeof data.t === "number" ? data.t : 0 });
        break;
      }
      case "event": {
        const room = ws.room && rooms.get(ws.room);
        if (!room) return;
        const { action, time, paused, lat } = data;
        if (!ACTIONS.has(action)) return;
        if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > 86_400) return;
        // Las correcciones periódicas solo las manda el anfitrión, para que no se peleen.
        if (action === "sync" && room.hostId !== ws.id) return;
        broadcast(
          room,
          {
            type: "event",
            action,
            time,
            paused: !!paused,
            lat: typeof lat === "number" && lat >= 0 && lat < 5 ? lat : 0,
            silent: action === "sync",
            from: memberInfo(ws),
          },
          ws
        );
        break;
      }
    }
  });

  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => {});
});

// Detecta conexiones muertas (wifi caído, PC suspendida) y las cierra.
const liveness = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, LIVENESS_INTERVAL);
wss.on("close", () => clearInterval(liveness));

server.listen(PORT, () => {
  console.log(`Servidor Watch Party for MUBI escuchando en el puerto ${PORT}`);
  if (ALLOWED_EXTENSION_IDS.length === 0) {
    console.log("Aviso: ALLOWED_EXTENSION_IDS vacío, se acepta cualquier extensión de Chrome.");
  }
});

module.exports = { server, wss };
