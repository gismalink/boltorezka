import { useAppShellLifecycleEffects } from "./useAppShellLifecycleEffects";
import { useRoomSlugPersistence } from "./useRoomSlugPersistence";

type UseAppShellRoomRuntimeEffectsInput = {
  shellLifecycle: Parameters<typeof useAppShellLifecycleEffects>[0];
  roomSlugPersistence: Parameters<typeof useRoomSlugPersistence>[0];
};

export function useAppShellRoomRuntimeEffects({
  shellLifecycle,
  roomSlugPersistence
}: UseAppShellRoomRuntimeEffectsInput) {
  useAppShellLifecycleEffects(shellLifecycle);
  useRoomSlugPersistence(roomSlugPersistence);
}