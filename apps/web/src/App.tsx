import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Message, Room, User, WsIncoming } from "./types";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];

function wsBase() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

export function App() {
  const [token, setToken] = useState(localStorage.getItem("boltorezka_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSlug, setRoomSlug] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatText, setChatText] = useState("");
  const [presence, setPresence] = useState<string[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";

  const pushLog = (text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString()} ${text}`, ...prev].slice(0, 30));
  };

  useEffect(() => {
    api.authMode()
      .then((res) => setAuthMode(res.mode))
      .catch(() => setAuthMode("sso"));
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRooms([]);
      setMessages([]);
      setAdminUsers([]);
      return;
    }

    localStorage.setItem("boltorezka_token", token);

    api.me(token)
      .then((res) => setUser(res.user))
      .catch(() => {
        setToken("");
        localStorage.removeItem("boltorezka_token");
      });

    api.rooms(token)
      .then((res) => setRooms(res.rooms))
      .catch((error) => pushLog(`rooms failed: ${error.message}`));
  }, [token]);

  useEffect(() => {
    if (!token) {
      wsRef.current?.close();
      wsRef.current = null;
      reconnectAttemptRef.current = 0;
      setWsState("disconnected");
      return;
    }

    let isDisposed = false;
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };

    const scheduleReconnect = () => {
      if (isDisposed) {
        return;
      }

      const index = Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1);
      const delay = RECONNECT_DELAYS_MS[index];
      reconnectAttemptRef.current += 1;
      setWsState("connecting");
      pushLog(`ws reconnect in ${Math.round(delay / 1000)}s`);

      reconnectTimeout = setTimeout(() => {
        if (isDisposed) {
          return;
        }
        connect();
      }, delay);
    };

    const connect = () => {
      setWsState("connecting");

      api.wsTicket(token)
        .then(({ ticket }) => {
          if (isDisposed) {
            return;
          }

          ws = new WebSocket(`${wsBase()}/v1/realtime/ws?ticket=${encodeURIComponent(ticket)}`);
          wsRef.current = ws;

          ws.onopen = () => {
            reconnectAttemptRef.current = 0;
            setWsState("connected");
            pushLog("ws connected");
            ws?.send(JSON.stringify({ type: "room.join", payload: { roomSlug } }));

            pingInterval = setInterval(() => {
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                return;
              }
              ws.send(JSON.stringify({ type: "ping" }));
            }, 15000);
          };

          ws.onclose = () => {
            setWsState("disconnected");
            pushLog("ws disconnected");
            clearTimers();
            scheduleReconnect();
          };

          ws.onerror = () => {
            pushLog("ws error");
          };

          ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as WsIncoming;
            if (message.type === "chat.message" && message.payload) {
              setMessages((prev) => [
                ...prev,
                {
                  id: message.payload.id || crypto.randomUUID(),
                  room_id: message.payload.roomId || "",
                  user_id: message.payload.userId,
                  text: message.payload.text,
                  created_at: message.payload.createdAt || new Date().toISOString(),
                  user_name: message.payload.userName || "unknown"
                }
              ]);
            }
            if (message.type === "room.joined") {
              setRoomSlug(message.payload.roomSlug);
            }
            if (message.type === "room.presence") {
              const users = (message.payload?.users || []).map(
                (item: { userName: string; userId: string }) =>
                  `${item.userName} (${item.userId.slice(0, 8)})`
              );
              setPresence(users);
            }
          };
        })
        .catch((error) => {
          pushLog(`ws ticket failed: ${(error as Error).message}`);
          scheduleReconnect();
        });
    };
    connect();

    return () => {
      isDisposed = true;
      clearTimers();
      ws?.close();
    };
  }, [token]);

  useEffect(() => {
    if (!token || !roomSlug) return;
    api.roomMessages(token, roomSlug)
      .then((res) => setMessages(res.messages))
      .catch((error) => pushLog(`history failed: ${error.message}`));
  }, [token, roomSlug]);

  useEffect(() => {
    if (!token || !canPromote) return;
    api.adminUsers(token)
      .then((res) => setAdminUsers(res.users))
      .catch((error) => pushLog(`admin users failed: ${error.message}`));
  }, [token, canPromote]);

  const beginSso = (provider: "google" | "yandex") => {
    const returnUrl = window.location.href;
    window.location.href = `/v1/auth/sso/start?provider=${provider}&returnUrl=${encodeURIComponent(returnUrl)}`;
  };

  const completeSso = async () => {
    try {
      const res = await api.ssoSession();
      if (!res.authenticated || !res.token) {
        pushLog("sso not authenticated yet");
        return;
      }
      setToken(res.token);
      setUser(res.user);
      pushLog("sso session established");
    } catch (error) {
      pushLog(`sso failed: ${(error as Error).message}`);
    }
  };

  const logout = () => {
    localStorage.removeItem("boltorezka_token");
    setToken("");
    setUser(null);
    window.location.href = `/v1/auth/sso/logout?returnUrl=${encodeURIComponent(window.location.href)}`;
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    try {
      const slug = newRoomSlug.trim();
      const title = newRoomTitle.trim();
      await api.createRoom(token, { slug, title, is_public: true });
      setNewRoomSlug("");
      setNewRoomTitle("");
      const res = await api.rooms(token);
      setRooms(res.rooms);
      pushLog(`room created: ${slug}`);
    } catch (error) {
      pushLog(`create room failed: ${(error as Error).message}`);
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!chatText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "chat.send",
        payload: { text: chatText.trim() }
      })
    );
    setChatText("");
  };

  const joinRoom = (slug: string) => {
    setRoomSlug(slug);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "room.join", payload: { roomSlug: slug } }));
    }
  };

  const promote = async (userId: string) => {
    if (!token || !canPromote) return;
    try {
      await api.promoteUser(token, userId);
      const res = await api.adminUsers(token);
      setAdminUsers(res.users);
      pushLog("user promoted to admin");
    } catch (error) {
      pushLog(`promote failed: ${(error as Error).message}`);
    }
  };

  const sessionText = useMemo(() => {
    if (!token) return "No active session";
    return JSON.stringify(
      {
        token: `${token.slice(0, 16)}...`,
        user,
        permissions: {
          canCreateRooms,
          canPromote
        }
      },
      null,
      2
    );
  }, [token, user, canCreateRooms, canPromote]);

  return (
    <main className="app legacy-layout">
      <h1 className="app-title">Boltorezka</h1>

      <div className="workspace">
        <aside className="leftcolumn">
          <section className="card compact">
            <p className="muted">auth mode: {authMode}</p>
            <p className="muted">ws: {wsState}</p>
            <div className="row">
              <button onClick={() => beginSso("google")}>Google</button>
              <button className="secondary" onClick={() => beginSso("yandex")}>Yandex</button>
              <button onClick={completeSso}>Complete</button>
              <button className="secondary" onClick={logout}>Logout</button>
            </div>
          </section>

          <section className="card compact">
            <h2>Session</h2>
            <pre>{sessionText}</pre>
          </section>

          <section className="card compact">
            <h2>Rooms</h2>
            {canCreateRooms ? (
              <form className="stack" onSubmit={createRoom}>
                <input value={newRoomSlug} onChange={(e) => setNewRoomSlug(e.target.value)} placeholder="slug" />
                <input value={newRoomTitle} onChange={(e) => setNewRoomTitle(e.target.value)} placeholder="title" />
                <button type="submit">Create room</button>
              </form>
            ) : (
              <p className="muted">Only admin/super_admin can create rooms.</p>
            )}

            <ul className="rooms-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button className="secondary room-btn" onClick={() => joinRoom(room.slug)}>
                    {room.slug} — {room.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="middlecolumn">
          <section className="card middle-card">
            <h2>Chat ({roomSlug})</h2>
            <pre className="presence-box">presence: {JSON.stringify(presence)}</pre>
            <div className="chat-log">
              {messages.map((message) => (
                <div key={message.id} className="chat-line">
                  <span className="chat-user">{message.user_name}:</span> {message.text}
                </div>
              ))}
            </div>
            <form className="row" onSubmit={sendMessage}>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Type message" />
              <button type="submit">Send</button>
            </form>
          </section>
        </section>

        <aside className="rightcolumn">
          {canPromote ? (
            <section className="card compact">
              <h2>Admin Users</h2>
              <ul className="admin-list">
                {adminUsers.map((item) => (
                  <li key={item.id} className="row admin-row">
                    <span>{item.email} ({item.role})</span>
                    {item.role === "user" ? (
                      <button onClick={() => promote(item.id)}>Promote</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card compact">
            <h2>Event Log</h2>
            <div className="log">
              {eventLog.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
