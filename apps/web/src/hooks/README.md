# Hooks Map

## Top-level hooks

- `app/state/*` - app state composition hooks extracted from `App.tsx`:
	- `app/state/useAppUiState.ts`
	- `app/state/useAppEventLogs.ts`
	- `app/state/useCurrentRoomSnapshot.ts`
	- `app/state/useToastQueue.ts`
- `app/effects/*` - app side-effects and persistence hooks:
	- `app/effects/useBuildVersionSync.ts`
	- `app/effects/usePersistedClientSettings.ts`
- `app/media/*` - app media lifecycle helpers:
	- `app/media/useServerVideoPreview.ts`

- `useAuthProfileFlow.ts`
- `useAutoRoomVoiceConnection.ts`
- `useCollapsedCategories.ts`
- `useMediaDevicePreferences.ts`
- `useMicrophoneLevelMeter.ts`
- `usePopupOutsideClose.ts`
- `useRealtimeChatLifecycle.ts`
- `useRealtimeSoundEffects.ts`
- `useRoomAdminActions.ts`
- `useRoomsDerived.ts`
- `useScreenWakeLock.ts`
- `useServerMenuAccessGuard.ts`
- `useServerSounds.ts`
- `useVoiceRoomStateMaps.ts`

## RTC modules

- See `hooks/rtc/README.md` for detailed RTC runtime structure.

Migration note:
- RTC modules are imported directly from `hooks/rtc/*`.
