import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { AuthController } from "./services/authController";
import { CallSignalingController, type CallSignalEventType, type CallStatus } from "./services/callSignalingController";
import { ChatController } from "./services/chatController";
import { RealtimeClient } from "./services/realtimeClient";
import { RoomAdminController } from "./services/roomAdminController";
import { TooltipPortal } from "./TooltipPortal";
import { WsMessageController } from "./services/wsMessageController";
import { trackClientEvent } from "./telemetry";
import type {
  Message,
  MessagesCursor,
  Room,
  RoomKind,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "./types";

const MAX_CHAT_RETRIES = 3;

const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  text: "Text",
  text_voice: "Text + Voice",
  text_voice_video: "Text + Voice + Video"
};

const ROOM_KIND_ICON_CLASS: Record<RoomKind, string> = {
  text: "bi-hash",
  text_voice: "bi-broadcast",
  text_voice_video: "bi-camera-video"
};

export function App() {
  const [token, setToken] = useState(localStorage.getItem("boltorezka_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
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
  const [newRoomKind, setNewRoomKind] = useState<RoomKind>("text");
  const [newRoomCategoryId, setNewRoomCategoryId] = useState<string>("none");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [categoryPopupOpen, setCategoryPopupOpen] = useState(false);
  const [channelPopupOpen, setChannelPopupOpen] = useState(false);
  const [channelSettingsPopupOpenId, setChannelSettingsPopupOpenId] = useState<string | null>(null);
  const [editingRoomTitle, setEditingRoomTitle] = useState("");
  const [editingRoomKind, setEditingRoomKind] = useState<RoomKind>("text");
  const [editingRoomCategoryId, setEditingRoomCategoryId] = useState<string>("none");
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const roomSlugRef = useRef(roomSlug);
  const autoSsoAttemptedRef = useRef(false);
  const authMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryPopupRef = useRef<HTMLDivElement | null>(null);
  const channelPopupRef = useRef<HTMLDivElement | null>(null);

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
        setRoomsTree,
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
    if (token || authMode !== "sso" || autoSsoAttemptedRef.current) {
      return;
    }

    autoSsoAttemptedRef.current = true;
    void authController.completeSso({ silent: true });
  }, [token, authMode, authController]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRooms([]);
      setRoomsTree(null);
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

    void roomAdminController.loadRoomTree(token);
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
    if (!profileMenuOpen && !authMenuOpen && !categoryPopupOpen && !channelPopupOpen && !channelSettingsPopupOpenId) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insideProfile = Boolean(target && profileMenuRef.current?.contains(target));
      const insideAuth = Boolean(target && authMenuRef.current?.contains(target));
      const insideCategoryPopup = Boolean(target && categoryPopupRef.current?.contains(target));
      const insideChannelPopup = Boolean(target && channelPopupRef.current?.contains(target));
      const insideChannelSettings = Boolean(target && target instanceof HTMLElement && target.closest(".channel-settings-anchor"));

      if (!insideProfile && !insideAuth && !insideCategoryPopup && !insideChannelPopup && !insideChannelSettings) {
        setProfileMenuOpen(false);
        setAuthMenuOpen(false);
        setCategoryPopupOpen(false);
        setChannelPopupOpen(false);
        setChannelSettingsPopupOpenId(null);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [profileMenuOpen, authMenuOpen, categoryPopupOpen, channelPopupOpen, channelSettingsPopupOpenId]);

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

    const created = await roomAdminController.createRoom(token, newRoomSlug, newRoomTitle, {
      kind: newRoomKind,
      categoryId: newRoomCategoryId === "none" ? null : newRoomCategoryId
    });
    if (created) {
      setNewRoomSlug("");
      setNewRoomTitle("");
      setChannelPopupOpen(false);
    }
  };

  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createCategory(token, newCategorySlug, newCategoryTitle);
    if (created) {
      setNewCategorySlug("");
      setNewCategoryTitle("");
      setCategoryPopupOpen(false);
    }
  };

  const openCreateChannelPopup = (categoryId: string | null = null) => {
    setNewRoomCategoryId(categoryId || "none");
    setChannelPopupOpen(true);
  };

  const openChannelSettingsPopup = (room: Room) => {
    setEditingRoomTitle(room.title);
    setEditingRoomKind(room.kind);
    setEditingRoomCategoryId(room.category_id || "none");
    setChannelSettingsPopupOpenId(room.id);
  };

  const saveChannelSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const updated = await roomAdminController.updateRoom(token, channelSettingsPopupOpenId, {
      title: editingRoomTitle,
      kind: editingRoomKind,
      categoryId: editingRoomCategoryId === "none" ? null : editingRoomCategoryId
    });

    if (updated) {
      setChannelSettingsPopupOpenId(null);
    }
  };

  const moveChannel = async (direction: "up" | "down") => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    await roomAdminController.moveRoom(token, channelSettingsPopupOpenId, direction);
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

  const categorizedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    roomsTree?.categories.forEach((category) => {
      category.channels.forEach((channel) => ids.add(channel.id));
    });
    return ids;
  }, [roomsTree]);

  const uncategorizedRooms = useMemo(() => {
    if (roomsTree) {
      return roomsTree.uncategorized;
    }

    return rooms.filter((room) => !categorizedRoomIds.has(room.id));
  }, [roomsTree, rooms, categorizedRoomIds]);

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
                  <i className="bi bi-person-circle" aria-hidden="true" />
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
      <TooltipPortal />

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
            <div className="section-heading-row">
              <h2>Rooms</h2>
              {canCreateRooms ? (
                <div className="row-actions">
                  <div className="popup-anchor" ref={categoryPopupRef}>
                    <button
                      type="button"
                      className="secondary icon-btn"
                      aria-label="Create category"
                      data-tooltip="Create category"
                      onClick={() => {
                        setChannelPopupOpen(false);
                        setCategoryPopupOpen((value) => !value);
                      }}
                    >
                      <i className="bi bi-folder-plus" aria-hidden="true" />
                    </button>
                    {categoryPopupOpen ? (
                      <div className="floating-popup settings-popup">
                        <form className="stack" onSubmit={createCategory}>
                          <h3 className="subheading">Create category</h3>
                          <input value={newCategorySlug} onChange={(e) => setNewCategorySlug(e.target.value)} placeholder="category slug" />
                          <input value={newCategoryTitle} onChange={(e) => setNewCategoryTitle(e.target.value)} placeholder="category title" />
                          <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                        </form>
                      </div>
                    ) : null}
                  </div>

                  <div className="popup-anchor" ref={channelPopupRef}>
                    <button
                      type="button"
                      className="secondary icon-btn"
                      aria-label="Create channel"
                      data-tooltip="Create channel"
                      onClick={() => {
                        setCategoryPopupOpen(false);
                        setChannelPopupOpen((value) => !value);
                      }}
                    >
                      <i className="bi bi-plus-lg" aria-hidden="true" />
                    </button>
                    {channelPopupOpen ? (
                      <div className="floating-popup settings-popup">
                        <form className="stack" onSubmit={createRoom}>
                          <h3 className="subheading">Create channel</h3>
                          <input value={newRoomSlug} onChange={(e) => setNewRoomSlug(e.target.value)} placeholder="channel slug" />
                          <input value={newRoomTitle} onChange={(e) => setNewRoomTitle(e.target.value)} placeholder="channel title" />
                          <div className="row">
                            <select value={newRoomKind} onChange={(e) => setNewRoomKind(e.target.value as RoomKind)}>
                              <option value="text">Text</option>
                              <option value="text_voice">Text + Voice</option>
                              <option value="text_voice_video">Text + Voice + Video</option>
                            </select>
                            <select value={newRoomCategoryId} onChange={(e) => setNewRoomCategoryId(e.target.value)}>
                              <option value="none">No category</option>
                              {(roomsTree?.categories || []).map((category) => (
                                <option key={category.id} value={category.id}>{category.title}</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {canCreateRooms ? (
              <p className="muted compact-hint">Use icon buttons to create categories/channels.</p>
            ) : (
              <p className="muted">Only admin/super_admin can create rooms.</p>
            )}

            {(roomsTree?.categories || []).map((category) => (
              <div key={category.id} className="category-block">
                <div className="category-title-row">
                  <div className="category-title">{category.title}</div>
                  {canCreateRooms ? (
                    <button
                      type="button"
                      className="secondary icon-btn tiny"
                      aria-label="Create channel in category"
                      data-tooltip="Create channel in category"
                      onClick={() => openCreateChannelPopup(category.id)}
                    >
                      <i className="bi bi-plus-lg" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <ul className="rooms-list">
                  {category.channels.map((room) => (
                    <li key={room.id}>
                      <div className="channel-row">
                        <button
                          className={`secondary room-btn ${roomSlug === room.slug ? "room-btn-active" : ""}`}
                          onClick={() => joinRoom(room.slug)}
                        >
                          <i className={`bi ${ROOM_KIND_ICON_CLASS[room.kind]}`} aria-hidden="true" />
                          <span>{room.title}</span>
                          <span className="muted"> · {ROOM_KIND_LABELS[room.kind]}</span>
                        </button>
                        {canCreateRooms ? (
                          <div className="channel-settings-anchor">
                            <button
                              type="button"
                              className="secondary icon-btn tiny channel-action-btn"
                              data-tooltip="Configure channel"
                              aria-label="Configure channel"
                              onClick={() => openChannelSettingsPopup(room)}
                            >
                              <i className="bi bi-gear" aria-hidden="true" />
                            </button>
                            {channelSettingsPopupOpenId === room.id ? (
                              <div className="floating-popup settings-popup channel-settings-popup">
                                <form className="stack" onSubmit={saveChannelSettings}>
                                  <h3 className="subheading">Channel settings</h3>
                                  <input value={editingRoomTitle} onChange={(e) => setEditingRoomTitle(e.target.value)} placeholder="channel title" />
                                  <div className="row">
                                    <select value={editingRoomKind} onChange={(e) => setEditingRoomKind(e.target.value as RoomKind)}>
                                      <option value="text">Text</option>
                                      <option value="text_voice">Text + Voice</option>
                                      <option value="text_voice_video">Text + Voice + Video</option>
                                    </select>
                                    <select value={editingRoomCategoryId} onChange={(e) => setEditingRoomCategoryId(e.target.value)}>
                                      <option value="none">No category</option>
                                      {(roomsTree?.categories || []).map((category) => (
                                        <option key={category.id} value={category.id}>{category.title}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="row">
                                    <button type="button" className="secondary" onClick={() => void moveChannel("up")}> 
                                      <i className="bi bi-arrow-up" aria-hidden="true" /> Up
                                    </button>
                                    <button type="button" className="secondary" onClick={() => void moveChannel("down")}> 
                                      <i className="bi bi-arrow-down" aria-hidden="true" /> Down
                                    </button>
                                  </div>
                                  <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                                </form>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {uncategorizedRooms.length > 0 ? (
              <div className="category-block">
                <div className="category-title">Uncategorized</div>
                <ul className="rooms-list">
                  {uncategorizedRooms.map((room) => (
                    <li key={room.id}>
                      <div className="channel-row">
                        <button
                          className={`secondary room-btn ${roomSlug === room.slug ? "room-btn-active" : ""}`}
                          onClick={() => joinRoom(room.slug)}
                        >
                          <i className={`bi ${ROOM_KIND_ICON_CLASS[room.kind]}`} aria-hidden="true" />
                          <span>{room.title}</span>
                          <span className="muted"> · {ROOM_KIND_LABELS[room.kind]}</span>
                        </button>
                        {canCreateRooms ? (
                          <div className="channel-settings-anchor">
                            <button
                              type="button"
                              className="secondary icon-btn tiny channel-action-btn"
                              data-tooltip="Configure channel"
                              aria-label="Configure channel"
                              onClick={() => openChannelSettingsPopup(room)}
                            >
                              <i className="bi bi-gear" aria-hidden="true" />
                            </button>
                            {channelSettingsPopupOpenId === room.id ? (
                              <div className="floating-popup settings-popup channel-settings-popup">
                                <form className="stack" onSubmit={saveChannelSettings}>
                                  <h3 className="subheading">Channel settings</h3>
                                  <input value={editingRoomTitle} onChange={(e) => setEditingRoomTitle(e.target.value)} placeholder="channel title" />
                                  <div className="row">
                                    <select value={editingRoomKind} onChange={(e) => setEditingRoomKind(e.target.value as RoomKind)}>
                                      <option value="text">Text</option>
                                      <option value="text_voice">Text + Voice</option>
                                      <option value="text_voice_video">Text + Voice + Video</option>
                                    </select>
                                    <select value={editingRoomCategoryId} onChange={(e) => setEditingRoomCategoryId(e.target.value)}>
                                      <option value="none">No category</option>
                                      {(roomsTree?.categories || []).map((category) => (
                                        <option key={category.id} value={category.id}>{category.title}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="row">
                                    <button type="button" className="secondary" onClick={() => void moveChannel("up")}> 
                                      <i className="bi bi-arrow-up" aria-hidden="true" /> Up
                                    </button>
                                    <button type="button" className="secondary" onClick={() => void moveChannel("down")}> 
                                      <i className="bi bi-arrow-down" aria-hidden="true" /> Down
                                    </button>
                                  </div>
                                  <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                                </form>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
