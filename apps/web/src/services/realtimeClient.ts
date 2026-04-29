import type { WsIncoming, WsOutgoing } from "../domain";
import { resolveRealtimeWsBase } from "../transportRuntime";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];
const ACK_TIMEOUT_MS = 6000;
const PING_INTERVAL_MS = 15000;
// If no inbound message (incl. pong) within this window, treat the socket as
// dead and force-close it to trigger a fast reconnect. This catches scenarios
// where the OS has not yet surfaced a TCP timeout — most notably VPN toggling,
// where the old socket lingers for minutes from JS perspective while the
// server has already evicted the user from room presence.
const LIVENESS_TIMEOUT_MS = 35000;

export type WsState = "disconnected" | "connecting" | "connected";

type PendingRequest = {
  eventType: string;
  envelope: WsOutgoing;
  retries: number;
  maxRetries: number;
  createdAt: string;
};

type RealtimeClientOptions = {
  getTicket: (token: string) => Promise<string>;
  onWsStateChange: (state: WsState) => void;
  onLog: (text: string) => void;
  onMessage: (message: WsIncoming) => void;
  onConnected?: () => void;
  onRequestResent?: (requestId: string, eventType: string) => void;
  onRequestFailed?: (requestId: string, eventType: string, retries: number) => void;
};

function wsBase() {
  return resolveRealtimeWsBase();
}

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private token = "";
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private activeRoomSlug = "";
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private livenessInterval: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private ackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private static readonly PERSISTED_PENDING_KEY = "boltorezka:ws:pending:chat-send:v1";
  private static readonly PERSISTED_PENDING_LIMIT = 100;
  private static readonly PERSISTED_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
    this.hydratePersistedPendingRequests();
  }

  private canUseStorage(): boolean {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  }

  private persistPendingRequests() {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      const snapshot = Array.from(this.pendingRequests.entries())
        .filter(([, pending]) => pending.eventType === "chat.send")
        .slice(-RealtimeClient.PERSISTED_PENDING_LIMIT)
        .map(([requestId, pending]) => ({
          requestId,
          eventType: pending.eventType,
          envelope: pending.envelope,
          retries: pending.retries,
          maxRetries: pending.maxRetries,
          createdAt: pending.createdAt
        }));

      if (snapshot.length === 0) {
        window.localStorage.removeItem(RealtimeClient.PERSISTED_PENDING_KEY);
        return;
      }

      window.localStorage.setItem(RealtimeClient.PERSISTED_PENDING_KEY, JSON.stringify(snapshot));
    } catch {
      // Persistence is best-effort.
    }
  }

  private hydratePersistedPendingRequests() {
    if (!this.canUseStorage()) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(RealtimeClient.PERSISTED_PENDING_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Array<{
        requestId?: unknown;
        eventType?: unknown;
        envelope?: unknown;
        retries?: unknown;
        maxRetries?: unknown;
        createdAt?: unknown;
      }>;

      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(RealtimeClient.PERSISTED_PENDING_KEY);
        return;
      }

      const now = Date.now();
      for (const item of parsed) {
        const requestId = typeof item.requestId === "string" ? item.requestId : "";
        const eventType = typeof item.eventType === "string" ? item.eventType : "";
        const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
        const createdTs = new Date(createdAt).getTime();
        const envelope = (item.envelope && typeof item.envelope === "object")
          ? item.envelope as WsOutgoing
          : null;

        if (!requestId || eventType !== "chat.send" || !envelope) {
          continue;
        }

        if (!Number.isFinite(createdTs) || now - createdTs > RealtimeClient.PERSISTED_PENDING_TTL_MS) {
          continue;
        }

        this.pendingRequests.set(requestId, {
          eventType,
          envelope,
          retries: Number.isFinite(Number(item.retries)) ? Math.max(0, Number(item.retries)) : 0,
          maxRetries: Number.isFinite(Number(item.maxRetries)) ? Math.max(0, Number(item.maxRetries)) : 0,
          createdAt
        });
      }

      this.persistPendingRequests();
    } catch {
      // Hydration failures should not break realtime boot.
    }
  }

  connect(token: string) {
    this.token = token;
    this.isDisposed = false;
    this.openConnection();
  }

  dispose() {
    this.isDisposed = true;
    this.clearAllAckTimers();
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.reconnectAttempt = 0;
    this.options.onWsStateChange("disconnected");
  }

  setRoomSlug(roomSlug: string) {
    this.activeRoomSlug = roomSlug;
    if (this.ws?.readyState === WebSocket.OPEN && roomSlug) {
      this.sendEvent("room.join", { roomSlug }, { maxRetries: 1 });
    }
  }

  sendEvent(
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) {
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
      this.pendingRequests.set(requestId, {
        eventType,
        envelope,
        retries: 0,
        maxRetries: options.maxRetries ?? 0,
        createdAt: new Date().toISOString()
      });
      this.persistPendingRequests();
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!trackAck) {
        this.options.onLog(`ws send skipped: ${eventType} (socket is not open)`);
        return null;
      }

      this.options.onLog(`ws send queued: ${eventType} (socket is not open)`);
      this.armAckTimeout(requestId);
      return requestId;
    }

    this.ws.send(JSON.stringify(envelope));
    if (trackAck) {
      this.armAckTimeout(requestId);
    }
    return requestId;
  }

  private openConnection() {
    this.options.onWsStateChange("connecting");

    this.options
      .getTicket(this.token)
      .then((ticket) => {
        if (this.isDisposed) {
          return;
        }

        this.ws = new WebSocket(`${wsBase()}/v1/realtime/ws?ticket=${encodeURIComponent(ticket)}&client=web`);

        this.ws.onopen = () => {
          this.reconnectAttempt = 0;
          this.lastInboundAt = Date.now();
          this.options.onWsStateChange("connected");
          this.options.onLog("ws connected");
          this.options.onConnected?.();

          for (const [requestId, pending] of this.pendingRequests.entries()) {
            this.ws?.send(JSON.stringify(pending.envelope));
            this.options.onRequestResent?.(requestId, pending.eventType);
            this.armAckTimeout(requestId);
          }

          if (this.activeRoomSlug) {
            this.sendEvent("room.join", { roomSlug: this.activeRoomSlug }, { maxRetries: 1 });
          }

          this.pingInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              return;
            }
            this.sendEvent("ping", {}, { trackAck: false });
          }, PING_INTERVAL_MS);

          // Liveness watchdog: if the socket has been silent for too long,
          // assume the underlying connection is dead (e.g. user switched VPN
          // and the OS has not yet timed out the old TCP flow) and force a
          // close — onclose will schedule the reconnect.
          this.livenessInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              return;
            }
            const silentFor = Date.now() - this.lastInboundAt;
            if (silentFor > LIVENESS_TIMEOUT_MS) {
              this.options.onLog(`ws liveness timeout after ${silentFor}ms — closing socket`);
              try {
                this.ws.close();
              } catch {
                // ignore — onclose will fire either way
              }
            }
          }, 5000);
        };

        this.ws.onclose = () => {
          this.options.onWsStateChange("disconnected");
          this.options.onLog("ws disconnected");
          this.clearAllAckTimers();
          this.clearTimers();
          this.scheduleReconnect();
        };

        this.ws.onerror = () => {
          this.options.onLog("ws error");
        };

        this.ws.onmessage = (event) => {
          this.lastInboundAt = Date.now();
          try {
            const message = JSON.parse(event.data) as WsIncoming;
            this.options.onMessage(message);
          } catch {
            this.options.onLog("ws message parse error");
          }
        };
      })
      .catch((error) => {
        this.options.onLog(`ws ticket failed: ${(error as Error).message}`);
        this.scheduleReconnect();
      });
  }

  private scheduleReconnect() {
    if (this.isDisposed) {
      return;
    }

    const index = Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1);
    const delay = RECONNECT_DELAYS_MS[index];
    this.reconnectAttempt += 1;
    this.options.onWsStateChange("connecting");
    this.options.onLog(`ws reconnect in ${Math.round(delay / 1000)}s`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.isDisposed) {
        return;
      }
      this.openConnection();
    }, delay);
  }

  private armAckTimeout(requestId: string) {
    this.clearAckTimer(requestId);

    const timer = setTimeout(() => {
      const pending = this.pendingRequests.get(requestId);
      if (!pending) {
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.armAckTimeout(requestId);
        return;
      }

      if (pending.retries >= pending.maxRetries) {
        this.pendingRequests.delete(requestId);
        this.persistPendingRequests();
        this.clearAckTimer(requestId);
        this.options.onRequestFailed?.(requestId, pending.eventType, pending.retries);
        this.options.onLog(`ws request failed after retries: ${pending.eventType}`);
        return;
      }

      pending.retries += 1;
      this.ws.send(JSON.stringify(pending.envelope));
      this.options.onRequestResent?.(requestId, pending.eventType);
      this.options.onLog(`ws retry ${pending.eventType} #${pending.retries}`);
      this.armAckTimeout(requestId);
    }, ACK_TIMEOUT_MS);

    this.ackTimers.set(requestId, timer);
  }

  clearPendingRequest(requestId: string) {
    this.pendingRequests.delete(requestId);
    this.persistPendingRequests();
    this.clearAckTimer(requestId);
  }

  private clearAckTimer(requestId: string) {
    const timer = this.ackTimers.get(requestId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.ackTimers.delete(requestId);
  }

  private clearAllAckTimers() {
    for (const timer of this.ackTimers.values()) {
      clearTimeout(timer);
    }
    this.ackTimers.clear();
  }

  private clearTimers() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.livenessInterval) {
      clearInterval(this.livenessInterval);
      this.livenessInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}