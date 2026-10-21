# DrivePrep — статус развертывания

## Развернуто и проверено

Supabase-проект `DrivePrep` в организации Binhai, Singapore настроен: миграция применена, импортированы **200 вопросов** — по 100 для Subject 1 и Subject 4. Изменения опубликованы в `main`; CI, GitHub Pages и Cloudflare Worker workflows завершились успешно.

Сайт: <https://xoppop888.github.io/Driver_Test/>. Worker API: <https://driveprep-access-api.savage-rhg.workers.dev>.

Health endpoint вернул HTTP 200, а CORS preflight от origin Pages разрешён. Безопасная проверка сессии с несуществующим тестовым токеном вернула HTTP 200 и `unlocked:false`, что подтверждает доступ к Supabase RPC. Проверка admin endpoint с заведомо неправильным ключом вернула ожидаемый HTTP 401. Проверки не создавали access-коды и не расходовали дневную квоту. Runtime secrets Worker загружены и проходят базовую проверку; их значения не выводились.

## Как пользоваться

Откройте [DrivePrep](https://xoppop888.github.io/Driver_Test/). Бесплатный режим выдаёт до 50 вопросов на каждый Subject в сутки по времени Китая; повторный запрос того же устройства в этот день получает тот же набор.

Для генерации кодов откройте [панель администратора](https://xoppop888.github.io/Driver_Test/admin/), введите сохранённый `ADMIN_KEY` и задайте число кодов. При необходимости можно добавить срок действия. Коды отображаются только при генерации — сразу скачайте CSV или сохраните их в защищённом месте. После погашения кода приложение должно выдавать 100 вопросов по выбранному Subject.

`SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER` и `ADMIN_KEY` хранятся как секреты Cloudflare Worker. `SUPABASE_URL` и `CORS_ORIGINS` — публичные Worker variables. `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID` используются GitHub Actions для будущих Worker deploy; заново создавать их не нужно. URL API уже задан в Pages workflow, поэтому отдельная GitHub Actions variable не требуется.

## Ограничение приватности банка

По вашему решению оставить публичную Git-историю без изменений исходный `data/questions.json` остаётся в GitHub. Статический Pages export не включает JSON-банк, а приложение получает выбранные вопросы через Worker и Supabase, однако исходный файл в публичном репозитории и его истории всё ещё можно скачать. Файл не удалялся, Git-история не переписывалась.

## Документация и официальные источники

- [Техническое описание backend/API](README.infrastructure.md)
- [Cloudflare Workers — secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers — интеграция с Supabase](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — RPC](https://supabase.com/docs/reference/javascript/rpc)
