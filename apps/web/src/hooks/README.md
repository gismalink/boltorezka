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
- `realtime/*` - websocket lifecycle + realtime UX logic:
	- `realtime/useRealtimeChatLifecycle.ts`
	- `realtime/useRealtimeIncomingCallState.ts`
	- `realtime/useScreenShareOrchestrator.ts`
	- `realtime/useRealtimeSoundEffects.ts`
- `rooms/*` - room/category/channel state and admin actions:
	- `rooms/useCollapsedCategories.ts`
	- `rooms/useRoomsDerived.ts`
	- `rooms/useRoomMediaCapabilities.ts`
	- `rooms/useRoomAdminActions.ts`
- `auth/*` - auth/profile session flows:
	- `auth/useAuthProfileFlow.ts`
- `media/*` - media devices, mic meter, and server sounds:
	- `media/useMediaDevicePreferences.ts`
	- `media/useMicrophoneLevelMeter.ts`
	- `media/useServerSounds.ts`
- `ui/*` - UI behavior helpers:
	- `ui/usePopupOutsideClose.ts`
	- `ui/useScreenWakeLock.ts`
	- `ui/useServerMenuAccessGuard.ts`
- `voice/*` - voice-room orchestration helpers:
	- `voice/useAutoRoomVoiceConnection.ts`
	- `voice/useVoiceSignalingOrchestrator.ts`
	- `voice/useVoiceRoomStateMaps.ts`

## RTC modules

- See `hooks/rtc/README.md` for detailed RTC runtime structure.

Migration note:
- RTC modules are imported directly from `hooks/rtc/*`.
