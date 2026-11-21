// content.js — se ejecuta dentro de la página de Mubi.
// Detecta el elemento <video>, escucha sus eventos y aplica los eventos remotos.

let video = null;
let suppress = false;
let heartbeatInterval = null;

function findVideo() {
  const v = document.querySelector("video");
  if (v && v !== video) {
    video = v;
    attachListeners();
    return true;
  }
  return !!video;
}

function attachListeners() {
  video.addEventListener("play", () => {
    if (!suppress) sendEvent("play", video.currentTime);
  });
  video.addEventListener("pause", () => {
    if (!suppress) sendEvent("pause", video.currentTime);
  });
  video.addEventListener("seeked", () => {
    if (!suppress) sendEvent("seek", video.currentTime);
  });

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (video && !video.paused && !suppress) {
      sendEvent("heartbeat", video.currentTime);
    }
  }, 5000);
}

function sendEvent(action, time) {
  chrome.runtime.sendMessage({ type: "localEvent", action, time }).catch(() => {});
}

function applyRemote(action, time) {
  if (!video) return;
  suppress = true;

  if (action === "play") {
    if (Math.abs(video.currentTime - time) > 1) video.currentTime = time;
    video.play().catch(() => {});
  } else if (action === "pause") {
    if (Math.abs(video.currentTime - time) > 1) video.currentTime = time;
    video.pause();
  } else if (action === "seek") {
    video.currentTime = time;
  } else if (action === "heartbeat") {
    // Corrige solo si hay un desfase notable, para no interrumpir el buffering local
    if (Math.abs(video.currentTime - time) > 2) {
      video.currentTime = time;
    }
  }

  setTimeout(() => {
    suppress = false;
  }, 500);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "remoteEvent") {
    applyRemote(msg.action, msg.time);
  }
});

// Mubi es una SPA: el <video> puede aparecer después de cargar la página.
if (!findVideo()) {
  const observer = new MutationObserver(() => {
    if (findVideo()) {
      // seguimos observando por si el usuario cambia de película (nuevo <video>)
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  const observer = new MutationObserver(() => findVideo());
  observer.observe(document.body, { childList: true, subtree: true });
}
