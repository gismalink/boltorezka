/**
 * RoomMemberProfileModal.tsx — модальное окно профиля участника сервера.
 * Показывает детали участника, кнопку DM и админ-действия (kick/ban) при наличии прав.
 */
import type { TranslateFn } from "../../i18n";
import type { ServerMemberProfileDetails } from "./roomMemberSettingsTypes";
import { useDmOptional } from "../dm/DmContext";

type RoomMemberProfileModalProps = {
  t: TranslateFn;
  data: ServerMemberProfileDetails | null;
  open: boolean;
  onClose: () => void;
};

export function RoomMemberProfileModal({ t, data, open, onClose }: RoomMemberProfileModalProps) {
  const dm = useDmOptional();

  if (!open || !data) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("rooms.memberProfileTitle")}
      data-agent-id="rooms.member.profile-modal"
      data-agent-state="open"
    >
      <div
        className="card compact relative grid w-full max-w-[460px] gap-3 p-4"
        data-agent-id="rooms.member.profile-modal.card"
        data-agent-state="open"
      >
        <button
          type="button"
          className="secondary icon-btn tiny mention-profile-close"
          onClick={onClose}
          aria-label={t("settings.cancel")}
          data-agent-id="rooms.member.profile-modal.close"
          data-agent-state="ready"
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
        <h3>{t("rooms.memberProfileTitle")}</h3>
        <div data-agent-id="rooms.member.profile-modal.name" data-agent-value={data.name}><strong>{t("server.profileName")}: </strong>{data.name}</div>
        <div data-agent-id="rooms.member.profile-modal.email" data-agent-value={data.email}><strong>Email: </strong>{data.email}</div>
        {dm && data.userId ? (
          <button
            type="button"
            className="secondary small mt-1 inline-flex items-center gap-2"
            onClick={() => {
              dm.openDm(data.userId, data.name);
              onClose();
            }}
            data-agent-id="rooms.member.profile-modal.open-dm"
          >
            <i className="bi bi-chat-dots" aria-hidden="true" />
            {t("rooms.openDm")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
