const $ = (id) => document.getElementById(id);

const AVATARS = ["🙂", "😎", "🤓", "🥳", "🐱", "🐶", "🦊", "🐼", "🐸", "🦄", "🍿", "🎬", "🌙", "🔥", "🌻", "👽"];
const CODE_RE = /^[a-z0-9]{3}-?[a-z0-9]{3}$/;

let profile = null;
let selectedAvatar = AVATARS[0];
let editingProfile = false;
let current = { status: "idle", room: null, members: [] };

// ---------- perfil ----------

function renderAvatarGrid() {
  const grid = $("avatarGrid");
  grid.innerHTML = "";
  for (const a of AVATARS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = a;
    b.className = a === selectedAvatar ? "selected" : "";
    b.addEventListener("click", () => {
      selectedAvatar = a;
      renderAvatarGrid();
    });
    grid.appendChild(b);
  }
}

$("saveProfileBtn").addEventListener("click", async () => {
  const name = $("nameInput").value.trim();
  if (!name) {
    $("nameInput").focus();
    showStatus("error", "Escribe tu nombre");
    return;
  }
  profile = { name, avatar: selectedAvatar };
  await chrome.storage.sync.set({ profile });
  editingProfile = false;
  render();
});

$("editProfileBtn").addEventListener("click", () => {
  editingProfile = !editingProfile;
  render();
});

// ---------- salas ----------

$("createBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "create" });
});

function joinFromInput() {
  let code = $("codeInput").value.trim().toLowerCase();
  // Acepta también un enlace de invitación pegado entero.
  const fromLink = /watchparty=([a-z0-9]{3}-[a-z0-9]{3})/i.exec(code);
  if (fromLink) code = fromLink[1].toLowerCase();
  if (!CODE_RE.test(code)) {
    showStatus("error", "El código debe tener el formato abc-123");
    return;
  }
  if (!code.includes("-")) code = `${code.slice(0, 3)}-${code.slice(3)}`;
  chrome.runtime.sendMessage({ type: "join", room: code });
}

$("joinBtn").addEventListener("click", joinFromInput);
$("codeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinFromInput();
});

$("leaveBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "leave" });
});

async function copy(text, btn, label) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = label;
    setTimeout(() => (btn.textContent = old), 1500);
  } catch {
    showStatus("error", "No se pudo copiar");
  }
}

$("copyCodeBtn").addEventListener("click", (e) => copy(current.room, e.currentTarget, "¡Copiado!"));

$("copyLinkBtn").addEventListener("click", async (e) => {
  // Enlace a la misma película que estás viendo, con el código de sala al final.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true, url: ["*://*.mubi.com/*"] });
  let base = "https://mubi.com/";
  if (tab && tab.url) {
    const u = new URL(tab.url);
    u.hash = "";
    base = u.toString();
  }
  copy(`${base}#watchparty=${current.room}`, e.currentTarget, "¡Enlace copiado!");
});

// ---------- servidor avanzado ----------

$("saveServerBtn").addEventListener("click", async () => {
  let url = $("serverInput").value.trim();
  if (!url) return;
  url = url.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://").replace(/\/+$/, "");
  if (!/^wss?:\/\/[^\s/]+/i.test(url)) {
    showStatus("error", "La dirección debe empezar por wss://");
    return;
  }
  $("serverInput").value = url;
  await chrome.storage.local.set({ customServerUrl: url });
  showStatus("ok", "Servidor guardado");
});

$("resetServerBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove("customServerUrl");
  $("serverInput").value = "";
  showStatus("ok", "Usando el servidor predeterminado");
});

// ---------- render ----------

const STATUS_TEXT = {
  connecting: "Conectando…",
  waking: "Despertando el servidor… (puede tardar hasta un minuto)",
  connected: "Conectado",
};

function showStatus(kind, text) {
  const el = $("status");
  el.hidden = !text;
  el.textContent = text || "";
  el.className = `status ${kind}`;
}

function renderStatus() {
  const s = current.status;
  if (s === "error") showStatus("error", current.error || "Error");
  else if (s === "connecting" || s === "waking") showStatus("pending", current.error || STATUS_TEXT[s]);
  else if (s === "connected") showStatus("ok", STATUS_TEXT.connected);
  else showStatus("", "");
}

function renderMembers() {
  const list = $("membersList");
  list.innerHTML = "";
  for (const m of current.members || []) {
    const li = document.createElement("li");
    const av = document.createElement("span");
    av.className = "m-avatar";
    av.textContent = m.avatar || "🙂";
    const nm = document.createElement("span");
    nm.className = "m-name";
    nm.textContent = m.name || "Invitado";
    li.append(av, nm);
    if (m.id === current.hostId) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "anfitrión";
      li.append(b);
    }
    if (m.id === current.you) {
      const b = document.createElement("span");
      b.className = "badge you";
      b.textContent = "tú";
      li.append(b);
    }
    list.append(li);
  }
  if ((current.members || []).length < 2) {
    const li = document.createElement("li");
    li.className = "waiting";
    li.textContent = "Esperando a que alguien se una…";
    list.append(li);
  }
}

function render() {
  const needsProfile = !profile || !profile.name;
  const showProfile = needsProfile || editingProfile;
  const inRoom = !!current.room;
  const busy = current.status === "connecting" || current.status === "waking";

  $("profileView").hidden = !showProfile;
  $("lobbyView").hidden = showProfile || inRoom;
  $("roomView").hidden = showProfile || !inRoom;

  const editBtn = $("editProfileBtn");
  editBtn.hidden = needsProfile;
  if (profile) editBtn.textContent = profile.avatar;

  if (showProfile) {
    $("nameInput").value = profile?.name || $("nameInput").value;
    renderAvatarGrid();
  }

  $("createBtn").disabled = busy;
  $("joinBtn").disabled = busy;

  if (inRoom) {
    $("roomCode").textContent = current.room;
    renderMembers();
  }
  renderStatus();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "state") {
    current = msg.state;
    render();
  }
});

// ---------- inicio ----------

(async function init() {
  const [{ profile: p }, { customServerUrl }] = await Promise.all([
    chrome.storage.sync.get("profile"),
    chrome.storage.local.get("customServerUrl"),
  ]);
  profile = p || null;
  if (profile?.avatar) selectedAvatar = profile.avatar;
  if (customServerUrl) {
    $("serverInput").value = customServerUrl;
    $("advanced").open = true;
  }
  $("serverInput").placeholder = DEFAULT_SERVER_URL;
  try {
    const s = await chrome.runtime.sendMessage({ type: "getState" });
    if (s) current = s;
  } catch {}
  render();
})();
