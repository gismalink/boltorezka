import type { TelemetrySummary, User } from "../domain";

type ServerMenuTab = "users" | "events" | "telemetry" | "call";

type ServerProfileModalProps = {
  open: boolean;
  t: (key: string) => string;
  canPromote: boolean;
  canViewTelemetry: boolean;
  serverMenuTab: ServerMenuTab;
  adminUsers: User[];
  eventLog: string[];
  telemetrySummary: TelemetrySummary | null;
  callStatus: string;
  lastCallPeer: string;
  roomVoiceConnected: boolean;
  callEventLog: string[];
  onClose: () => void;
  onSetServerMenuTab: (value: ServerMenuTab) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onSetBan: (userId: string, banned: boolean) => void;
  onRefreshTelemetry: () => void;
};

export function ServerProfileModal({
  open,
  t,
  canPromote,
  canViewTelemetry,
  serverMenuTab,
  adminUsers,
  eventLog,
  telemetrySummary,
  callStatus,
  lastCallPeer,
  roomVoiceConnected,
  callEventLog,
  onClose,
  onSetServerMenuTab,
  onPromote,
  onDemote,
  onSetBan,
  onRefreshTelemetry
}: ServerProfileModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="voice-preferences-overlay fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="card voice-preferences-modal user-settings-modal server-profile-modal grid w-full max-w-[980px] min-w-0 gap-4 min-[801px]:grid-cols-[250px_1fr]">
        <div className="user-settings-sidebar grid min-w-0 content-start gap-2">
          <div className="voice-preferences-kicker">{t("server.title")}</div>
          {canPromote ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "users" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("users")}
            >
              {t("server.tabUsers")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "events" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("events")}
          >
            {t("server.tabEvents")}
          </button>
          {canViewTelemetry ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "telemetry" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("telemetry")}
            >
              {t("server.tabTelemetry")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "call" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("call")}
          >
            {t("server.tabCall")}
          </button>
        </div>

        <div className="user-settings-content grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] content-start gap-4 overflow-auto overflow-x-hidden pr-0">
          <div className="voice-preferences-head flex items-center justify-between gap-3">
            <h2 className="mt-[var(--space-xxs)]">
              {serverMenuTab === "users" ? t("server.tabUsers") : null}
              {serverMenuTab === "events" ? t("server.tabEvents") : null}
              {serverMenuTab === "telemetry" ? t("server.tabTelemetry") : null}
              {serverMenuTab === "call" ? t("server.tabCall") : null}
            </h2>
            <button
              type="button"
              className="secondary icon-btn"
              onClick={onClose}
              aria-label={t("settings.closeVoiceAria")}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          {serverMenuTab === "users" && canPromote ? (
            <section className="grid gap-3">
              <h3>{t("admin.title")}</h3>
              <ul className="admin-list grid gap-2">
                {adminUsers.map((item) => (
                  <li key={item.id} className="admin-row grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-[800px]:grid-cols-1">
                    <span className="min-w-0 break-words">
                      {item.email} ({item.role})
                      {item.is_banned ? ` · ${t("admin.banned")}` : ""}
                    </span>
                    <div className="row-actions flex flex-wrap items-stretch gap-2">
                      {item.role === "user" ? (
                        <button className="min-h-[34px]" onClick={() => onPromote(item.id)}>{t("admin.promote")}</button>
                      ) : null}
                      {item.role === "admin" ? (
                        <button className="secondary min-h-[34px]" onClick={() => onDemote(item.id)}>{t("admin.demote")}</button>
                      ) : null}
                      {item.role !== "super_admin" ? (
                        item.is_banned ? (
                          <button className="secondary min-h-[34px]" onClick={() => onSetBan(item.id, false)}>{t("admin.unban")}</button>
                        ) : (
                          <button className="secondary min-h-[34px]" onClick={() => onSetBan(item.id, true)}>{t("admin.ban")}</button>
                        )
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {serverMenuTab === "events" ? (
            <section className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3">
              <h3>{t("events.title")}</h3>
              <div className="log h-full max-h-none overflow-auto">
                {eventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </section>
          ) : null}

          {serverMenuTab === "telemetry" && canViewTelemetry ? (
            <section className="grid gap-3">
              <h3>{t("telemetry.title")}</h3>
              <p className="muted">{t("telemetry.day")}: {telemetrySummary?.day || "-"}</p>
              <div className="grid gap-1">
                <div>ack_sent: {telemetrySummary?.metrics.ack_sent ?? 0}</div>
                <div>nack_sent: {telemetrySummary?.metrics.nack_sent ?? 0}</div>
                <div>chat_sent: {telemetrySummary?.metrics.chat_sent ?? 0}</div>
                <div>chat_idempotency_hit: {telemetrySummary?.metrics.chat_idempotency_hit ?? 0}</div>
                <div>telemetry_web_event: {telemetrySummary?.metrics.telemetry_web_event ?? 0}</div>
              </div>
              <button onClick={onRefreshTelemetry}>{t("telemetry.refresh")}</button>
            </section>
          ) : null}

          {serverMenuTab === "call" ? (
            <section className="signaling-panel grid min-h-0 flex-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3">
              <h3>{t("call.title")}</h3>
              <p className="muted">{t("call.status")}: {callStatus}{lastCallPeer ? ` (${lastCallPeer})` : ""}</p>
              <p className="muted">
                {roomVoiceConnected ? t("call.autoConnected") : t("call.autoWaiting")}
              </p>
              <div className="log call-log h-full max-h-none overflow-auto">
                {callEventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
