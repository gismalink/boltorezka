/**
 * RoomChannelSettingsPopup.tsx — всплывающее меню настроек канала.
 *
 * Назначение:
 * - Настраивает тип канала, категорию, NSFW/hidden флаги, мьют и удаление.
 * - Извлечён из RoomRow.tsx для уменьшения размера родительского компонента.
 */
// Всплывающее меню настроек канала (тип, категория, NSFW, hidden, мют, удаление).
// Извлечено из RoomRow.tsx для уменьшения размера основного компонента.
import type { FormEvent } from "react";
import type { ChannelAudioQualitySetting, RoomKind, Room } from "../../domain";
import { PopupPortal } from "../uicomponents";

type RoomChannelSettingsPopupProps = {
  t: (key: string) => string;
  room: Room;
  open: boolean;
  anchorRef: React.RefObject<HTMLDivElement>;
  editingRoomTitle: string;
  editingRoomKind: RoomKind;
  editingRoomCategoryId: string;
  editingRoomNsfw: boolean;
  editingRoomHidden: boolean;
  editingRoomAudioQualitySetting: ChannelAudioQualitySetting;
  isEditingChannelTitle: boolean;
  editingChannelTitleInitialValue: string;
  canManageAudioQuality: boolean;
  roomMutePreset: string | null;
  roomMuteSaving: boolean;
  roomMuteStatusText: string;
  roomsTreeCategories: Array<{ id: string; title: string }>;
  onSetEditingRoomTitle: (value: string) => void;
  onSetEditingRoomKind: (kind: RoomKind) => void;
  onSetEditingRoomCategoryId: (id: string) => void;
  onSetEditingRoomNsfw: (value: boolean) => void;
  onSetEditingRoomHidden: (value: boolean) => void;
  onSetEditingRoomAudioQualitySetting: (value: ChannelAudioQualitySetting) => void;
  onSaveChannelSettings: (event: FormEvent) => void;
  onSetIsEditingChannelTitle: (value: boolean) => void;
  onSetEditingChannelTitleInitialValue: (value: string) => void;
  onMoveChannel: (direction: "up" | "down") => void;
  onOpenRoomChat: (slug: string) => void;
  onRequestClearChannel: (room: Room) => void;
  onRequestArchiveChannel: (room: Room) => void;
  onApplyRoomMutePreset: (preset: "1h" | "8h" | "24h" | "forever" | "off") => void;
  requestRoomSettingsAutosave: () => void;
};

export function RoomChannelSettingsPopup({
  t,
  room,
  open,
  anchorRef,
  editingRoomTitle,
  editingRoomKind,
  editingRoomCategoryId,
  editingRoomNsfw,
  editingRoomHidden,
  editingRoomAudioQualitySetting,
  isEditingChannelTitle,
  editingChannelTitleInitialValue,
  canManageAudioQuality,
  roomMutePreset,
  roomMuteSaving,
  roomMuteStatusText,
  roomsTreeCategories,
  onSetEditingRoomTitle,
  onSetEditingRoomKind,
  onSetEditingRoomCategoryId,
  onSetEditingRoomNsfw,
  onSetEditingRoomHidden,
  onSetEditingRoomAudioQualitySetting,
  onSaveChannelSettings,
  onSetIsEditingChannelTitle,
  onSetEditingChannelTitleInitialValue,
  onMoveChannel,
  onOpenRoomChat,
  onRequestClearChannel,
  onRequestArchiveChannel,
  onApplyRoomMutePreset,
  requestRoomSettingsAutosave
}: RoomChannelSettingsPopupProps) {
  return (
    <PopupPortal
      open={open}
      anchorRef={anchorRef}
      className="settings-popup channel-settings-popup"
      placement="bottom-end"
    >
      <div>
        <form className="grid gap-4" onSubmit={onSaveChannelSettings}>
          <h3 className="subheading">{t("rooms.channelSettings")}</h3>
          <div className="grid gap-1.5">
            <span className="subheading">{t("rooms.channelTitle")}</span>
            <div className="row items-center gap-2 channel-settings-title-row">
              {isEditingChannelTitle ? (
                <button
                  type="button"
                  className="secondary whitespace-nowrap"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSetEditingRoomTitle(editingChannelTitleInitialValue);
                    onSetIsEditingChannelTitle(false);
                  }}
                >
                  {t("settings.cancel")}
                </button>
              ) : null}
              <input
                className="channel-settings-title-input"
                value={editingRoomTitle}
                onFocus={() => {
                  onSetEditingChannelTitleInitialValue(editingRoomTitle);
                  onSetIsEditingChannelTitle(true);
                }}
                onBlur={() => {
                  onSetEditingRoomTitle(editingChannelTitleInitialValue);
                  onSetIsEditingChannelTitle(false);
                }}
                onChange={(event) => onSetEditingRoomTitle(event.target.value)}
                placeholder={t("rooms.channelTitle")}
              />
              {isEditingChannelTitle ? (
                <button
                  type="button"
                  className="whitespace-nowrap"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSetEditingChannelTitleInitialValue(editingRoomTitle);
                    onSetIsEditingChannelTitle(false);
                    requestRoomSettingsAutosave();
                  }}
                >
                  {t("settings.apply")}
                </button>
              ) : null}
              <button
                type="button"
                className="secondary icon-btn tiny"
                onClick={() => onMoveChannel("up")}
                aria-label={t("rooms.up")}
                data-tooltip={t("rooms.up")}
              >
                <i className="bi bi-arrow-up" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary icon-btn tiny"
                onClick={() => onMoveChannel("down")}
                aria-label={t("rooms.down")}
                data-tooltip={t("rooms.down")}
              >
                <i className="bi bi-arrow-down" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="grid gap-3 desktop:grid-cols-2">
            <select
              value={editingRoomKind}
              onChange={(event) => {
                onSetEditingRoomKind(event.target.value as RoomKind);
                requestRoomSettingsAutosave();
              }}
            >
              <option value="text">{t("rooms.text")}</option>
              <option value="text_voice">{t("rooms.textVoice")}</option>
              <option value="text_voice_video">{t("rooms.textVoiceVideo")}</option>
            </select>
            <select
              value={editingRoomCategoryId}
              onChange={(event) => {
                onSetEditingRoomCategoryId(event.target.value);
                requestRoomSettingsAutosave();
              }}
            >
              <option value="none">{t("rooms.noCategory")}</option>
              {roomsTreeCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.title}</option>
              ))}
            </select>
          </div>
          <div className="channel-settings-toggles-row">
            <div className="row items-center justify-between gap-3 channel-settings-toggle-item">
              <span>{t("rooms.channelNsfw")}</span>
              <button
                type="button"
                className={`ui-switch ${editingRoomNsfw ? "ui-switch-on" : ""}`}
                role="switch"
                aria-checked={editingRoomNsfw}
                aria-label={t("rooms.channelNsfw")}
                onClick={() => {
                  onSetEditingRoomNsfw(!editingRoomNsfw);
                  requestRoomSettingsAutosave();
                }}
              >
                <span className="ui-switch-thumb" aria-hidden="true" />
              </button>
            </div>
            <div className="row items-center justify-between gap-3 channel-settings-toggle-item">
              <span>{t("rooms.channelHidden")}</span>
              <button
                type="button"
                className={`ui-switch ${editingRoomHidden ? "ui-switch-on" : ""}`}
                role="switch"
                aria-checked={editingRoomHidden}
                aria-label={t("rooms.channelHidden")}
                onClick={() => {
                  onSetEditingRoomHidden(!editingRoomHidden);
                  requestRoomSettingsAutosave();
                }}
              >
                <span className="ui-switch-thumb" aria-hidden="true" />
              </button>
            </div>
          </div>
          {canManageAudioQuality ? (
            <div className="grid gap-2">
              <span>{t("rooms.channelSoundQuality")}</span>
              <div className="quality-toggle-group" role="radiogroup" aria-label={t("rooms.channelSoundQuality")}>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "server_default" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => {
                    onSetEditingRoomAudioQualitySetting("server_default");
                    requestRoomSettingsAutosave();
                  }}
                  aria-pressed={editingRoomAudioQualitySetting === "server_default"}
                >
                  {t("rooms.channelSoundServerDefault")}
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "retro" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => {
                    onSetEditingRoomAudioQualitySetting("retro" as ChannelAudioQualitySetting);
                    requestRoomSettingsAutosave();
                  }}
                  aria-pressed={editingRoomAudioQualitySetting === "retro"}
                >
                  {t("server.soundRetro")}
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "low" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => {
                    onSetEditingRoomAudioQualitySetting("low" as ChannelAudioQualitySetting);
                    requestRoomSettingsAutosave();
                  }}
                  aria-pressed={editingRoomAudioQualitySetting === "low"}
                >
                  {t("server.soundLow")}
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "standard" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => {
                    onSetEditingRoomAudioQualitySetting("standard" as ChannelAudioQualitySetting);
                    requestRoomSettingsAutosave();
                  }}
                  aria-pressed={editingRoomAudioQualitySetting === "standard"}
                >
                  {t("server.soundStandard")}
                </button>
                <button
                  type="button"
                  className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "high" ? "quality-toggle-btn-active" : ""}`}
                  onClick={() => {
                    onSetEditingRoomAudioQualitySetting("high" as ChannelAudioQualitySetting);
                    requestRoomSettingsAutosave();
                  }}
                  aria-pressed={editingRoomAudioQualitySetting === "high"}
                >
                  {t("server.soundHigh")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2">
            <span>{t("chat.notificationMute")}</span>
            <div className="quality-toggle-group chat-topic-context-mute-row" role="group" aria-label={t("chat.notificationMute")}>
              <button
                type="button"
                className={`secondary quality-toggle-btn ${roomMutePreset === "1h" ? "quality-toggle-btn-active" : ""}`}
                onClick={() => void onApplyRoomMutePreset("1h")}
                disabled={roomMuteSaving}
              >
                1h
              </button>
              <button
                type="button"
                className={`secondary quality-toggle-btn ${roomMutePreset === "8h" ? "quality-toggle-btn-active" : ""}`}
                onClick={() => void onApplyRoomMutePreset("8h")}
                disabled={roomMuteSaving}
              >
                8h
              </button>
              <button
                type="button"
                className={`secondary quality-toggle-btn ${roomMutePreset === "24h" ? "quality-toggle-btn-active" : ""}`}
                onClick={() => void onApplyRoomMutePreset("24h")}
                disabled={roomMuteSaving}
              >
                24h
              </button>
              <button
                type="button"
                className={`secondary quality-toggle-btn ${roomMutePreset === "forever" ? "quality-toggle-btn-active" : ""}`}
                onClick={() => void onApplyRoomMutePreset("forever")}
                disabled={roomMuteSaving}
              >
                {t("chat.notificationMuteForever")}
              </button>
            </div>
            {roomMuteStatusText ? <div className="chat-topic-read-status" role="status" aria-live="polite">{roomMuteStatusText}</div> : null}
          </div>
          <div className="row items-center gap-2 channel-settings-actions-row">
            <button
              type="button"
              className="secondary clear-action-btn"
              onClick={() => onOpenRoomChat(room.slug)}
            >
              <i className="bi bi-book" aria-hidden="true" /> {t("rooms.markAsRead")}
            </button>
            <button
              type="button"
              className="secondary clear-action-btn"
              onClick={() => onRequestClearChannel(room)}
            >
              <i className="bi bi-eraser" aria-hidden="true" /> {t("rooms.clearChat")}
            </button>
            <button
              type="button"
              className="secondary delete-action-btn"
              onClick={() => onRequestArchiveChannel(room)}
            >
              <i className="bi bi-archive" aria-hidden="true" /> {t("rooms.deleteChannel")}
            </button>
          </div>
        </form>
      </div>
    </PopupPortal>
  );
}
