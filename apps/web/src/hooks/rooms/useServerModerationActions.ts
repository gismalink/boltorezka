import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../api";
import type { AudioQuality } from "../../domain";
import type { RoomAdminController } from "../../services";

type UseServerModerationActionsArgs = {
  token: string;
  canManageUsers: boolean;
  canPromote: boolean;
  canManageAudioQuality: boolean;
  roomAdminController: RoomAdminController;
  pushLog: (text: string) => void;
  setServerAudioQuality: Dispatch<SetStateAction<AudioQuality>>;
  setServerAudioQualitySaving: Dispatch<SetStateAction<boolean>>;
};

export function useServerModerationActions({
  token,
  canManageUsers,
  canPromote,
  canManageAudioQuality,
  roomAdminController,
  pushLog,
  setServerAudioQuality,
  setServerAudioQualitySaving
}: UseServerModerationActionsArgs) {
  const promote = useCallback(async (userId: string) => {
    if (!token || !canPromote) {
      return;
    }

    await roomAdminController.promote(token, userId);
  }, [canPromote, roomAdminController, token]);

  const demote = useCallback(async (userId: string) => {
    if (!token || !canPromote) {
      return;
    }

    await roomAdminController.demote(token, userId);
  }, [canPromote, roomAdminController, token]);

  const setUserBan = useCallback(async (userId: string, banned: boolean) => {
    if (!token || !canPromote) {
      return;
    }

    await roomAdminController.setBan(token, userId, banned);
  }, [canPromote, roomAdminController, token]);

  const setUserAccessState = useCallback(async (userId: string, accessState: "pending" | "active" | "blocked") => {
    if (!token || !canManageUsers) {
      return;
    }

    await roomAdminController.setAccessState(token, userId, accessState);
  }, [canManageUsers, roomAdminController, token]);

  const deleteUser = useCallback(async (userId: string) => {
    if (!token || !canPromote) {
      return;
    }

    await roomAdminController.deleteUser(token, userId);
  }, [canPromote, roomAdminController, token]);

  const forceDeleteUserNow = useCallback(async (userId: string) => {
    if (!token || !canPromote) {
      return;
    }

    await roomAdminController.forceDeleteUserNow(token, userId);
  }, [canPromote, roomAdminController, token]);

  const setServerAudioQualityValue = useCallback(async (value: AudioQuality) => {
    setServerAudioQuality(value);

    if (!token || !canManageAudioQuality) {
      return;
    }

    setServerAudioQualitySaving(true);
    try {
      const response = await api.updateServerAudioQuality(token, value);
      setServerAudioQuality(response.audioQuality);
      pushLog(`server audio quality updated: ${response.audioQuality}`);
    } catch (error) {
      pushLog(`server audio quality update failed: ${(error as Error).message}`);
      try {
        const current = await api.serverAudioQuality(token);
        setServerAudioQuality(current.audioQuality);
      } catch {
        setServerAudioQuality("standard");
      }
    } finally {
      setServerAudioQualitySaving(false);
    }
  }, [canManageAudioQuality, pushLog, setServerAudioQuality, setServerAudioQualitySaving, token]);

  return {
    promote,
    demote,
    setUserBan,
    setUserAccessState,
    deleteUser,
    forceDeleteUserNow,
    setServerAudioQualityValue
  };
}
