import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../api";
import type { RoomMemberPreference } from "../../domain";

type UseMemberPreferenceActionsArgs = {
  token: string;
  pushLog: (text: string) => void;
  pushToast: (message: string) => void;
  t: (key: string) => string;
  setMemberPreferencesByUserId: Dispatch<SetStateAction<Record<string, RoomMemberPreference>>>;
};

export function useMemberPreferenceActions({
  token,
  pushLog,
  pushToast,
  t,
  setMemberPreferencesByUserId
}: UseMemberPreferenceActionsArgs) {
  const saveMemberPreference = useCallback(async (targetUserId: string, input: { volume: number; note: string }) => {
    if (!token || !targetUserId) {
      return;
    }

    const nextPreference: RoomMemberPreference = {
      targetUserId,
      volume: Math.max(0, Math.min(100, Math.round(Number(input.volume) || 0))),
      note: String(input.note || "").trim().slice(0, 32),
      updatedAt: new Date().toISOString()
    };

    setMemberPreferencesByUserId((prev) => ({
      ...prev,
      [targetUserId]: nextPreference
    }));

    try {
      const response = await api.upsertMemberPreference(token, targetUserId, {
        volume: nextPreference.volume,
        note: nextPreference.note
      });

      setMemberPreferencesByUserId((prev) => ({
        ...prev,
        [targetUserId]: response.preference
      }));
    } catch (error) {
      pushLog(`member preference save failed: ${(error as Error).message}`);
      pushToast(t("toast.serverError"));
    }
  }, [pushLog, pushToast, setMemberPreferencesByUserId, t, token]);

  return {
    saveMemberPreference
  };
}
