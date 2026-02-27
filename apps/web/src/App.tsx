import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { AuthController } from "./services/authController";
import { CallSignalingController, type CallSignalEventType, type CallStatus } from "./services/callSignalingController";
import { ChatController } from "./services/chatController";
import { RealtimeClient } from "./services/realtimeClient";
import { RoomAdminController } from "./services/roomAdminController";
import { WsMessageController } from "./services/wsMessageController";
import { trackClientEvent } from "./telemetry";
import type {
  Message,
  MessagesCursor,
  Room,
  TelemetrySummary,
  User
} from "./types";

const MAX_CHAT_RETRIES = 3;

export function App() {
  const [token, setToken] = useState(localStorage.getItem("boltorezka_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomSlug, setRoomSlug] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<MessagesCursor | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [chatText, setChatText] = useState("");
  const [callTargetUserId, setCallTargetUserId] = useState("");
  const [callSignalJson, setCallSignalJson] = useState('{"type":"offer","sdp":""}');
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [callEventLog, setCallEventLog] = useState<string[]>([]);
  const [presence, setPresence] = useState<string[]>([]);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummary | null>(null);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const roomSlugRef = useRef(roomSlug);
  const authMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";
  const canViewTelemetry = canPromote || canCreateRooms;

  const pushLog = (text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString()} ${text}`, ...prev].slice(0, 30));
  };

  const pushCallLog = (text: string) => {
    setCallEventLog((prev) => [`${new Date().toLocaleTimeString()} ${text}`, ...prev].slice(0, 30));
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

  const sendWsEvent = useCallback((
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) => {
    return realtimeClientRef.current?.sendEvent(eventType, payload, options) ?? null;
  }, []);

  const callSignalingController = useMemo(
    () =>
      new CallSignalingController({
        sendWsEvent,
        setCallStatus,
        setLastCallPeer,
        pushCallLog
      }),
    [sendWsEvent]
  );

  const authController = useMemo(
    () =>
      new AuthController({
        pushLog,
        setToken,
        setUser
      }),
    []
  );

  const roomAdminController = useMemo(
    () =>
      new RoomAdminController({
        pushLog,
        setRoomSlug,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        sendRoomJoinEvent: (slug) => {
          void sendWsEvent("room.join", { roomSlug: slug }, { maxRetries: 1 });
        },
        setRooms,
        setAdminUsers
      }),
    [sendWsEvent]
  );

  const loadTelemetrySummary = useCallback(async () => {
    if (!token || !canViewTelemetry) {
      return;
    }

    try {
      const summary = await api.telemetrySummary(token);
      setTelemetrySummary(summary);
    } catch (error) {
      pushLog(`telemetry summary failed: ${(error as Error).message}`);
    }
  }, [token, canViewTelemetry]);

  const chatController = useMemo(
    () =>
      new ChatController({
        pushLog,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        setLoadingOlderMessages,
        sendWsEvent,
        loadTelemetrySummary
      }),
    [sendWsEvent, loadTelemetrySummary]
  );

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
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
      setLoadingOlderMessages(false);
      setAdminUsers([]);
      setTelemetrySummary(null);
      realtimeClientRef.current?.dispose();
      realtimeClientRef.current = null;
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
    roomSlugRef.current = roomSlug;
    realtimeClientRef.current?.setRoomSlug(roomSlug);
  }, [roomSlug]);

  useEffect(() => {
    if (!token) {
      setWsState("disconnected");
      return;
    }

    const messageController = new WsMessageController({
      clearPendingRequest: (requestId) => realtimeClientRef.current?.clearPendingRequest(requestId),
      markMessageDelivery,
      setMessages,
      setLastCallPeer,
      setCallStatus,
      pushLog,
      pushCallLog,
      setRoomSlug,
      setPresence,
      trackNack: ({ requestId, eventType, code, message }) => {
        trackClientEvent(
          "ws.nack.received",
          {
            requestId,
            eventType,
            code,
            message
          },
          token
        );
      }
    });

    const client = new RealtimeClient({
      getTicket: async (authToken) => {
        const response = await api.wsTicket(authToken);
        return response.ticket;
      },
      onWsStateChange: setWsState,
      onLog: (message) => {
        pushLog(message);
        if (message === "ws error") {
          trackClientEvent("ws.error", {}, token);
        }
      },
      onMessage: (message) => messageController.handle(message),
      onConnected: () => {
        trackClientEvent("ws.connected", { roomSlug: roomSlugRef.current }, token);
      },
      onRequestResent: (requestId, eventType) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "sending");
        }
      },
      onRequestFailed: (requestId, eventType, retries) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "failed");
          trackClientEvent(
            "chat.request.failed.retries_exhausted",
            { requestId, eventType, retries },
            token
          );
        }
      }
    });

    realtimeClientRef.current = client;
    client.setRoomSlug(roomSlugRef.current);
    client.connect(token);

    return () => {
      client.dispose();
      if (realtimeClientRef.current === client) {
        realtimeClientRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    if (!token || !roomSlug) return;
    void chatController.loadRecentMessages(token, roomSlug);
  }, [token, roomSlug, chatController]);

  const loadOlderMessages = async () => {
    if (!token || !roomSlug || !messagesNextCursor || loadingOlderMessages) {
      return;
    }

    await chatController.loadOlderMessages(token, roomSlug, messagesNextCursor, loadingOlderMessages);
  };

  useEffect(() => {
    if (!token || !canPromote) return;
    api.adminUsers(token)
      .then((res) => setAdminUsers(res.users))
      .catch((error) => pushLog(`admin users failed: ${error.message}`));
  }, [token, canPromote]);

  useEffect(() => {
    if (!token || !canViewTelemetry) {
      setTelemetrySummary(null);
      return;
    }

    void loadTelemetrySummary();
  }, [token, canViewTelemetry, loadTelemetrySummary]);

  useEffect(() => {
    if (wsState !== "connected") {
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);

  useEffect(() => {
    if (!profileMenuOpen && !authMenuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insideProfile = Boolean(target && profileMenuRef.current?.contains(target));
      const insideAuth = Boolean(target && authMenuRef.current?.contains(target));
      if (!insideProfile && !insideAuth) {
        setProfileMenuOpen(false);
        setAuthMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [profileMenuOpen, authMenuOpen]);

  const beginSso = (provider: "google" | "yandex") => {
    setAuthMenuOpen(false);
    authController.beginSso(provider);
  };
  const completeSso = async () => {
    await authController.completeSso();
  };
  const logout = () => {
    setProfileMenuOpen(false);
    authController.logout();
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createRoom(token, newRoomSlug, newRoomTitle);
    if (created) {
      setNewRoomSlug("");
      setNewRoomTitle("");
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();

    const result = chatController.sendMessage(chatText, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
    }
  };

  const sendCallSignal = (eventType: "call.offer" | "call.answer" | "call.ice") => {
    callSignalingController.sendSignal(eventType as CallSignalEventType, callSignalJson, callTargetUserId);
  };

  const sendCallReject = () => {
    callSignalingController.sendReject(callTargetUserId);
  };

  const sendCallHangup = () => {
    callSignalingController.sendHangup(callTargetUserId);
  };

  const joinRoom = (slug: string) => {
    roomAdminController.joinRoom(slug);
  };

  const promote = async (userId: string) => {
    if (!token || !canPromote) return;
    await roomAdminController.promote(token, userId);
  };

  return (
    <main className="app legacy-layout">
      <header className="app-header">
        <h1 className="app-title">Boltorezka</h1>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-chip">{user.name}</span>
              <div className="profile-menu" ref={profileMenuRef}>
                <button
                  type="button"
                  className="secondary profile-icon"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  aria-label="Profile menu"
                >
                  👤
                </button>
                {profileMenuOpen ? (
                  <div className="profile-popup">
                    <button type="button" onClick={logout}>Logout</button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="auth-menu" ref={authMenuRef}>
              <button type="button" onClick={() => setAuthMenuOpen((value) => !value)}>
                Авторизоваться
              </button>
              {authMenuOpen ? (
                <div className="auth-popup">
                  <button type="button" className="provider-btn" onClick={() => beginSso("google")}> 
                    <span className="provider-icon provider-google">G</span>
                    Google
                  </button>
                  <button type="button" className="provider-btn" onClick={() => beginSso("yandex")}>
                    <span className="provider-icon provider-yandex">Я</span>
                    Yandex
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="leftcolumn">
          <section className="card compact">
            <p className="muted">auth mode: {authMode}</p>
            <p className="muted">ws: {wsState}</p>
            <div className="row">
              <button onClick={completeSso}>Complete</button>
            </div>
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
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void loadOlderMessages()}
                disabled={!messagesHasMore || loadingOlderMessages}
              >
                {loadingOlderMessages ? "Loading..." : "Load older messages"}
              </button>
              {!messagesHasMore && messages.length > 0 ? (
                <span className="muted">History fully loaded</span>
              ) : null}
            </div>
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

            <div className="stack signaling-panel">
              <h2>Call signaling (MVP)</h2>
              <p className="muted">call status: {callStatus}{lastCallPeer ? ` (${lastCallPeer})` : ""}</p>
              <input
                value={callTargetUserId}
                onChange={(e) => setCallTargetUserId(e.target.value)}
                placeholder="targetUserId (optional, empty = broadcast to room)"
              />
              <textarea
                value={callSignalJson}
                onChange={(e) => setCallSignalJson(e.target.value)}
                rows={4}
                placeholder='{"type":"offer","sdp":"..."}'
              />
              <div className="row">
                <button type="button" onClick={() => sendCallSignal("call.offer")}>Send offer</button>
                <button type="button" onClick={() => sendCallSignal("call.answer")}>Send answer</button>
                <button type="button" onClick={() => sendCallSignal("call.ice")}>Send ICE</button>
                <button type="button" className="secondary" onClick={sendCallReject}>Send reject</button>
                <button type="button" className="secondary" onClick={sendCallHangup}>Send hangup</button>
              </div>
              <div className="log call-log">
                {callEventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </div>
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

          {canViewTelemetry ? (
            <section className="card compact">
              <h2>Telemetry</h2>
              <p className="muted">day: {telemetrySummary?.day || "-"}</p>
              <div className="stack">
                <div>ack_sent: {telemetrySummary?.metrics.ack_sent ?? 0}</div>
                <div>nack_sent: {telemetrySummary?.metrics.nack_sent ?? 0}</div>
                <div>chat_sent: {telemetrySummary?.metrics.chat_sent ?? 0}</div>
                <div>chat_idempotency_hit: {telemetrySummary?.metrics.chat_idempotency_hit ?? 0}</div>
                <div>telemetry_web_event: {telemetrySummary?.metrics.telemetry_web_event ?? 0}</div>
              </div>
              <button onClick={() => void loadTelemetrySummary()}>Refresh metrics</button>
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
