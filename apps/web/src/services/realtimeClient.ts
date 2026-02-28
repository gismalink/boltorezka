import type { WsIncoming, WsOutgoing } from "../types";

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000];
const ACK_TIMEOUT_MS = 6000;

export type WsState = "disconnected" | "connecting" | "connected";

type PendingRequest = {
  eventType: string;
  envelope: WsOutgoing;
  retries: number;
  maxRetries: number;
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
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private token = "";
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private activeRoomSlug = "general";
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private ackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: RealtimeClientOptions) {
    this.options = options;
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendEvent("room.join", { roomSlug }, { maxRetries: 1 });
    }
  }

  sendEvent(
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.options.onLog(`ws send skipped: ${eventType} (socket is not open)`);
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
      this.pendingRequests.set(requestId, {
        eventType,
        envelope,
        retries: 0,
        maxRetries: options.maxRetries ?? 0
      });
      this.armAckTimeout(requestId);
    }

    this.ws.send(JSON.stringify(envelope));
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
          this.options.onWsStateChange("connected");
          this.options.onLog("ws connected");
          this.options.onConnected?.();

          for (const [requestId, pending] of this.pendingRequests.entries()) {
            this.ws?.send(JSON.stringify(pending.envelope));
            this.options.onRequestResent?.(requestId, pending.eventType);
            this.armAckTimeout(requestId);
          }

          this.sendEvent("room.join", { roomSlug: this.activeRoomSlug }, { maxRetries: 1 });

          this.pingInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              return;
            }
            this.sendEvent("ping", {}, { trackAck: false });
          }, 15000);
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}