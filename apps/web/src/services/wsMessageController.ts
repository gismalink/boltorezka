import type { Dispatch, SetStateAction } from "react";
import type { Message, PresenceMember, WsIncoming } from "../domain";
import type { CallStatus } from "./callSignalingController";

type WsMessageControllerOptions = {
  clearPendingRequest: (requestId: string) => void;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setLastCallPeer: (peer: string) => void;
  setCallStatus: (status: CallStatus) => void;
  pushLog: (text: string) => void;
  pushCallLog: (text: string) => void;
  pushToast: (message: string) => void;
  setRoomSlug: (slug: string) => void;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  trackNack: (data: {
    requestId: string;
    eventType: string;
    code: string;
    message: string;
  }) => void;
  onCallSignal?: (
    eventType: "call.offer" | "call.answer" | "call.ice",
    payload: { fromUserId?: string; fromUserName?: string; signal?: Record<string, unknown> }
  ) => void;
  onCallTerminal?: (
    eventType: "call.reject" | "call.hangup",
    payload: { fromUserId?: string; fromUserName?: string; reason?: string | null }
  ) => void;
};

export class WsMessageController {
  private readonly options: WsMessageControllerOptions;

  constructor(options: WsMessageControllerOptions) {
    this.options = options;
  }

  handle(message: WsIncoming) {
    if (message.type === "ack") {
      const requestId = String(message.payload?.requestId || "").trim();
      const eventType = String(message.payload?.eventType || "").trim();
      if (requestId) {
        this.options.clearPendingRequest(requestId);
        if (eventType === "chat.send") {
          this.options.markMessageDelivery(requestId, "delivered", {
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

      this.options.trackNack({
        requestId,
        eventType,
        code,
        message: nackMessage
      });

      if (requestId) {
        this.options.clearPendingRequest(requestId);
        if (eventType === "chat.send") {
          this.options.markMessageDelivery(requestId, "failed");
        }
      }

      this.options.pushLog(`nack ${eventType}: ${code} ${nackMessage}`);
      return;
    }

    if (message.type === "chat.message" && message.payload) {
      const senderRequestId =
        typeof message.payload.senderRequestId === "string"
          ? message.payload.senderRequestId
          : undefined;

      if (senderRequestId) {
        this.options.clearPendingRequest(senderRequestId);
        let replaced = false;
        this.options.setMessages((prev) => {
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
        this.options.setMessages((prev) => [
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

    if (
      message.type === "call.offer" ||
      message.type === "call.answer" ||
      message.type === "call.ice"
    ) {
      const fromUserName = String(message.payload?.fromUserName || message.payload?.fromUserId || "unknown");
      const hasSignal = Boolean(message.payload?.signal && typeof message.payload.signal === "object");
      this.options.setLastCallPeer(fromUserName);
      if (message.type === "call.offer") {
        this.options.setCallStatus("ringing");
      }
      if (message.type === "call.answer") {
        this.options.setCallStatus("active");
      }
      this.options.pushCallLog(
        `${message.type} from ${fromUserName} (${hasSignal ? "signal" : "no-signal"})`
      );
      this.options.onCallSignal?.(message.type, {
        fromUserId: String(message.payload?.fromUserId || message.payload?.userId || "").trim() || undefined,
        fromUserName: String(message.payload?.fromUserName || message.payload?.userName || "").trim() || undefined,
        signal:
          message.payload?.signal && typeof message.payload.signal === "object"
            ? (message.payload.signal as Record<string, unknown>)
            : undefined
      });
    }

    if (message.type === "call.reject") {
      const fromUserName = String(message.payload?.fromUserName || message.payload?.fromUserId || "unknown");
      const reason = String(message.payload?.reason || "").trim();
      this.options.setLastCallPeer(fromUserName);
      this.options.setCallStatus("idle");
      this.options.pushCallLog(`call.reject from ${fromUserName}${reason ? ` (${reason})` : ""}`);
      this.options.onCallTerminal?.("call.reject", {
        fromUserId: String(message.payload?.fromUserId || "").trim() || undefined,
        fromUserName: String(message.payload?.fromUserName || "").trim() || undefined,
        reason: reason || null
      });
    }

    if (message.type === "call.hangup") {
      const fromUserName = String(message.payload?.fromUserName || message.payload?.fromUserId || "unknown");
      const reason = String(message.payload?.reason || "").trim();
      this.options.setLastCallPeer(fromUserName);
      this.options.setCallStatus("idle");
      this.options.pushCallLog(`call.hangup from ${fromUserName}${reason ? ` (${reason})` : ""}`);
      this.options.onCallTerminal?.("call.hangup", {
        fromUserId: String(message.payload?.fromUserId || "").trim() || undefined,
        fromUserName: String(message.payload?.fromUserName || "").trim() || undefined,
        reason: reason || null
      });
    }

    if (message.type === "room.joined") {
      this.options.setRoomSlug(message.payload.roomSlug);
    }

    if (message.type === "room.presence") {
      const roomSlug = String(message.payload?.roomSlug || "").trim();
      const users = Array.isArray(message.payload?.users)
        ? (message.payload.users as Array<{ userId?: string; userName?: string }>)
            .map((item: { userId?: string; userName?: string }) => {
              const userId = String(item?.userId || "").trim();
              const userName = String(item?.userName || "").trim();
              if (!userId || !userName) {
                return null;
              }
              return { userId, userName } satisfies PresenceMember;
            })
            .filter((item: PresenceMember | null): item is PresenceMember => Boolean(item))
        : [];

      if (roomSlug) {
        this.options.setRoomsPresenceBySlug((prev) => ({
          ...prev,
          [roomSlug]: users.map((item: PresenceMember) => item.userName)
        }));
        this.options.setRoomsPresenceDetailsBySlug((prev) => ({
          ...prev,
          [roomSlug]: users
        }));
      }
    }

    if (message.type === "rooms.presence") {
      const rooms = Array.isArray(message.payload?.rooms) ? message.payload.rooms : [];
      const next: Record<string, string[]> = {};
      const detailsNext: Record<string, PresenceMember[]> = {};

      rooms.forEach((room: { roomSlug?: string; users?: Array<{ userId?: string; userName?: string }> }) => {
        const roomSlug = String(room?.roomSlug || "").trim();
        if (!roomSlug) {
          return;
        }

        const users = Array.isArray(room?.users)
          ? room.users
              .map((item) => {
                const userId = String(item?.userId || "").trim();
                const userName = String(item?.userName || "").trim();
                if (!userId || !userName) {
                  return null;
                }
                return { userId, userName } satisfies PresenceMember;
              })
              .filter((item): item is PresenceMember => Boolean(item))
          : [];

        next[roomSlug] = users.map((item) => item.userName);
        detailsNext[roomSlug] = users;
      });

      this.options.setRoomsPresenceBySlug(next);
      this.options.setRoomsPresenceDetailsBySlug(detailsNext);
    }

    if (message.type === "error") {
      const code = String(message.payload?.code || "ServerError");
      const errorMessage = String(message.payload?.message || "Unexpected websocket error");
      if (code === "ChannelSessionMoved") {
        this.options.setRoomSlug("general");
        this.options.pushToast(errorMessage);
      } else {
        this.options.pushToast(errorMessage);
      }
      this.options.pushLog(`ws error ${code}: ${errorMessage}`);
    }
  }
}