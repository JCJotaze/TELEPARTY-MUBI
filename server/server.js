// server.js — servidor de señalización para Mubi Sync.
// No transmite video ni audio: solo reenvía comandos (play/pausa/tiempo)
// entre los navegadores que están en la misma "sala".

const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });
const rooms = new Map(); // room -> Set<ws>

function broadcastPeers(room) {
  const peers = rooms.get(room);
  if (!peers) return;
  const count = peers.size;
  for (const client of peers) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "peers", count }));
    }
  }
}

wss.on("connection", (ws) => {
  ws.room = null;

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (data.type === "join") {
      ws.room = data.room;
      if (!rooms.has(ws.room)) rooms.set(ws.room, new Set());
      rooms.get(ws.room).add(ws);
      broadcastPeers(ws.room);
    } else if (data.type === "event" && ws.room) {
      const peers = rooms.get(ws.room);
      if (!peers) return;
      for (const client of peers) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({ type: "event", action: data.action, time: data.time, ts: data.ts })
          );
        }
      }
    }
  });

  ws.on("close", () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      if (rooms.get(ws.room).size === 0) {
        rooms.delete(ws.room);
      } else {
        broadcastPeers(ws.room);
      }
    }
  });
});

console.log(`Servidor Mubi Sync escuchando en el puerto ${PORT}`);
