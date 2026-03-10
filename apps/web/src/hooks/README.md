# Hooks Map

## Top-level hooks

- `app/*` - app orchestration hooks extracted from `App.tsx`:
	- `app/useAppUiState.ts`
	- `app/useAppEventLogs.ts`
	- `app/useBuildVersionSync.ts`
	- `app/useCurrentRoomSnapshot.ts`
	- `app/useToastQueue.ts`

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
