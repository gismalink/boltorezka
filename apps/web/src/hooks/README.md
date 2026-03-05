# Hooks Map

## Top-level hooks

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
- RTC legacy paths in `hooks/*` now act as compatibility re-exports to `hooks/rtc/*`.
