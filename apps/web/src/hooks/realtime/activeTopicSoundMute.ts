/**
 * activeTopicSoundMute.ts — модульный флаг «звуковой mute активного топика».
 *
 * Назначение: позволить хуку звуковых эффектов узнать, замьючен ли
 * сейчас активный топик/комната, без проброса состояния через 5 уровней
 * пропсов. ChatPanel вызывает `setActiveTopicSoundMuted(true|false)` при
 * каждом изменении notificationMode/topic mute preset/смене активного
 * топика, а `useRealtimeSoundEffects` читает значение через геттер.
 *
 * Это не защищает от race с `topic.mute` сервер-stateʼа, но в рамках
 * UX-звуков (которые играют только в активной вкладке/при активном
 * топике) этого достаточно.
 */

let activeTopicSoundMuted = false;

export function setActiveTopicSoundMuted(muted: boolean): void {
  activeTopicSoundMuted = Boolean(muted);
}

export function isActiveTopicSoundMuted(): boolean {
  return activeTopicSoundMuted;
}
