import { useState } from "react";
import {
  CHAT_AGENT_FAILURE_REASONS,
  CHAT_AGENT_IDS,
  CHAT_AGENT_STATUS_STYLE,
  buildChatAgentStatus,
  normalizeChatAgentFailureReason
} from "../../../constants/chatAgentSemantics";
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
  canRename: boolean;
  canDelete: boolean;
  protectedMessage: string;
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
  onSetTopicMutePreset,
  canRename,
  canDelete,
  protectedMessage
}: TopicContextMenuProps) {
  const [topicMenuStatusText, setTopicMenuStatusText] = useState("");

  const runActionWithStatus = async (action: "read" | "archive" | "delete") => {
    const actionKey = `action:${action}`;
    setTopicMenuStatusText(buildChatAgentStatus(actionKey, "requested"));
    try {
      await onRunAction(action);
      setTopicMenuStatusText(buildChatAgentStatus(actionKey, "accepted"));
    } catch (error) {
      setTopicMenuStatusText(buildChatAgentStatus(actionKey, "failed", normalizeChatAgentFailureReason(error)));
    }
  };

  const applyRenameWithStatus = async () => {
    const normalizedValue = String(renameValue || "").trim();
    if (!normalizedValue) {
      setTopicMenuStatusText(buildChatAgentStatus("action:rename", "failed", CHAT_AGENT_FAILURE_REASONS.emptyTitle));
      return;
    }

    setTopicMenuStatusText(buildChatAgentStatus("action:rename", "requested"));
    try {
      await onApplyRename();
      setTopicMenuStatusText(buildChatAgentStatus("action:rename", "accepted"));
    } catch (error) {
      setTopicMenuStatusText(buildChatAgentStatus("action:rename", "failed", normalizeChatAgentFailureReason(error)));
    }
  };

  const setMutePresetWithStatus = async (preset: "1h" | "8h" | "24h" | "forever" | "off") => {
    const actionKey = `action:mute:${preset}`;
    setTopicMenuStatusText(buildChatAgentStatus(actionKey, "requested"));
    try {
      await onSetTopicMutePreset(preset);
      setTopicMenuStatusText(buildChatAgentStatus(actionKey, "accepted"));
    } catch (error) {
      setTopicMenuStatusText(buildChatAgentStatus(actionKey, "failed", normalizeChatAgentFailureReason(error)));
    }
  };

  return (
    <div
      className="floating-popup settings-popup chat-topic-context-menu"
      role="menu"
      aria-label={t("chat.topicLabel")}
      data-agent-id={CHAT_AGENT_IDS.topicContextMenu}
      data-agent-topic-id={topicId}
      data-agent-topic-archived={archived ? "true" : "false"}
      style={{
        left: `${Math.max(12, x)}px`,
        top: `${Math.max(12, y)}px`,
        transform: "translate(calc(-100% - 8px), 8px)"
      }}
    >
      <div role="status" aria-live="polite" data-agent-id={CHAT_AGENT_IDS.topicContextMenuStatus} style={CHAT_AGENT_STATUS_STYLE}>
        {topicMenuStatusText}
      </div>
      <Button
        type="button"
        className="secondary tiny"
        role="menuitem"
        data-agent-id={CHAT_AGENT_IDS.topicContextMenuActionRead}
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
            onFocus={canRename ? onStartRename : undefined}
            onBlur={onCancelRename}
            onChange={(event) => onRenameValueChange(event.target.value)}
            placeholder={t("chat.editTopicPlaceholder")}
            disabled={saving || !canRename}
            aria-label={t("chat.editTopicPlaceholder")}
            data-agent-id={CHAT_AGENT_IDS.topicContextMenuRenameInput}
          />
          {renameEditing ? (
            <>
              <Button
                type="button"
                className="secondary tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCancelRename}
                disabled={saving}
                data-agent-id={CHAT_AGENT_IDS.topicContextMenuRenameCancel}
              >
                {t("settings.cancel")}
              </Button>
              <Button
                type="button"
                className="tiny whitespace-nowrap chat-topic-context-rename-btn"
                onMouseDown={(event) => event.preventDefault()}
                onClick={applyRenameWithStatus}
                disabled={saving || !canRename || renameValue.trim().length === 0}
                data-agent-id={CHAT_AGENT_IDS.topicContextMenuRenameApply}
              >
                {t("settings.apply")}
              </Button>
            </>
          ) : null}
        </div>
        {!canRename ? <div className="muted text-xs">{protectedMessage}</div> : null}
      </div>
      <Button
        type="button"
        className="secondary tiny"
        role="menuitem"
        data-agent-id={CHAT_AGENT_IDS.topicContextMenuActionArchive}
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
            data-agent-id={CHAT_AGENT_IDS.topicContextMenuMute1h}
            data-agent-state={activeMutePreset === "1h" ? "active" : "inactive"}
          >
            1h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "8h" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("8h")}
            disabled={saving}
            data-agent-id={CHAT_AGENT_IDS.topicContextMenuMute8h}
            data-agent-state={activeMutePreset === "8h" ? "active" : "inactive"}
          >
            8h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "24h" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("24h")}
            disabled={saving}
            data-agent-id={CHAT_AGENT_IDS.topicContextMenuMute24h}
            data-agent-state={activeMutePreset === "24h" ? "active" : "inactive"}
          >
            24h
          </Button>
          <Button
            type="button"
            className={`secondary quality-toggle-btn ${activeMutePreset === "forever" ? "quality-toggle-btn-active" : ""}`}
            onClick={() => setMutePresetWithStatus("forever")}
            disabled={saving}
            data-agent-id={CHAT_AGENT_IDS.topicContextMenuMuteForever}
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
        data-agent-id={CHAT_AGENT_IDS.topicContextMenuActionDelete}
        onClick={() => runActionWithStatus("delete")}
        disabled={!canDelete}
      >
        {t("chat.deleteTopic")}
      </Button>
    </div>
  );
}
