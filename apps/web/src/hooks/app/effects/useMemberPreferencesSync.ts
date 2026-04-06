import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { PresenceMember, RoomMemberPreference } from "../../../domain";

type UseMemberPreferencesSyncArgs = {
  token: string;
  currentUserId: string;
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>;
  setMemberPreferencesByUserId: Dispatch<SetStateAction<Record<string, RoomMemberPreference>>>;
  pushLog: (text: string) => void;
};

export function deriveMemberPreferenceTargetUserIds(
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>,
  currentUserId: string
): string[] {
  const normalizedCurrentUserId = String(currentUserId || "").trim();

  return Array.from(new Set(
    Object.values(roomsPresenceDetailsBySlug)
      .flat()
      .map((member) => String(member.userId || "").trim())
      .filter((memberUserId) => memberUserId.length > 0 && memberUserId !== normalizedCurrentUserId)
  ));
}

export function useMemberPreferencesSync({
  token,
  currentUserId,
  roomsPresenceDetailsBySlug,
  setMemberPreferencesByUserId,
  pushLog
}: UseMemberPreferencesSyncArgs) {
  const lastRequestedKeyRef = useRef("");

  useEffect(() => {
    if (!token || !currentUserId) {
      setMemberPreferencesByUserId({});
      lastRequestedKeyRef.current = "";
      return;
    }

    const targetUserIds = deriveMemberPreferenceTargetUserIds(roomsPresenceDetailsBySlug, currentUserId);
    const normalizedTargetUserIds = [...targetUserIds].sort((a, b) => a.localeCompare(b));
    const requestKey = normalizedTargetUserIds.join(",");

    if (normalizedTargetUserIds.length === 0) {
      lastRequestedKeyRef.current = "";
      return;
    }

    if (requestKey === lastRequestedKeyRef.current) {
      return;
    }
    lastRequestedKeyRef.current = requestKey;

    let active = true;
    void (async () => {
      try {
        const response = await api.memberPreferences(token, normalizedTargetUserIds);
        if (!active) {
          return;
        }

        setMemberPreferencesByUserId((prev) => {
          const next = { ...prev };
          response.preferences.forEach((preference) => {
            next[preference.targetUserId] = preference;
          });
          return next;
        });
      } catch (error) {
        // Allow retry for the same target set after transient network errors.
        lastRequestedKeyRef.current = "";
        pushLog(`member preferences load failed: ${(error as Error).message}`);
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserId, pushLog, roomsPresenceDetailsBySlug, setMemberPreferencesByUserId, token]);
}