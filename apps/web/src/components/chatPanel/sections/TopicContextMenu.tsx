import { useState } from "react";
import { Button } from "../../uicomponents";

type TopicContextMenuProps = {
  t: (key: string) => string;
  topicId: string;
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
  topicId,
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
  const [topicMenuStatusText, setTopicMenuStatusText] = useState("");
  const visuallyHiddenStatusStyle = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0
  } as const;

  const runActionWithStatus = (action: "read" | "archive" | "delete") => {
    setTopicMenuStatusText(`action:${action}:requested`);
    void onRunAction(action);
  };

  const applyRenameWithStatus = () => {
    setTopicMenuStatusText("action:rename:requested");
    void onApplyRename();
  };

  const setMutePresetWithStatus = (preset: "1h" | "8h" | "24h" | "forever" | "off") => {
    setTopicMenuStatusText(`action:mute:${preset}:requested`);
    void onSetTopicMutePreset(preset);
  };

  return (
    <div
      className="floating-popup settings-popup chat-topic-context-menu"
      role="menu"
      aria-label={t("chat.topicLabel")}
      data-agent-id="chat.topic-context-menu"
      data-agent-topic-id={topicId}
      data-agent-topic-archived={archived ? "true" : "false"}
      style={{
        left: `${Math.max(12, x)}px`,
        top: `${Math.max(12, y)}px`,
        transform: "translate(calc(-100% - 8px), 8px)"
      }}
    >
      <div role="status" aria-live="polite" data-agent-id="chat.topic-context-menu.status" style={visuallyHiddenStatusStyle}>
        {topicMenuStatusText}
      </div>
      <Button
        type="button"
        className="secondary tiny"
        role="menuitem"
        data-agent-id="chat.topic-context-menu.action.read"
        onClick={() => runActionWithStatus("read")}
      >
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
            data-agent-id="chat.topic-context-menu.rename.input"
          />
          {renameEditing ? (
            <>
              <Button
                type="button"
                className="secondary tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCancelRename}
                disabled={saving}
                data-agent-id="chat.topic-context-menu.rename.cancel"
              >
                {t("settings.cancel")}
              </Button>
              <Button
                type="button"
                className="tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={applyRenameWithStatus}
                disabled={saving || renameValue.trim().length === 0}
                data-agent-id="chat.topic-context-menu.rename.apply"
              >
                {t("settings.apply")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        className="secondary tiny"
        role="menuitem"
        data-agent-id="chat.topic-context-menu.action.archive"
        onClick={() => runActionWithStatus("archive")}
      >
        {archived ? t("chat.unarchiveTopic") : t("chat.archiveTopic")}
      </Button>
      <div className="chat-topic-context-section">
        <span className="chat-topic-label">{t("chat.notificationMute")}</span>
        <div className="quality-toggle-group chat-topic-context-mute-row" role="group" aria-label={t("chat.notificationMute")}>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "1h" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("1h")}
            disabled={saving}
            data-agent-id="chat.topic-context-menu.mute.1h"
            data-agent-state={activeMutePreset === "1h" ? "active" : "inactive"}
          >
            1h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "8h" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("8h")}
            disabled={saving}
            data-agent-id="chat.topic-context-menu.mute.8h"
            data-agent-state={activeMutePreset === "8h" ? "active" : "inactive"}
          >
            8h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "24h" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("24h")}
            disabled={saving}
            data-agent-id="chat.topic-context-menu.mute.24h"
            data-agent-state={activeMutePreset === "24h" ? "active" : "inactive"}
          >
            24h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "forever" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("forever")}
            disabled={saving}
            data-agent-id="chat.topic-context-menu.mute.forever"
            data-agent-state={activeMutePreset === "forever" ? "active" : "inactive"}
          >
            {t("chat.notificationMuteForever")}
          </Button>
        </div>
      </div>
      <Button
        type="button"
        className="secondary tiny delete-action-btn"
        role="menuitem"
        data-agent-id="chat.topic-context-menu.action.delete"
        onClick={() => runActionWithStatus("delete")}
      >
        {t("chat.deleteTopic")}
      </Button>
    </div>
  );
}
