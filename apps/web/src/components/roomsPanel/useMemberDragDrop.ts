import { type DragEvent, useState } from "react";
import type { Room } from "../../domain";
import type { RoomsPanelProps } from "../types";

type MemberDragPayload = { userId: string; userName: string; fromRoomSlug: string };

function hasMemberDragPayload(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer.types || []);
  return types.includes("application/x-boltorezka-member")
    || types.includes("application/x-boltorezka-member-from-room")
    || types.includes("text/plain");
}

function resolveMemberDragPayload(event: DragEvent): MemberDragPayload | null {
  const payload =
    event.dataTransfer.getData("application/x-boltorezka-member")
    || event.dataTransfer.getData("text/plain");
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<MemberDragPayload>;
    const userId = String(parsed.userId || "").trim();
    const userName = String(parsed.userName || "").trim();
    const fromRoomSlug = String(parsed.fromRoomSlug || "").trim();
    if (!userId || !fromRoomSlug) {
      return null;
    }
    return { userId, userName, fromRoomSlug };
  } catch {
    return null;
  }
}

function resolveDragSourceRoom(event: DragEvent): string {
  const directRoomSlug = event.dataTransfer.getData("application/x-boltorezka-member-from-room");
  if (directRoomSlug) {
    return directRoomSlug;
  }
  const payload = event.dataTransfer.getData("application/x-boltorezka-member");
  if (!payload) {
    return "";
  }
  try {
    const parsed = JSON.parse(payload) as { fromRoomSlug?: string };
    return String(parsed.fromRoomSlug || "").trim();
  } catch {
    return "";
  }
}

type UseMemberDragDropParams = Pick<
  RoomsPanelProps,
  | "onLoadServerMemberProfile"
  | "onSetServerMemberHiddenRoomAccess"
  | "onMoveRoomMember"
> & {
  room: Room;
  canKickMembers: boolean;
};

export function useMemberDragDrop({
  room,
  canKickMembers,
  onLoadServerMemberProfile,
  onSetServerMemberHiddenRoomAccess,
  onMoveRoomMember
}: UseMemberDragDropParams) {
  const [dropTargetActive, setDropTargetActive] = useState(false);

  const startDragMember = (event: DragEvent, userId: string, userName: string) => {
    const payload = JSON.stringify({
      userId,
      userName,
      fromRoomSlug: room.slug
    });
    event.dataTransfer.setData("application/x-boltorezka-member", payload);
    // Safari may ignore custom MIME types during dragover, keep plain-text fallback.
    event.dataTransfer.setData("text/plain", payload);
    event.dataTransfer.setData("application/x-boltorezka-member-from-room", room.slug);
    event.dataTransfer.effectAllowed = "move";
  };

  const onRoomDragOver = (event: DragEvent) => {
    if (!canKickMembers) {
      return;
    }

    if (!hasMemberDragPayload(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const fromRoomSlug = resolveDragSourceRoom(event);
    if (fromRoomSlug && fromRoomSlug === room.slug) {
      return;
    }

    setDropTargetActive(true);
  };

  const onRoomDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropTargetActive(false);

    if (!canKickMembers) {
      return;
    }

    const payload = resolveMemberDragPayload(event);
    if (!payload) {
      return;
    }

    const fromRoomSlug = resolveDragSourceRoom(event) || payload.fromRoomSlug;
    if (!payload.userId || !fromRoomSlug || fromRoomSlug === room.slug) {
      return;
    }

    void (async () => {
      if (room.is_hidden) {
        try {
          const profile = await onLoadServerMemberProfile(payload.userId);
          const currentRoomIds = Array.isArray(profile?.hiddenRoomAccess)
            ? profile.hiddenRoomAccess.map((item) => item.roomId)
            : [];
          const nextRoomIds = Array.from(new Set([...currentRoomIds, room.id]));
          const granted = await onSetServerMemberHiddenRoomAccess(payload.userId, nextRoomIds);
          if (!granted) {
            return;
          }
        } catch {
          return;
        }
      }

      onMoveRoomMember(fromRoomSlug, room.slug, payload.userId, payload.userName || payload.userId);
    })();
  };

  const onRoomDragLeave = () => setDropTargetActive(false);

  return { dropTargetActive, startDragMember, onRoomDragOver, onRoomDrop, onRoomDragLeave };
}
