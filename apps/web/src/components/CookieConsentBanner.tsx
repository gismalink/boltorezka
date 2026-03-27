type CookieConsentBannerProps = {
  visible: boolean;
  onAccept: () => void;
};

export function CookieConsentBanner({ visible, onAccept }: CookieConsentBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[320] mx-auto w-full max-w-[980px] rounded-xl border border-white/15 bg-[#111827]/95 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm leading-relaxed text-white/90">
          Мы используем cookie, чтобы сайт работал. Подробнее в
          {" "}
          <a href="/cookies" className="underline underline-offset-2 hover:text-white">
            Политике cookie
          </a>
          .
        </p>
        <button
          type="button"
          className="secondary min-h-[40px] min-w-[88px]"
          onClick={onAccept}
        >
          Ок
        </button>
      </div>
    </div>
  );
}
