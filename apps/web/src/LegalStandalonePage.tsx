import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { LegalLinks } from "./components/LegalLinks";
import { useEffect, useMemo, useState } from "react";
import { detectInitialLang, LANGUAGE_OPTIONS, type Lang } from "./i18n";

const COOKIE_CONSENT_KEY = "boltorezka_cookie_consent_v1";

type LegalPageData = {
  title: string;
  subtitle: string;
  effectiveDateLabel: string;
  backLabel: string;
  toAppLabel: string;
  languageLabel: string;
  sections: Array<{ heading: string; items: string[] }>;
};

const LEGAL_PAGES: Record<Lang, Record<string, LegalPageData>> = {
  ru: {
    "/privacy": {
      title: "Политика конфиденциальности",
      subtitle: "Политика обработки персональных данных",
      effectiveDateLabel: "Дата вступления в силу: 2026-03-27",
      backLabel: "Назад",
      toAppLabel: "В приложение",
      languageLabel: "Язык",
      sections: [
        {
          heading: "Какие данные мы обрабатываем",
          items: [
            "Данные аккаунта: email, имя профиля, технический идентификатор пользователя.",
            "Служебные данные безопасности: время входа, IP-адрес, user-agent, события сессии.",
            "Данные использования сервиса: комнаты, сообщения и системные журналы в рамках работы продукта."
          ]
        },
        {
          heading: "Для каких целей",
          items: [
            "Предоставление доступа к сервису и поддержка авторизации.",
            "Обеспечение безопасности, расследование инцидентов и предотвращение злоупотреблений.",
            "Техническая поддержка и улучшение стабильности сервиса."
          ]
        },
        {
          heading: "Права пользователя",
          items: [
            "Запросить доступ к своим данным.",
            "Запросить исправление или удаление данных в случаях, предусмотренных законом.",
            "Отозвать согласие на обработку, где основанием является согласие."
          ]
        }
      ]
    },
    "/terms": {
      title: "Пользовательское соглашение",
      subtitle: "Условия использования",
      effectiveDateLabel: "Дата вступления в силу: 2026-03-27",
      backLabel: "Назад",
      toAppLabel: "В приложение",
      languageLabel: "Язык",
      sections: [
        {
          heading: "Базовые правила",
          items: [
            "Используя сервис, вы соглашаетесь с настоящими условиями.",
            "Пользователь обязан не нарушать применимое законодательство и права третьих лиц.",
            "Администрация может ограничить доступ при нарушении правил и требований безопасности."
          ]
        },
        {
          heading: "Ответственность",
          items: [
            "Сервис предоставляется по модели as is в пределах, допустимых законом.",
            "Пользователь несет ответственность за контент, который публикует или передает.",
            "Администрация вправе обновлять условия с публикацией актуальной версии на сайте."
          ]
        }
      ]
    },
    "/cookies": {
      title: "Политика cookie",
      subtitle: "Использование cookie",
      effectiveDateLabel: "Дата вступления в силу: 2026-03-27",
      backLabel: "Назад",
      toAppLabel: "В приложение",
      languageLabel: "Язык",
      sections: [
        {
          heading: "Зачем нужны cookie",
          items: [
            "Строго необходимые cookie используются для входа и работы сессии.",
            "Технические cookie помогают сохранить пользовательские настройки интерфейса.",
            "Нестрого необходимые cookie (если будут включены) используются только после согласия пользователя."
          ]
        },
        {
          heading: "Управление cookie",
          items: [
            "Вы можете изменить настройки cookie в браузере.",
            "Согласие можно отозвать, очистив соответствующие cookie/локальные данные.",
            "Подробности и обновления публикуются на этой странице."
          ]
        }
      ]
    },
    "/contacts": {
      title: "Юридические контакты",
      subtitle: "Контакты по вопросам данных и права",
      effectiveDateLabel: "Дата вступления в силу: 2026-03-27",
      backLabel: "Назад",
      toAppLabel: "В приложение",
      languageLabel: "Язык",
      sections: [
        {
          heading: "Канал для обращений",
          items: [
            "По вопросам персональных данных и юридическим запросам: legal@datowave.com.",
            "Запросы на доступ/исправление/удаление данных обрабатываются через этот канал.",
            "Рекомендуемый срок первичного ответа: до 10 рабочих дней."
          ]
        }
      ]
    }
  },
  en: {
    "/privacy": {
      title: "Privacy Policy",
      subtitle: "Personal data processing policy",
      effectiveDateLabel: "Effective date: 2026-03-27",
      backLabel: "Back",
      toAppLabel: "Open app",
      languageLabel: "Language",
      sections: [
        {
          heading: "What data we process",
          items: [
            "Account data: email, profile name, technical user identifier.",
            "Security service data: sign-in time, IP address, user-agent, session events.",
            "Service usage data: rooms, messages, and system logs generated while using the product."
          ]
        },
        {
          heading: "Why we process it",
          items: [
            "To provide access to the service and support authorization.",
            "To ensure security, investigate incidents, and prevent abuse.",
            "To deliver support and improve service stability."
          ]
        },
        {
          heading: "User rights",
          items: [
            "Request access to your data.",
            "Request correction or deletion of data where required by law.",
            "Withdraw consent where consent is the legal basis for processing."
          ]
        }
      ]
    },
    "/terms": {
      title: "Terms of Service",
      subtitle: "Terms of use",
      effectiveDateLabel: "Effective date: 2026-03-27",
      backLabel: "Back",
      toAppLabel: "Open app",
      languageLabel: "Language",
      sections: [
        {
          heading: "Basic rules",
          items: [
            "By using the service, you agree to these terms.",
            "The user must comply with applicable law and third-party rights.",
            "Administration may restrict access if rules or security requirements are violated."
          ]
        },
        {
          heading: "Liability",
          items: [
            "The service is provided on an as-is basis to the extent permitted by law.",
            "The user is responsible for content they publish or transmit.",
            "Administration may update these terms by publishing the current version on the website."
          ]
        }
      ]
    },
    "/cookies": {
      title: "Cookie Policy",
      subtitle: "How cookies are used",
      effectiveDateLabel: "Effective date: 2026-03-27",
      backLabel: "Back",
      toAppLabel: "Open app",
      languageLabel: "Language",
      sections: [
        {
          heading: "Why cookies are needed",
          items: [
            "Strictly necessary cookies are used for sign-in and session operation.",
            "Technical cookies help store user interface preferences.",
            "Non-essential cookies (if enabled) are used only after user consent."
          ]
        },
        {
          heading: "Cookie controls",
          items: [
            "You can change cookie settings in your browser.",
            "You can withdraw consent by clearing related cookies/local data.",
            "Details and updates are published on this page."
          ]
        }
      ]
    },
    "/contacts": {
      title: "Legal Contacts",
      subtitle: "Contacts for legal and data requests",
      effectiveDateLabel: "Effective date: 2026-03-27",
      backLabel: "Back",
      toAppLabel: "Open app",
      languageLabel: "Language",
      sections: [
        {
          heading: "Request channel",
          items: [
            "For personal data and legal requests: legal@datowave.com.",
            "Requests for access/correction/deletion are handled through this channel.",
            "Recommended first response time: up to 10 business days."
          ]
        }
      ]
    }
  }
};

export function LegalStandalonePage() {
  const [lang, setLang] = useState<Lang>(() => detectInitialLang());
  const [cookieConsentAccepted, setCookieConsentAccepted] = useState<boolean>(() => {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "1";
  });

  const pathname = window.location.pathname.toLowerCase();
  const page = useMemo<LegalPageData | null>(() => {
    if (LEGAL_PAGES[lang][pathname]) {
      return LEGAL_PAGES[lang][pathname];
    }
    const normalized = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return LEGAL_PAGES[lang][normalized] || null;
  }, [lang, pathname]);

  useEffect(() => {
    localStorage.setItem("boltorezka_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.title = page ? `${page.title} | Datowave` : "Datowave";
  }, [page]);

  if (!page) {
    window.location.replace("/");
    return null;
  }

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  };

  return (
    <main className="app legacy-layout mx-auto min-h-[100dvh] w-full max-w-[980px] px-4 py-6 desktop:px-8 desktop:py-10">
      <article className="card mx-auto w-full p-6 desktop:p-8">
        <header>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="secondary min-h-[36px] px-3"
                onClick={handleGoBack}
              >
                {page.backLabel}
              </button>
              <a
                href="/"
                className="secondary inline-flex min-h-[36px] items-center px-3"
              >
                {page.toAppLabel}
              </a>
            </div>
            <label className="ml-auto inline-flex items-center gap-2 text-xs text-pixel-muted">
              <span>{page.languageLabel}</span>
              <select
                className="min-h-[36px] rounded-md border border-white/15 bg-black/30 px-2 text-sm text-pixel-text"
                value={lang}
                onChange={(event) => setLang(event.target.value as Lang)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h1 className="text-3xl font-bold text-pixel-text">{page.title}</h1>
          <p className="mt-2 text-sm text-pixel-muted">{page.subtitle}</p>
          <p className="mt-2 text-xs text-pixel-muted">{page.effectiveDateLabel}</p>
        </header>

        <div className="mt-6 grid gap-6">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-pixel-text">{section.heading}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-pixel-muted">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-8 border-t border-white/10 pt-4">
          <LegalLinks lang={lang} />
        </div>
      </article>

      <CookieConsentBanner
        lang={lang}
        visible={!cookieConsentAccepted}
        onAccept={() => {
          localStorage.setItem(COOKIE_CONSENT_KEY, "1");
          setCookieConsentAccepted(true);
        }}
      />
    </main>
  );
}
