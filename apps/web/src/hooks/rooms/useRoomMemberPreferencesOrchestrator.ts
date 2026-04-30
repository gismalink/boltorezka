import type { Dispatch, SetStateAction } from "react";
import { useMemberPreferencesSync } from "../app/effects/useMemberPreferencesSync";
import type { PresenceMember, RoomMemberPreference } from "../../domain";
import { useMemberPreferenceActions } from "./useMemberPreferenceActions";

type UseRoomMemberPreferencesOrchestratorArgs = {
  token: string;
  currentUserId: string;
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>;
  setMemberPreferencesByUserId: Dispatch<SetStateAction<Record<string, RoomMemberPreference>>>;
  pushLog: (text: string) => void;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useRoomMemberPreferencesOrchestrator({
  token,
  currentUserId,
  roomsPresenceDetailsBySlug,
  setMemberPreferencesByUserId,
  pushLog,
  pushToast,
  t
}: UseRoomMemberPreferencesOrchestratorArgs) {
  const { saveMemberPreference, applyLocalMemberVolume } = useMemberPreferenceActions({
    token,
    pushLog,
    pushToast,
    t,
    setMemberPreferencesByUserId
  });

  useMemberPreferencesSync({
    token,
    currentUserId,
    roomsPresenceDetailsBySlug,
    setMemberPreferencesByUserId,
    pushLog
  });

  return {
    saveMemberPreference,
    applyLocalMemberVolume
  };
}
