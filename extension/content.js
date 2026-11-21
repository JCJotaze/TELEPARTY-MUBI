// content.js — se ejecuta dentro de las páginas de MUBI.
// Detecta el <video>, avisa de los cambios locales y aplica los remotos.

const HEARTBEAT_MS = 5000;
const EXPECT_MS = 4000; // cuánto esperamos el eco de una orden remota
const INVITE_RE = /[#&]watchparty=([a-z0-9]{3}-[a-z0-9]{3})/i;

let video = null;
let heartbeatTimer = null;
const expected = new Map(); // tipo de evento -> fecha límite

// ---------- detección del video ----------

function pickVideo() {
  let best = null;
  let bestArea = 0;
  for (const v of document.querySelectorAll("video")) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (area >= bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best;
}

function checkVideo() {
  const v = pickVideo();
  if (v && v !== video) {
    detach();
    video = v;
    attach();
  } else if (!v && video) {
    detach();
  }
}

function attach() {
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);
  video.addEventListener("seeked", onSeeked);
  heartbeatTimer = setInterval(() => {
    if (video && !video.paused && !video.seeking) send("sync");
  }, HEARTBEAT_MS);
}

function detach() {
  if (video) {
    video.removeEventListener("play", onPlay);
    video.removeEventListener("pause", onPause);
    video.removeEventListener("seeked", onSeeked);
  }
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  video = null;
  expected.clear();
}

// ---------- eventos locales ----------

// Si el evento es el eco de una orden remota que acabamos de aplicar, no lo reenviamos.
function consumeExpected(type) {
  const deadline = expected.get(type);
  if (deadline === undefined) return false;
  expected.delete(type);
  return Date.now() <= deadline;
}

function expect(type) {
  expected.set(type, Date.now() + EXPECT_MS);
}

function onPlay() {
  if (!consumeExpected("play")) send("play");
}
function onPause() {
  if (!consumeExpected("pause")) send("pause");
}
function onSeeked() {
  if (!consumeExpected("seeked")) send("seek");
}

function send(action) {
  if (!video) return;
  chrome.runtime
    .sendMessage({ type: "localEvent", action, time: video.currentTime, paused: video.paused })
    .catch(() => {});
}

// ---------- eventos remotos ----------

function setTime(target, threshold) {
  if (Math.abs(video.currentTime - target) > threshold) {
    expect("seeked");
    video.currentTime = target;
  }
}

function setPaused(paused) {
  if (paused && !video.paused) {
    expect("pause");
    video.pause();
  } else if (!paused && video.paused) {
    expect("play");
    video.play().catch(() => {
      expected.delete("play");
      showToast("Haz clic en ▶️ para seguir sincronizado");
    });
  }
}

function applyRemote({ action, time, paused, lat }) {
  if (!video) return;
  const willPlay = action === "play" || ((action === "seek" || action === "sync") && !paused);
  // Si el otro está reproduciendo, compensamos lo que tardó en llegar el mensaje.
  const target = willPlay ? time + (lat || 0) : time;

  if (action === "play") {
    setTime(target, 0.75);
    setPaused(false);
  } else if (action === "pause") {
    setPaused(true);
    setTime(target, 0.75);
  } else if (action === "seek") {
    setTime(target, 0.25);
    setPaused(!!paused);
  } else if (action === "sync") {
    // Corrección suave: solo si el desfase es notable, para no cortar el buffering.
    setTime(target, 1.5);
    setPaused(!!paused);
  }
}

// ---------- avisos en pantalla ----------

let toastHost = null;
let toastBox = null;

function ensureToastHost() {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.style.cssText = "all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647; pointer-events: none;";
    const shadow = toastHost.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .box { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
        .t { background: rgba(17,18,20,.92); color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 14px;
             box-shadow: 0 4px 16px rgba(0,0,0,.4); border-left: 3px solid #e01f3d; max-width: 320px;
             animation: in .2s ease-out; transition: opacity .4s; }
        @keyframes in { from { opacity: 0; transform: translateY(-6px); } }
      </style>
      <div class="box"></div>`;
    toastBox = shadow.querySelector(".box");
  }
  // En pantalla completa solo se ve lo que está dentro del elemento a pantalla completa.
  const parent = document.fullscreenElement || document.documentElement;
  if (toastHost.parentNode !== parent) parent.appendChild(toastHost);
}

function showToast(text) {
  ensureToastHost();
  const el = document.createElement("div");
  el.className = "t";
  el.textContent = text;
  toastBox.appendChild(el);
  setTimeout(() => (el.style.opacity = "0"), 3500);
  setTimeout(() => el.remove(), 4000);
}

document.addEventListener("fullscreenchange", () => {
  if (toastHost) ensureToastHost();
});

// ---------- mensajes de la extensión ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "remoteEvent") {
    applyRemote(msg);
  } else if (msg.type === "toast") {
    // Mostramos el aviso en el frame del video, o en la página principal.
    if (video || window === window.top) showToast(msg.text);
  } else if (msg.type === "getPlayerState") {
    if (video) {
      sendResponse({ time: video.currentTime, paused: video.paused });
    }
  }
  return false;
});

// ---------- enlaces de invitación (#watchparty=abc-123) ----------

function checkInvite() {
  const m = INVITE_RE.exec(location.hash);
  if (!m) return;
  chrome.runtime.sendMessage({ type: "joinFromLink", room: m[1].toLowerCase() }).catch(() => {});
  const cleanHash = location.hash.replace(INVITE_RE, "").replace(/^#&?$/, "");
  history.replaceState(history.state, "", location.pathname + location.search + cleanHash);
  showToast("Uniéndote a la sala…");
}

if (window === window.top) {
  checkInvite();
  window.addEventListener("hashchange", checkInvite);
}

// ---------- arranque ----------

// MUBI es una SPA: el <video> puede aparecer o cambiar sin recargar la página.
let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    checkVideo();
  }, 300);
}).observe(document.documentElement, { childList: true, subtree: true });
checkVideo();
