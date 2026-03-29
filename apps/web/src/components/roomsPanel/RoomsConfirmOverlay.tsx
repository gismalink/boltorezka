import type { TranslateFn } from "../../i18n";
import { Button } from "../uicomponents";

export type RoomsConfirmKind =
  | "archive-channel"
  | "clear-channel"
  | "delete-category"
  | "restore-channel"
  | "delete-channel-permanent"
  | "delete-all-archived";

type RoomsConfirmOverlayProps = {
  t: TranslateFn;
  kind: RoomsConfirmKind | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function RoomsConfirmOverlay({ t, kind, onClose, onConfirm }: RoomsConfirmOverlayProps) {
  if (!kind) {
    return null;
  }

  return (
    <div
      className="settings-confirm-overlay popup-layer-content fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="card compact settings-confirm-modal popup-layer-content w-full max-w-[420px]">
        <h3 className="subheading settings-confirm-title">{t("rooms.confirmTitle")}</h3>
        <p className="muted settings-confirm-text">
          {kind === "clear-channel"
            ? t("rooms.confirmClear")
            : kind === "restore-channel"
              ? t("rooms.confirmRestoreChannel")
              : kind === "delete-channel-permanent"
                ? t("rooms.confirmDeleteChannelPermanent")
              : kind === "delete-all-archived"
                ? t("rooms.confirmDeleteAllDeleted")
            : kind === "archive-channel"
              ? t("rooms.confirmArchiveChannel")
              : t("rooms.confirmDeleteCategory")}
        </p>
        <div className="delete-confirm-actions flex flex-wrap items-center gap-3">
          <Button type="button" className="secondary" onClick={onClose}>
            {t("common.no")}
          </Button>
          <Button
            type="button"
            className={kind === "clear-channel" || kind === "restore-channel" ? "clear-confirm-btn" : "delete-confirm-btn"}
            onClick={onConfirm}
          >
            {t("common.yes")}
          </Button>
        </div>
      </div>
    </div>
  );
}
