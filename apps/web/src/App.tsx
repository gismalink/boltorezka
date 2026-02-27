import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { trackClientEvent } from "./telemetry";
import type { Message, Room, User, WsIncoming, WsOutgoing } from "./types";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];
const ACK_TIMEOUT_MS = 6000;
const MAX_CHAT_RETRIES = 3;

type PendingRequest = {
  eventType: string;
  envelope: WsOutgoing;
  retries: number;
  maxRetries: number;
};

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
  const pendingRequestsRef = useRef(new Map<string, PendingRequest>());
  const ackTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";

  const pushLog = (text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString()} ${text}`, ...prev].slice(0, 30));
  };

  const markMessageDelivery = (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch: Partial<Message> = {}
  ) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.clientRequestId === requestId ? { ...item, deliveryStatus: status, ...patch } : item
      )
    );
  };

  const clearAckTimer = (requestId: string) => {
    const timer = ackTimersRef.current.get(requestId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    ackTimersRef.current.delete(requestId);
  };

  const clearAllAckTimers = () => {
    for (const timer of ackTimersRef.current.values()) {
      clearTimeout(timer);
    }
    ackTimersRef.current.clear();
  };

  const armAckTimeout = (requestId: string) => {
    clearAckTimer(requestId);

    const timer = setTimeout(() => {
      const pending = pendingRequestsRef.current.get(requestId);
      if (!pending) {
        return;
      }

      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        armAckTimeout(requestId);
        return;
      }

      if (pending.retries >= pending.maxRetries) {
        pendingRequestsRef.current.delete(requestId);
        clearAckTimer(requestId);
        if (pending.eventType === "chat.send") {
          markMessageDelivery(requestId, "failed");
          trackClientEvent(
            "chat.request.failed.retries_exhausted",
            { requestId, eventType: pending.eventType, retries: pending.retries },
            token
          );
        }
        pushLog(`ws request failed after retries: ${pending.eventType}`);
        return;
      }

      pending.retries += 1;
      socket.send(JSON.stringify(pending.envelope));
      if (pending.eventType === "chat.send") {
        markMessageDelivery(requestId, "sending");
      }
      pushLog(`ws retry ${pending.eventType} #${pending.retries}`);
      armAckTimeout(requestId);
    }, ACK_TIMEOUT_MS);

    ackTimersRef.current.set(requestId, timer);
  };

  const sendWsEvent = (
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pushLog(`ws send skipped: ${eventType} (socket is not open)`);
      return null;
    }

    const requestId = crypto.randomUUID();
    const envelope: WsOutgoing = {
      type: eventType,
      requestId,
      payload
    };

    if (options.withIdempotency) {
      envelope.idempotencyKey = requestId;
    }

    const trackAck = options.trackAck !== false;
    if (trackAck) {
      pendingRequestsRef.current.set(requestId, {
        eventType,
        envelope,
        retries: 0,
        maxRetries: options.maxRetries ?? 0
      });
      armAckTimeout(requestId);
    }

    socket.send(JSON.stringify(envelope));
    return requestId;
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
      pendingRequestsRef.current.clear();
      clearAllAckTimers();
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
            trackClientEvent("ws.connected", { roomSlug }, token);

            for (const [requestId, pending] of pendingRequestsRef.current.entries()) {
              ws?.send(JSON.stringify(pending.envelope));
              if (pending.eventType === "chat.send") {
                markMessageDelivery(requestId, "sending");
              }
              armAckTimeout(requestId);
            }

            sendWsEvent("room.join", { roomSlug }, { maxRetries: 1 });

            pingInterval = setInterval(() => {
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                return;
              }
              sendWsEvent("ping", {}, { trackAck: false });
            }, 15000);
          };

          ws.onclose = () => {
            setWsState("disconnected");
            pushLog("ws disconnected");
            clearAllAckTimers();
            clearTimers();
            scheduleReconnect();
          };

          ws.onerror = () => {
            pushLog("ws error");
            trackClientEvent("ws.error", {}, token);
          };

          ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as WsIncoming;

            if (message.type === "ack") {
              const requestId = String(message.payload?.requestId || "").trim();
              const eventType = String(message.payload?.eventType || "").trim();
              if (requestId) {
                pendingRequestsRef.current.delete(requestId);
                clearAckTimer(requestId);
                if (eventType === "chat.send") {
                  markMessageDelivery(requestId, "delivered", {
                    id: message.payload?.messageId || requestId
                  });
                }
              }
              return;
            }

            if (message.type === "nack") {
              const requestId = String(message.payload?.requestId || "").trim();
              const eventType = String(message.payload?.eventType || "").trim();
              const code = String(message.payload?.code || "UnknownError");
              const nackMessage = String(message.payload?.message || "Request failed");
              trackClientEvent(
                "ws.nack.received",
                {
                  requestId,
                  eventType,
                  code,
                  message: nackMessage
                },
                token
              );
              if (requestId) {
                pendingRequestsRef.current.delete(requestId);
                clearAckTimer(requestId);
                if (eventType === "chat.send") {
                  markMessageDelivery(requestId, "failed");
                }
              }
              pushLog(`nack ${eventType}: ${code} ${nackMessage}`);
              return;
            }

            if (message.type === "chat.message" && message.payload) {
              const senderRequestId =
                typeof message.payload.senderRequestId === "string"
                  ? message.payload.senderRequestId
                  : undefined;

              if (senderRequestId) {
                pendingRequestsRef.current.delete(senderRequestId);
                clearAckTimer(senderRequestId);
                let replaced = false;
                setMessages((prev) => {
                  const next = prev.map((item) => {
                    if (item.clientRequestId !== senderRequestId) {
                      return item;
                    }
                    replaced = true;
                    return {
                      ...item,
                      id: message.payload.id || item.id,
                      room_id: message.payload.roomId || item.room_id,
                      user_id: message.payload.userId || item.user_id,
                      text: message.payload.text || item.text,
                      created_at: message.payload.createdAt || item.created_at,
                      user_name: message.payload.userName || item.user_name,
                      deliveryStatus: "delivered" as const
                    };
                  });

                  if (!replaced) {
                    next.push({
                      id: message.payload.id || crypto.randomUUID(),
                      room_id: message.payload.roomId || "",
                      user_id: message.payload.userId,
                      text: message.payload.text,
                      created_at: message.payload.createdAt || new Date().toISOString(),
                      user_name: message.payload.userName || "unknown",
                      deliveryStatus: "delivered" as const
                    });
                  }

                  return next;
                });
              } else {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: message.payload.id || crypto.randomUUID(),
                    room_id: message.payload.roomId || "",
                    user_id: message.payload.userId,
                    text: message.payload.text,
                    created_at: message.payload.createdAt || new Date().toISOString(),
                    user_name: message.payload.userName || "unknown",
                    deliveryStatus: "delivered" as const
                  }
                ]);
              }
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
      clearAllAckTimers();
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
      trackClientEvent("auth.sso.complete.success", { userId: res.user?.id || null }, res.token);
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
    if (!chatText.trim()) return;

    const text = chatText.trim();
    const requestId = sendWsEvent("chat.send", { text }, { withIdempotency: true, maxRetries: MAX_CHAT_RETRIES });
    if (!requestId) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: requestId,
        room_id: "",
        user_id: user?.id || "",
        text,
        created_at: new Date().toISOString(),
        user_name: user?.name || "me",
        clientRequestId: requestId,
        deliveryStatus: "sending" as const
      }
    ]);

    setChatText("");
  };

  const joinRoom = (slug: string) => {
    setRoomSlug(slug);
    sendWsEvent("room.join", { roomSlug: slug }, { maxRetries: 1 });
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
                  {message.deliveryStatus ? (
                    <span className={`delivery delivery-${message.deliveryStatus}`}>
                      {message.deliveryStatus}
                    </span>
                  ) : null}
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
