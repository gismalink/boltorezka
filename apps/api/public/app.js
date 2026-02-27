const state = {
  token: localStorage.getItem("boltorezka_token") || "",
  user: null,
  ws: null,
  currentRoomSlug: null,
  authMode: "unknown",
  ssoBaseUrl: ""
};

const sessionBox = document.querySelector("#session-box");
const eventLog = document.querySelector("#event-log");
const roomsList = document.querySelector("#rooms-list");
const wsStatus = document.querySelector("#ws-status");
const chatLog = document.querySelector("#chat-log");
const authModeBox = document.querySelector("#auth-mode-box");

function resolveDefaultSsoBase() {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) {
    return "http://localhost:3000";
  }
  return host.startsWith("test.")
    ? "https://test.auth.gismalink.art"
    : "https://auth.gismalink.art";
}

function logEvent(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventLog.textContent = `${line}\n${eventLog.textContent}`.trim();
}

function logChat(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  chatLog.textContent = `${chatLog.textContent}\n${line}`.trim();
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateSessionView() {
  if (!state.token) {
    sessionBox.textContent = "No active session";
    return;
  }

  sessionBox.textContent = JSON.stringify(
    {
      token: `${state.token.slice(0, 16)}...`,
      user: state.user
    },
    null,
    2
  );
}

async function apiFetch(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json.message || json.error || `HTTP ${response.status}`);
  }

  return json;
}

async function refreshMe() {
  if (!state.token) {
    state.user = null;
    updateSessionView();
    return;
  }

  try {
    const data = await apiFetch("/v1/auth/me");
    state.user = data.user;
  } catch {
    state.token = "";
    localStorage.removeItem("boltorezka_token");
    state.user = null;
  }

  updateSessionView();
}

async function loadAuthMode() {
  try {
    const data = await apiFetch("/v1/auth/mode", {
      headers: {}
    });
    state.authMode = data.mode || "sso";
    state.ssoBaseUrl = data.ssoBaseUrl || resolveDefaultSsoBase();
  } catch {
    state.authMode = "sso";
    state.ssoBaseUrl = resolveDefaultSsoBase();
  }

  authModeBox.textContent = `auth mode: ${state.authMode} | sso: ${state.ssoBaseUrl}`;
}

function beginSso(provider) {
  const returnUrl = window.location.href;
  const startPath = `/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  window.location.href = startPath;
}

async function completeSsoSession() {
  try {
    const data = await apiFetch("/v1/auth/sso/session", {
      method: "GET",
      headers: {}
    });

    if (!data.authenticated || !data.token) {
      logEvent("sso session not authenticated yet");
      return false;
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("boltorezka_token", state.token);

    updateSessionView();
    await loadRooms();
    connectWs();
    logEvent("sso session established");
    return true;
  } catch (error) {
    logEvent(`sso session failed: ${error.message}`);
    return false;
  }
}

async function loadRooms() {
  if (!state.token) {
    roomsList.innerHTML = "<li>Login first</li>";
    return;
  }

  try {
    const data = await apiFetch("/v1/rooms");
    roomsList.innerHTML = "";

    for (const room of data.rooms) {
      const li = document.createElement("li");
      li.textContent = `${room.slug} — ${room.title}`;
      roomsList.appendChild(li);
    }

    if (data.rooms.length === 0) {
      roomsList.innerHTML = "<li>No rooms yet</li>";
    }
  } catch (error) {
    logEvent(`rooms load failed: ${error.message}`);
  }
}

function connectWs() {
  if (!state.token) {
    logEvent("cannot connect ws without token");
    return;
  }

  if (state.ws) {
    state.ws.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${window.location.host}/v1/realtime/ws?token=${encodeURIComponent(state.token)}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    wsStatus.textContent = "WS: connected";
    logEvent("ws connected");
  };

  state.ws.onclose = () => {
    wsStatus.textContent = "WS: disconnected";
    logEvent("ws disconnected");
  };

  state.ws.onerror = () => {
    logEvent("ws error");
  };

  state.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    logEvent(`ws ${message.type}`);

    if (message.type === "chat.message") {
      const payload = message.payload;
      logChat(`${payload.userName}: ${payload.text}`);
    }

    if (message.type === "room.joined") {
      state.currentRoomSlug = message.payload.roomSlug;
      document.querySelector("#join-room-slug").value = message.payload.roomSlug;
    }
  };
}

document.querySelector("#sso-google-btn").addEventListener("click", () => {
  beginSso("google");
});

document.querySelector("#sso-yandex-btn").addEventListener("click", () => {
  beginSso("yandex");
});

document.querySelector("#sso-complete-btn").addEventListener("click", async () => {
  await completeSsoSession();
});

document.querySelector("#logout-btn").addEventListener("click", () => {
  const returnUrl = window.location.href;
  const logoutUrl = `/v1/auth/sso/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
  localStorage.removeItem("boltorezka_token");
  state.token = "";
  state.user = null;
  state.currentRoomSlug = null;
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  roomsList.innerHTML = "<li>Login first</li>";
  chatLog.textContent = "";
  updateSessionView();
  logEvent("logout -> sso redirect");
  window.location.href = logoutUrl;
});

document.querySelector("#create-room-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const slug = document.querySelector("#room-slug").value.trim();
  const title = document.querySelector("#room-title").value.trim();

  if (!slug || !title) {
    logEvent("room create: slug and title required");
    return;
  }

  try {
    await apiFetch("/v1/rooms", {
      method: "POST",
      body: JSON.stringify({ slug, title, is_public: true })
    });

    logEvent(`room created: ${slug}`);
    await loadRooms();
  } catch (error) {
    logEvent(`room create failed: ${error.message}`);
  }
});

document.querySelector("#join-room-btn").addEventListener("click", () => {
  const slug = document.querySelector("#join-room-slug").value.trim();

  if (!slug) {
    logEvent("join room: room slug is required");
    return;
  }

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    logEvent("join room: ws is not connected");
    return;
  }

  state.ws.send(
    JSON.stringify({
      type: "room.join",
      payload: { roomSlug: slug }
    })
  );
});

document.querySelector("#send-chat-btn").addEventListener("click", () => {
  const text = document.querySelector("#chat-input").value.trim();

  if (!text) {
    return;
  }

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    logEvent("chat send: ws is not connected");
    return;
  }

  state.ws.send(
    JSON.stringify({
      type: "chat.send",
      payload: { text }
    })
  );

  document.querySelector("#chat-input").value = "";
});

(async function bootstrap() {
  await loadAuthMode();
  await refreshMe();
  await loadRooms();
  if (state.token) {
    connectWs();
  } else {
    const established = await completeSsoSession();
    if (!established) {
      logEvent("click 'Login via Google/Yandex', then 'Complete SSO Session'");
    }
  }
})();
