import { Button } from "../../uicomponents";

type TopicContextMenuProps = {
  t: (key: string) => string;
  x: number;
  y: number;
  archived: boolean;
  saving: boolean;
  renameOpen: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRunAction: (action: "read" | "edit" | "archive" | "delete") => Promise<void>;
  onSetTopicMute: (muteUntil: string | null) => Promise<void>;
  buildMuteUntilIso: (hours: number | "forever") => string;
  onCloseRename: () => void;
};

export function TopicContextMenu({
  t,
  x,
  y,
  archived,
  saving,
  renameOpen,
  renameValue,
  onRenameValueChange,
  onRunAction,
  onSetTopicMute,
  buildMuteUntilIso,
  onCloseRename
}: TopicContextMenuProps) {
  return (
    <div
      className="floating-popup settings-popup chat-topic-context-menu"
      role="menu"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void onRunAction("read")}>
        {t("chat.markTopicRead")}
      </Button>
      <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void onRunAction("edit")}>
        {t("chat.editTopic")}
      </Button>
      {renameOpen ? (
        <div className="chat-topic-context-rename-block">
          <input
            type="text"
            className="chat-topic-create-input"
            value={renameValue}
            onChange={(event) => onRenameValueChange(event.target.value)}
            placeholder={t("chat.editTopicPlaceholder")}
            disabled={saving}
            aria-label={t("chat.editTopicPlaceholder")}
          />
          <div className="chat-topic-context-rename-actions">
            <Button
              type="button"
              className="secondary tiny"
              disabled={saving || renameValue.trim().length === 0}
              onClick={() => void onRunAction("edit")}
            >
              {saving ? t("chat.loading") : t("chat.editTopicSave")}
            </Button>
            <Button type="button" className="secondary tiny" onClick={onCloseRename} disabled={saving}>
              {t("chat.editTopicCancel")}
            </Button>
          </div>
        </div>
      ) : null}
      <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void onRunAction("archive")}>
        {archived ? t("chat.unarchiveTopic") : t("chat.archiveTopic")}
      </Button>
      <div className="chat-topic-context-section">
        <span className="chat-topic-label">{t("chat.notificationMute")}</span>
        <div className="quality-toggle-group" role="group" aria-label={t("chat.notificationMute")}>
          <Button type="button" className="secondary quality-toggle-btn" onClick={() => void onSetTopicMute(buildMuteUntilIso(1))} disabled={saving}>1h</Button>
          <Button type="button" className="secondary quality-toggle-btn" onClick={() => void onSetTopicMute(buildMuteUntilIso(8))} disabled={saving}>8h</Button>
          <Button type="button" className="secondary quality-toggle-btn" onClick={() => void onSetTopicMute(buildMuteUntilIso(24))} disabled={saving}>24h</Button>
          <Button type="button" className="secondary quality-toggle-btn" onClick={() => void onSetTopicMute(buildMuteUntilIso("forever"))} disabled={saving}>
            {t("chat.notificationMuteForever")}
          </Button>
          <Button type="button" className="secondary quality-toggle-btn" onClick={() => void onSetTopicMute(null)} disabled={saving}>
            {t("chat.notificationUnmute")}
          </Button>
        </div>
      </div>
      <Button type="button" className="secondary tiny delete-action-btn" role="menuitem" onClick={() => void onRunAction("delete")}>
        {t("chat.deleteTopic")}
      </Button>
    </div>
  );
}
