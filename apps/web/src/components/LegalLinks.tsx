type LegalLinksProps = {
  compact?: boolean;
};

const legalLinks = [
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
];

export function LegalLinks({ compact = false }: LegalLinksProps) {
  return (
    <nav aria-label="Юридические ссылки" className={compact ? "text-xs" : "text-sm"}>
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
