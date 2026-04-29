/**
 * callTypes.ts — общие типы состояния голосового/видео-звонка.
 * Минимальный модуль; держим типы отдельно, чтобы не плодить циклические импорты.
 */
export type CallStatus = "idle" | "ringing" | "connecting" | "active";
