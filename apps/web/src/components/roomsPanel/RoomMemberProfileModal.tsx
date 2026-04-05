import type { TranslateFn } from "../../i18n";
import type { ServerMemberProfileDetails } from "./roomMemberSettingsTypes";

type RoomMemberProfileModalProps = {
  t: TranslateFn;
  data: ServerMemberProfileDetails | null;
  open: boolean;
  onClose: () => void;
};

export function RoomMemberProfileModal({ t, data, open, onClose }: RoomMemberProfileModalProps) {
  if (!open || !data) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 px-4" role="dialog" aria-modal="true">
      <div className="card compact relative grid w-full max-w-[460px] gap-3 p-4">
        <button
          type="button"
          className="secondary icon-btn tiny mention-profile-close"
          onClick={onClose}
          aria-label={t("settings.cancel")}
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </button>
        <h3>{t("rooms.memberProfileTitle")}</h3>
        <div><strong>{t("server.profileName")}: </strong>{data.name}</div>
        <div><strong>Email: </strong>{data.email}</div>
      </div>
    </div>
  );
}
