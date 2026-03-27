import type { Lang } from "../i18n";

type LegalLinksProps = {
  compact?: boolean;
  lang?: Lang;
};

const LEGAL_LINKS: Record<Lang, Array<{ href: string; label: string; compactLabel: string }>> = {
  ru: [
    {
      href: "/privacy",
      label: "Политика конфиденциальности",
      compactLabel: "Конфиденциальность"
    },
    {
      href: "/terms",
      label: "Пользовательское соглашение",
      compactLabel: "Соглашение"
    },
    {
      href: "/cookies",
      label: "Политика cookie",
      compactLabel: "Cookie"
    },
    {
      href: "/contacts",
      label: "Юридические контакты",
      compactLabel: "Контакты"
    }
  ],
  en: [
    {
      href: "/privacy",
      label: "Privacy Policy",
      compactLabel: "Privacy"
    },
    {
      href: "/terms",
      label: "Terms of Service",
      compactLabel: "Terms"
    },
    {
      href: "/cookies",
      label: "Cookie Policy",
      compactLabel: "Cookies"
    },
    {
      href: "/contacts",
      label: "Legal Contacts",
      compactLabel: "Contacts"
    }
  ]
};

export function LegalLinks({ compact = false, lang = "ru" }: LegalLinksProps) {
  const legalLinks = LEGAL_LINKS[lang];
  const navLabel = lang === "ru" ? "Юридические ссылки" : "Legal links";

  return (
    <nav aria-label={navLabel} className={compact ? "text-xs" : "text-sm"}>
      <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-white/70">
        {legalLinks.map((link) => (
          <li key={link.href}>
            <a href={link.href} className="underline-offset-2 hover:text-white hover:underline">
              {compact ? link.compactLabel : link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
