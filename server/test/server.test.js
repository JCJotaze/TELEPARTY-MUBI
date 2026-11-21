// Pruebas del servidor: node --test test/
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const WebSocket = require("ws");

const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL = `ws://127.0.0.1:${PORT}`;
const EXT = "chrome-extension://" + "a".repeat(32);
let proc;

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => proc.stdout.once("data", resolve));
});
after(() => proc.kill());

function client(origin = EXT) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { origin });
    ws.inbox = [];
    ws.waiters = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      const i = ws.waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) ws.waiters.splice(i, 1)[0].resolve(msg);
      else ws.inbox.push(msg);
    });
    ws.next = (type, ms = 2000) => {
      const i = ws.inbox.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(ws.inbox.splice(i, 1)[0]);
      return new Promise((resolve, rej) => {
        const w = { type, resolve };
        ws.waiters.push(w);
        setTimeout(() => rej(new Error(`timeout esperando ${type}`)), ms);
      });
    };
    ws.j = (o) => ws.send(JSON.stringify(o));
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

test("rechaza conexiones que no vienen de una extensión", async () => {
  await assert.rejects(client("https://evil.example"));
  await assert.rejects(client(null)); // sin cabecera Origin
});

test("salud HTTP y política de privacidad", async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(r.status, 200);
  const p = await fetch(`http://127.0.0.1:${PORT}/privacy`);
  assert.match(await p.text(), /Política de privacidad/);
});

test("crear sala, unirse, sincronizar estado y reenviar eventos", async () => {
  const a = await client();
  a.j({ type: "hello", name: "Ana", avatar: "🐱" });
  a.j({ type: "create" });
  const joined = await a.next("joined");
  assert.match(joined.room, /^[a-z0-9]{3}-[a-z0-9]{3}$/);

  const b = await client();
  b.j({ type: "hello", name: "Luis<script>\u0000", avatar: "🐶" });
  b.j({ type: "join", room: joined.room.toUpperCase() });
  const jb = await b.next("joined");
  assert.equal(jb.room, joined.room);

  // A (anfitrión) recibe el aviso y la petición de estado
  const peer = await a.next("joinedPeer");
  assert.equal(peer.member.name, "Luis<script>");
  await a.next("stateRequest");
  let members;
  do members = await b.next("members");
  while (members.members.length < 2);
  assert.equal(members.hostId, joined.you);

  // Evento normal
  a.j({ type: "event", action: "play", time: 12.5, paused: false, lat: 0.05 });
  const ev = await b.next("event");
  assert.equal(ev.action, "play");
  assert.equal(ev.time, 12.5);
  assert.equal(ev.from.name, "Ana");

  // sync de alguien que no es anfitrión se descarta; acciones inválidas también
  b.j({ type: "event", action: "sync", time: 3, paused: false });
  b.j({ type: "event", action: "hack", time: 3 });
  b.j({ type: "event", action: "seek", time: "x" });
  b.j({ type: "event", action: "pause", time: 20, paused: true });
  const ev2 = await a.next("event");
  assert.equal(ev2.action, "pause");

  // El anfitrión sale -> B pasa a ser anfitrión
  a.close();
  await b.next("left");
  do members = await b.next("members");
  while (members.members.length !== 1);
  assert.equal(members.hostId, jb.you);
  b.close();
});

test("cambiar de sala saca al usuario de la anterior", async () => {
  const a = await client();
  const b = await client();
  a.j({ type: "create" });
  const r1 = (await a.next("joined")).room;
  b.j({ type: "join", room: r1 });
  await b.next("joined");
  b.j({ type: "create" });
  await b.next("joined");
  const left = await a.next("left");
  assert.ok(left.member);
  a.close();
  b.close();
});

test("códigos inválidos y ping", async () => {
  const a = await client();
  a.j({ type: "join", room: "../../etc" });
  assert.equal((await a.next("error")).code, "bad_room");
  a.j({ type: "ping", t: 123 });
  assert.equal((await a.next("pong")).t, 123);
  a.close();
});

test("sala llena con 10 personas", async () => {
  const first = await client();
  first.j({ type: "create" });
  const room = (await first.next("joined")).room;
  const others = [];
  for (let i = 0; i < 9; i++) {
    const c = await client();
    c.j({ type: "join", room });
    await c.next("joined");
    others.push(c);
  }
  const extra = await client();
  extra.j({ type: "join", room });
  assert.equal((await extra.next("error")).code, "room_full");
  [first, extra, ...others].forEach((c) => c.close());
});
