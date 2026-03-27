import { CookieConsentBanner } from "./components/CookieConsentBanner";
import { LegalLinks } from "./components/LegalLinks";
import { useEffect, useMemo, useState } from "react";

const COOKIE_CONSENT_KEY = "boltorezka_cookie_consent_v1";

type LegalPageData = {
  title: string;
  subtitle: string;
  sections: Array<{ heading: string; items: string[] }>;
};

const LEGAL_PAGES: Record<string, LegalPageData> = {
  "/privacy": {
    title: "Privacy Policy",
    subtitle: "Политика обработки персональных данных",
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
    title: "Terms of Service",
    subtitle: "Условия использования",
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
    title: "Cookie Notice",
    subtitle: "Использование cookie",
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
    title: "Contacts / Legal",
    subtitle: "Контакты по вопросам данных и права",
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
};

export function LegalStandalonePage() {
  const [cookieConsentAccepted, setCookieConsentAccepted] = useState<boolean>(() => {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "1";
  });

  const pathname = window.location.pathname.toLowerCase();
  const page = useMemo<LegalPageData | null>(() => {
    if (LEGAL_PAGES[pathname]) {
      return LEGAL_PAGES[pathname];
    }
    const normalized = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    return LEGAL_PAGES[normalized] || null;
  }, [pathname]);

  useEffect(() => {
    document.title = page ? `${page.title} | Datowave` : "Datowave";
  }, [page]);

  if (!page) {
    window.location.replace("/");
    return null;
  }

  return (
    <main className="app legacy-layout mx-auto min-h-[100dvh] w-full max-w-[980px] px-4 py-6 desktop:px-8 desktop:py-10">
      <article className="card mx-auto w-full p-6 desktop:p-8">
        <header>
          <h1 className="text-3xl font-bold text-pixel-text">{page.title}</h1>
          <p className="mt-2 text-sm text-pixel-muted">{page.subtitle}</p>
          <p className="mt-2 text-xs text-pixel-muted">Effective date: 2026-03-27</p>
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
          <LegalLinks />
        </div>
      </article>

      <CookieConsentBanner
        visible={!cookieConsentAccepted}
        onAccept={() => {
          localStorage.setItem(COOKIE_CONSENT_KEY, "1");
          setCookieConsentAccepted(true);
        }}
      />
    </main>
  );
}
