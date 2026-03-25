# Domain Cutover Re-Onboarding Playbook

Цель: готовые шаблоны коммуникации и шаблон кампании invite/reset для текущих пользователей.

Scope:
- Без миграции старой БД.
- Переход пользователей на новый домен через re-onboarding.

## 1) Support window

- Рекомендуемое окно ручной поддержки входа: 30 дней.
- Эскалация инцидентов: через on-call канал и release owner.

## 2) User communication (short template)

Тема: Boltorezka переехал на новый домен

Текст:

Привет!

Мы перенесли Boltorezka на новый домен:
- Новый адрес: `https://datowave.com`
- Test адрес (если участвуешь в тестах): `https://test.datowave.com`

Что нужно сделать:
1. Открой новый адрес.
2. Войди через SSO.
3. Если вход не проходит, используй ссылку из invite/reset письма.

Старый адрес работает в режиме совместимости ограниченное время и будет отключен после окна перехода.

Если возникли проблемы со входом, ответь на это сообщение.

## 3) Invite/reset campaign template

Обязательные поля в кампании:
- userEmail
- inviteLink (new domain)
- resetLink (new domain)
- sentAtUtc
- status (`sent|opened|activated|failed`)
- notes

Минимальная валидация ссылок перед отправкой:
- host только `datowave.com`/`test.datowave.com`
- `https` only
- отсутствуют legacy host `*.gismalink.art`

## 4) Migration banner copy

Текст баннера для старого домена:

"Сайт переехал на новый домен datowave.com. Пожалуйста, авторизуйтесь повторно на новом адресе."

CTA:
- Кнопка: "Перейти на datowave.com"
- URL: `https://datowave.com`

## 5) Daily tracking template (invited -> activated)

- Дата:
- Invited total:
- Activated total:
- Pending:
- Failed deliveries:
- Top blockers:
- Следующие действия:

## 6) Completion criteria for re-onboarding phase

- Для всех текущих пользователей есть статус в tracking sheet.
- Нет pending старше 7 дней без follow-up.
- По завершению окна поддержки сформирован итоговый отчет (invited/activated/pending).
