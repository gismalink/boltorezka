import { Button } from "../../uicomponents";

type TopicContextMenuProps = {
  t: (key: string) => string;
  x: number;
  y: number;
  archived: boolean;
  saving: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  renameEditing: boolean;
  onStartRename: () => void;
  onApplyRename: () => Promise<void>;
  onCancelRename: () => void;
  onRunAction: (action: "read" | "archive" | "delete") => Promise<void>;
  activeMutePreset: "1h" | "8h" | "24h" | "forever" | "off" | null;
  onSetTopicMutePreset: (preset: "1h" | "8h" | "24h" | "forever" | "off") => Promise<void>;
};

export function TopicContextMenu({
  t,
  x,
  y,
  archived,
  saving,
  renameValue,
  onRenameValueChange,
  renameEditing,
  onStartRename,
  onApplyRename,
  onCancelRename,
  onRunAction,
  activeMutePreset,
  onSetTopicMutePreset
}: TopicContextMenuProps) {
  return (
    <div
      className="floating-popup settings-popup chat-topic-context-menu"
      role="menu"
      style={{
        left: `${Math.max(12, x)}px`,
        top: `${Math.max(12, y)}px`,
        transform: "translate(calc(-100% - 8px), 8px)"
      }}
    >
      <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void onRunAction("read")}>
        {t("chat.markTopicRead")}
      </Button>
      <div className="chat-topic-context-rename-block">
        <div className="chat-topic-context-rename-row">
          <input
            type="text"
            className="channel-settings-title-input chat-topic-context-rename-input"
            value={renameValue}
            onFocus={onStartRename}
            onBlur={onCancelRename}
            onChange={(event) => onRenameValueChange(event.target.value)}
            placeholder={t("chat.editTopicPlaceholder")}
            disabled={saving}
            aria-label={t("chat.editTopicPlaceholder")}
          />
          {renameEditing ? (
            <>
              <Button
                type="button"
                className="secondary tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCancelRename}
                disabled={saving}
              >
                {t("settings.cancel")}
              </Button>
              <Button
                type="button"
                className="tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void onApplyRename()}
                disabled={saving || renameValue.trim().length === 0}
              >
                {t("settings.apply")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void onRunAction("archive")}>
        {archived ? t("chat.unarchiveTopic") : t("chat.archiveTopic")}
      </Button>
      <div className="chat-topic-context-section">
        <span className="chat-topic-label">{t("chat.notificationMute")}</span>
        <div className="quality-toggle-group chat-topic-context-mute-row" role="group" aria-label={t("chat.notificationMute")}>
          <Button type="button" className={`secondary quality-toggle-btn ${activeMutePreset === "1h" ? "quality-toggle-btn-active" : ""}`} onClick={() => void onSetTopicMutePreset("1h")} disabled={saving}>1h</Button>
          <Button type="button" className={`secondary quality-toggle-btn ${activeMutePreset === "8h" ? "quality-toggle-btn-active" : ""}`} onClick={() => void onSetTopicMutePreset("8h")} disabled={saving}>8h</Button>
          <Button type="button" className={`secondary quality-toggle-btn ${activeMutePreset === "24h" ? "quality-toggle-btn-active" : ""}`} onClick={() => void onSetTopicMutePreset("24h")} disabled={saving}>24h</Button>
          <Button type="button" className={`secondary quality-toggle-btn ${activeMutePreset === "forever" ? "quality-toggle-btn-active" : ""}`} onClick={() => void onSetTopicMutePreset("forever")} disabled={saving}>
            {t("chat.notificationMuteForever")}
          </Button>
        </div>
      </div>
      <Button type="button" className="secondary tiny delete-action-btn" role="menuitem" onClick={() => void onRunAction("delete")}>
        {t("chat.deleteTopic")}
      </Button>
    </div>
  );
}
