# DrivePrep

Двуязычное адаптивное приложение для подготовки к теоретическим экзаменам на водительские права в Китае: Subject 1 и Subject 4. Вопросы и интерфейс доступны на русском и английском языках.

Для самостоятельной настройки Supabase, Cloudflare Worker и GitHub Pages выполните шаги в [DEPLOY-RU.md](DEPLOY-RU.md).

## Freemium-модель

Для каждого Subject сервер ежедневно выдаёт анонимному пользователю отдельный стабильный набор до 50 вопросов; квота обновляется в полночь по часовому поясу `Asia/Shanghai`. Вопросы полного режима выдаются по серверной сессии после погашения одноразового кода; на каждый Subject хранится по 100 выбранных вопросов.

Дневное использование хранится на сервере, поэтому повторный запрос с тем же ID браузерной установки в течение дня возвращает тот же пул, а не обнуляет квоту. Это не строгая проверка личности: очистка данных сайта, новое устройство или подмена ID могут создать новую анонимную установку. Для более надёжной привязки потребуется аккаунт пользователя. Текст банка вопросов больше не импортируется во frontend bundle; браузер получает вопросы только от Worker API после проверки доступа.

## Проект и запуск frontend

Требуется Node.js 20+ и pnpm 10+.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
# укажите URL развернутого Worker в NEXT_PUBLIC_API_BASE_URL
pnpm dev
```

Проверка типов и сборка GitHub Pages:

```bash
pnpm typecheck
pnpm build
```

После сборки статический результат находится в `out/`. Секреты Supabase, Cloudflare и админский ключ не должны находиться в публичных `NEXT_PUBLIC_*` переменных.

## Supabase: миграция и загрузка банка

1. Создайте проект Supabase и откройте его SQL Editor.
2. Выполните миграцию `supabase/migrations/20261021000000_driveprep_access.sql`. Она создаёт `access_code_batches`, `access_codes`, `app_users`, `sessions`, `daily_question_usage`, `question_bank`, включает RLS и закрывает прямой доступ `anon`/`authenticated` к таблицам и RPC; Worker использует привилегированный `service_role`.
3. Проверьте детерминированный выбор без записи: `node supabase/scripts/import-questions.mjs`.
4. Загрузите 200 записей (100 на каждый Subject) с секретом, полученным в Supabase Dashboard → Project Settings → API. Выполняйте импорт только в доверенной локальной среде:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-secret>" \
node supabase/scripts/import-questions.mjs --write
```

Секрет `service_role` даёт административный доступ к БД: не добавляйте его в git, frontend или Actions logs. Скрипт повторного импорта идемпотентен по ID и `upsert`-ит записи вопросника.

## Cloudflare Worker

`worker/` содержит API и конфигурацию Wrangler. Локальная разработка:

```bash
cd worker
npm ci
cp .dev.vars.example .dev.vars
# заполните локальные secrets в worker/.dev.vars
npm run typecheck
npm run dev
```

Установите секреты Worker через `wrangler secret put <NAME>` (никогда не добавляйте их в Wrangler vars или git):

- `SUPABASE_URL` — URL проекта Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` — привилегированный ключ Supabase;
- `CODE_PEPPER` — случайная строка не менее 32 символов для хеширования access-кодов и сессий; её смена сделает ранее выпущенные коды и сессии недействительными;
- `ADMIN_KEY` — длинный случайный ключ для панели генерации;

`CORS_ORIGINS` — отдельная публичная настройка allowlist в `worker/wrangler.jsonc` (`vars`), а не секрет. Для локальной разработки точный origin указан в `worker/.dev.vars.example`; не используйте wildcard `*`.

Деплой вручную: `cd worker && npx wrangler deploy`. В GitHub Actions workflow `.github/workflows/deploy-worker.yml` использует secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`. Токен Cloudflare должен разрешать deploy Workers; для эксплуатации API сначала выполните SQL-миграцию, импортируйте банк и установите все Worker secrets.

### Worker API

- `GET /health` — проверка процесса Worker без доступа к БД;
- `POST /v1/access/redeem` — атомарное погашение одноразового кода и создание сессии;
- `GET /v1/access/session` — проверка активной сессии;
- `GET /v1/questions?subject=1|4&installationId=...` — бесплатный дневной набор или полный набор по сессии;
- `POST /v1/admin/access-codes` — генерация партии кодов (требует `X-Admin-Key`).

Коды криптографически случайны, нормализованный код хешируется с Worker-held pepper, а исходный текст не сохраняется. Текст кода возвращается администратору только в ответе генерации; панель доступна по `/admin` и предлагает однократную выгрузку CSV. Панель не хранит административный ключ между запросами/перезагрузками. Публичное размещение страницы не раскрывает ключ, но для усиления защиты её можно дополнительно ограничить Cloudflare Access.

## GitHub Pages

1. В GitHub → Settings → Pages выберите источник **GitHub Actions**.
2. Добавьте repository variable `NEXT_PUBLIC_API_BASE_URL` со значением базового URL Worker, например `https://driveprep-access-api.<account>.workers.dev` (без `/v1` в конце).
3. Запустите workflow `.github/workflows/deploy-pages.yml` или выполните push в `main` после предоставления прав репозиторию.
4. GitHub Pages origin также должен быть в `CORS_ORIGINS` Worker. Для project Pages путь репозитория (`/Driver_Test/`) не указывается в CORS origin.

Workflow вычисляет `BASE_PATH` для GitHub Pages; прежний `NEXT_PUBLIC_UNLOCK_CODE` не используется. Service worker не кэширует API-ответы, entitlement или набор вопросов. Приложение требует сеть для загрузки банка.

## Текущие ограничения и данные

- Анонимный installation ID не является надёжной идентичностью и может быть заменён очисткой сайта или новым браузерным профилем. Если дневной лимит нужно строго привязать к человеку, перед запуском добавьте обязательный аккаунт.
- Административный API защищён случайным `ADMIN_KEY`; дополнительно ограничьте `/v1/admin/*` через Cloudflare Access и ротируйте ключ при утечке.
- Репозиторий сейчас содержит исходный `data/questions.json` (полный архивный банк). Если GitHub-репозиторий публичный, этот исходник доступен читателю напрямую и backend-gate не защищает его. Перед тем как считать банк закрытым, следует сделать репозиторий private либо отдельно согласовать удаление данных из текущей версии и очистку публичной git-истории; простой `.gitignore` или удаление файла из одного коммита не скрывает прошлые версии.
- Изображения вопросов, если на них ссылаются исходные данные, остаются статическими ресурсами GitHub Pages и технически доступны напрямую. Даже после переноса JSON в приватный банк для полной защиты изображений нужно перенести их в приватное хранилище и выдавать временные URL.
- Исходный архив и изображения относятся к версии банка 2022 года; проверьте права и актуальность правил перед публичным или коммерческим запуском. См. [`data/ATTRIBUTIONS.md`](data/ATTRIBUTIONS.md).

## Существующие сценарии CI

- `.github/workflows/ci.yml` — frontend typecheck и статическая сборка.
- `.github/workflows/deploy-pages.yml` — публикация Pages.
- `.github/workflows/deploy-worker.yml` — проверка и deploy Worker после добавления Cloudflare Actions secrets.
