# DrivePrep — статус реализации

## Реализовано локально
- [x] Frontend запрашивает вопросы у Worker, полный JSON исключён из client imports/static export.
- [x] Бесплатный API-пул выдаёт максимум 50 вопросов на Subject в сутки, учитывает дату на сервере в часовом поясе Asia/Shanghai, стабилен при повторных запросах.
- [x] Полный режим выдаёт 100 вопросов на выбранный Subject после серверной проверки сессии.
- [x] Подготовлена Supabase-схема с кодами, пользователями/установками, сессиями, дневной выдачей и банком вопросов; прямой browser access закрыт; атомарные RPC готовы.
- [x] Worker содержит одноразовое погашение кода, создание session, выдачу вопросов и CORS allowlist. Коды и сессии хранятся только как хеши.
- [x] `/admin` создаёт до 100 кодов за запрос через admin API, показывает plaintext только в ответе генерации и позволяет скачать CSV.
- [x] Service worker не кэширует API/вопросы; длинные ответы переносятся, нижние отступы учитывают мобильный safe-area.
- [x] Созданы миграция/import script, Worker Wrangler-конфигурация, Pages/Worker workflows и инструкции без реальных секретов.
- [x] Проверки прошли: `pnpm typecheck`, `pnpm build`, `cd worker && npm run typecheck`, `npx wrangler deploy --dry-run`, import dry-run 200 записей. Развёртывания и live DB tests не выполнялись.

## Принятая граница анонимного лимита

- [x] Лимит привязан к installation ID браузера/установки, а не к подтверждённой личности. Пользователь принял, что очистка данных сайта или новое устройство может создать новый ID и начать дневную квоту заново.

## Требуется подключение внешних сервисов до запуска

- [ ] Применить `supabase/migrations/20261021000000_driveprep_access.sql` к нужному проекту Supabase.
- [ ] Запустить `supabase/scripts/import-questions.mjs --write` в доверенной среде с Supabase service-role secret.
- [ ] Задать Worker secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER`, `ADMIN_KEY`; сохранить CORS origin в `worker/wrangler.jsonc`.
- [ ] Добавить GitHub Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` и GitHub repository variable `NEXT_PUBLIC_API_BASE_URL`.
- [ ] Развернуть Worker, затем опубликовать Pages и проверить реальные погашение кода, две конкурентные активации и переход суток в Asia/Shanghai.
- [ ] Не утверждать, что банк защищён от скачивания, пока полный JSON остаётся в GitHub-репозитории/истории, если он публичен; изображения также доступны как статические файлы.
