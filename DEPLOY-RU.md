# DrivePrep — инструкция развертывания

Сайт: <https://xoppop888.github.io/Driver_Test/>. Worker API: <https://driveprep-access-api.savage-rhg.workers.dev>.

## Перед запуском

Ранее в Supabase проекта DrivePrep применена исходная миграция `20261021000000_driveprep_access.sql` и импортировано 200 записей (100 на каждый Subject). Эта инструкция описывает аддитивное обновление до полного банка и закрытый Telegram-генератор. Не перезапускайте старую миграцию, не переписывайте публичную Git-историю и не меняйте видимость репозитория.

## Шаг 1. Миграция и полный банк Supabase

1. Откройте SQL Editor именно проекта DrivePrep и выполните `supabase/migrations/20261021010000_expand_question_bank_and_telegram.sql` целиком, после ранее применённой базовой миграции.
2. В доверенной среде выполните dry-run:

   ```bash
   node supabase/scripts/import-questions.mjs
   ```

   Ожидается: 4 378 записей, Subject 1 — 2 545, Subject 4 — 1 833; fingerprint первых 100 ID каждого Subject должен совпадать с прежним импортом.
3. Выполните пакетную загрузку (укажите секреты только в локальной shell-среде, не в frontend/чате/Git):

   ```bash
   SUPABASE_URL='https://<project-ref>.supabase.co' \
   SUPABASE_SERVICE_ROLE_KEY='<service-role-secret>' \
   node supabase/scripts/import-questions.mjs --write
   ```

   Импорт отправляет только данные вопроса и текстовое поле `image_url`; файлов картинок в Supabase Storage нет.

## Шаг 2. Cloudflare Worker

1. Убедитесь, что GitHub Actions secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID` сохранены в нужном репозитории. Их значения не следует выводить в лог.
2. В Cloudflare Worker `driveprep-access-api` проверьте `SUPABASE_URL` и точный `CORS_ORIGINS=https://xoppop888.github.io`.
3. Настройте или проверьте secrets `SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER` (не менее 32 случайных символов), `ADMIN_KEY` (не менее 32 случайных символов, максимум 256). Значения не добавляйте в `wrangler.jsonc`, GitHub Pages variables или код. Защитите `/v1/admin/*` через Cloudflare Access либо эквивалентную edge-защиту/rate limit; CORS само по себе не блокирует вызовы вне браузера.
4. После успешной миграции и импорта отправьте обновление в `main`: `.github/workflows/deploy-worker.yml` развернёт Worker. Либо запустите Worker workflow вручную.
5. Проверьте `GET https://driveprep-access-api.savage-rhg.workers.dev/health` (HTTP 200). Затем в SQL Editor выполните `select public.activate_full_question_bank();`. Продолжайте только при `{ "ok": true, "subject1": 2545, "subject4": 1833 }`. До этого момента старый и новый Worker продолжают выдавать premium прежние первые 100 записей.
6. Можно выполнить безопасные проверки session/CORS и admin unauthorized, не создавая кодов и не расходуя квоту.

В GitHub Actions настройка Pages автоматически при push отключена. Это намеренно: изменения frontend не должны публиковаться раньше схемы, полного банка и обновлённого Worker.

## Шаг 3. GitHub Pages

Только после успешной активации полного банка и проверки Worker вручную запустите `.github/workflows/deploy-pages.yml` через **Actions → Deploy to GitHub Pages → Run workflow**. Workflow собирает статический export и задаёт frontend URL API Worker. Старые frontend-клиенты без `mode` сохраняют контракт 100 premium вопросов. После завершения откройте сайт и проверьте Subjects 1/4, пагинацию premium-практики, 100-question premium exam, бесплатный лимит 50 на Subject и список ошибок.

## Шаг 4. Настройка Telegram

1. Создайте Telegram-бота у `@BotFather`.
2. Скопируйте токен напрямую в Cloudflare Worker secrets как `TELEGRAM_BOT_TOKEN`. Не вводите токен в `/admin`, браузер, GitHub Actions log или чат.
3. Откройте `https://xoppop888.github.io/Driver_Test/admin/`, введите сохранённый `ADMIN_KEY`, нажмите настройку Telegram и создайте pairing-код.
4. В личном чате с ботом отправьте `/pair <код>` до истечения короткого срока действия.
5. Проверьте `/generate 1`; код придёт файлом в тот же личный чат. Команда принимает 1–100. Не используйте группы/каналы: бот поддерживает только личный чат привязанного администратора. Плановой генерации и рассылки нет.

## Текущий статус и границы приватности

Предыдущий production-релиз содержал 200 вопросов. Новые миграция, полный импорт, Worker и Pages требуют отдельного запуска/проверки; этот текст сам по себе не означает, что обновление уже применено или опубликовано. Значения Worker secrets никогда не читаются/показываются в этой инструкции.

По ранее принятому решению исходный `data/questions.json` и изображения остаются в публичной Git-истории и доступны напрямую. Публикация через Worker защищает только приложение/API и не скрывает публичные коммиты или URL картинок.

## Проверки и rollback

Перед внешним запуском используйте `pnpm typecheck`, `pnpm build`, `cd worker && npm run typecheck`, `cd worker && npx wrangler deploy --dry-run`, dry-run импортёра и разбор SQL. Не запускайте `--write` в production как тест: запись импортирует/обновляет данные Supabase. При ошибке сборки или SQL остановите последовательность до Pages; не повторяйте неизвестный partial deploy вслепую. Проверьте фактический статус в соответствующем сервисе и восстановите совместимый Worker/frontend по проверенному плану.
