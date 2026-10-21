# DrivePrep — backend infrastructure

Техническое руководство по Supabase и Cloudflare Worker. Пошаговый release runbook — [`DEPLOY-RU.md`](DEPLOY-RU.md).

## Политика доступа

| Режим | На каждый Subject | Поведение |
|---|---:|---|
| Бесплатный | До 50 вопросов за календарный день `Asia/Shanghai` | Атомарно сохраняется стабильный пул ID; повторные обращения в тот же день возвращают его же. |
| Premium до активации полного банка | Существующие первые 100 вопросов | Сохраняет работающий production API до миграции данных и обновления Worker. |
| Premium после активации | Subject 1: 2 545; Subject 4: 1 833 | Практика загружает страницы; одна premium-попытка экзамена содержит 100 случайных вопросов. |

Обновлённый Worker сохраняет legacy-контракт для запросов без `mode`: premium получает первые 100 доступных вопросов, free — сохранённые 50. Новые клиенты явно передают `mode=practice` или `mode=exam`. Эта совместимость позволяет обновить API до frontend и безопасно включить банк до ручного Pages release.

Бинарные изображения в Supabase Storage не загружаются. В `question_bank` остаётся строковый `image_url` и JSON-поля вопроса.

## Файлы

| Путь | Назначение |
|---|---|
| `worker/src/index.ts` | CORS, access/session, pagination, exam, lookup ошибок, Telegram setup/webhook |
| `worker/src/crypto.ts` | Хеширование кодов/сессий, pairing-code, webhook secret, constant-time admin comparison |
| `worker/wrangler.jsonc` | Публичные Worker variables; никакие реальные secrets не записывать сюда |
| `supabase/migrations/20261021000000_driveprep_access.sql` | Уже применённая исходная схема/RPC |
| `supabase/migrations/20261021010000_expand_question_bank_and_telegram.sql` | Аддитивное расширение, rollout-state, activation RPC, Telegram tables/RPC |
| `supabase/scripts/import-questions.mjs` | Dry-run и batch upsert 4 378 записей, не передающий image binaries |
| `.github/workflows/deploy-pages.yml` | Только ручная публикация Pages после готовности backend |

## Supabase: миграция, импорт, активация

1. В проекте Supabase, где уже применена базовая миграция, примените только `20261021010000_expand_question_bank_and_telegram.sql`. Миграция сохраняет прежний premium/free pool до отдельной активации полного банка.
2. Проверьте локально:

   ```bash
   node supabase/scripts/import-questions.mjs
   ```

   Ожидаются Subject 1 — 2 545 записей и Subject 4 — 1 833. Первые 100 рангов у обоих предметов совпадают с прежним выбором.
3. После проверки выполните идемпотентный upsert порциями по 250 в доверенной среде:

   ```bash
   SUPABASE_URL='https://YOUR_PROJECT.supabase.co' \
   SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY' \
   node supabase/scripts/import-questions.mjs --write
   ```

   Скрипт посылает только текстовые/JSON-поля и URL; изображения из файловой системы не открывает.
4. Убедитесь, что новая версия Worker развернута. Только после этого в SQL Editor выполните:

   ```sql
   select public.activate_full_question_bank();
   ```

   Функция включает доступ лишь при точном наличии 2 545 и 1 833 записей. Ожидается `{ "ok": true, ... }`; неполный импорт возвращает `question_bank_incomplete` и не включает банк. Не запускайте активацию раньше Worker rollout. До неё premium продолжает видеть прежние 100 вопросов, даже если импорт уже закончен.
5. После проверки activation запускайте GitHub Pages workflow вручную. Старый frontend без `mode` продолжает получать привычные первые 100 premium-вопросов и до публикации новой версии.

Таблицы/RPC закрыты для browser roles; RLS включён, `SECURITY DEFINER` функции используют `search_path = ''`, явную схему и grants только необходимым ролям. `activate_full_question_bank()` доступна сервисной роли и владельцу БД в SQL Editor. Не выдавайте `service_role` браузеру.

## Worker: локальная настройка и секреты

```bash
cd worker
npm ci
cp .dev.vars.example .dev.vars
npm run typecheck
npm run dev
```

Не коммитьте `.dev.vars`. Production secrets задаются в Cloudflare Worker (Dashboard либо `wrangler secret put NAME`):

| Secret | Назначение |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Серверные RPC Supabase |
| `CODE_PEPPER` | Случайные ≥32 символов; ротация аннулирует коды/сессии |
| `ADMIN_KEY` | Случайная строка от 32 до 256 символов для администрирования |
| `TELEGRAM_BOT_TOKEN` | Token из `@BotFather`; хранить только как Worker secret |

`SUPABASE_URL` и `CORS_ORIGINS` — обычные Worker variables в `worker/wrangler.jsonc`; `CORS_ORIGINS` — exact-origin allowlist. GitHub Actions Worker deploy требует существующие secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`.

Закройте `/v1/admin/*` edge-политикой Cloudflare Access либо эквивалентной защитой/rate limiting. Сам `ADMIN_KEY` остаётся обязательным вторым рубежом; CORS не блокирует непредназначенные для браузера вызовы. Перед deploy проверьте, что сохранённый `ADMIN_KEY` соответствует минимуму 32 символа. Не логируйте и не публикуйте секрет.

## HTTP API

Все ответы `Cache-Control: no-store`; browser origins ограничены точным CORS allowlist.

| Метод / endpoint | Назначение |
|---|---|
| `GET /health` или `/v1/health` | Health-check без обращения к базе |
| `POST /v1/access/redeem` | Погашение одноразового кода, создание сессии |
| `GET /v1/access/session` | Проверка bearer-сессии |
| `GET /v1/questions?subject=1\|4&installationId=…` | Legacy-контракт: 100 premium либо до 50 free |
| `GET /v1/questions?subject=1\|4&installationId=…&mode=practice&offset=0&limit=50` | Явный постраничный режим; ответ включает `total` и `nextOffset` |
| `GET /v1/questions?subject=1\|4&installationId=…&mode=exam` | Случайный набор: 100 premium или до 50 вопросов из free pool |
| `POST /v1/questions/lookup` | Возвращает только переданные ID, доступные текущей free/premium entitlement |
| `POST /v1/admin/access-codes` | `{count:1..100, expiresAt?, note?}`, заголовок `X-Admin-Key` |
| `POST /v1/admin/telegram/setup` | Настраивает webhook, требует `X-Admin-Key` |
| `POST /v1/admin/telegram/pairing-code` | Выпускает одноразовый короткоживущий pairing-код, требует `X-Admin-Key` |
| `POST /v1/telegram/webhook` | Принимает только Telegram updates с корректным `X-Telegram-Bot-Api-Secret-Token` |

`installationId` (8–128 символов) — анонимный ID браузера, не доказательство личности. Без действительного bearer token он даёт только бесплатный пул. Токен сессии хранится в приложении; Supabase получает его hash.

### Практика, экзамен и ошибки

Premium practice запрашивает страницы размером до 50 вопросов; сервер повторно удостоверяет entitlement на каждом запросе. Frontend передаёт явный `mode=practice`. Exam использует `mode=exam` и серверно случайную выборку из разрешённого пула. Ошибки передают только локально сохранённые question IDs; Worker пересекает их с активными разрешениями, прежде чем загрузить записи из RPC.

## Telegram: только личный чат администратора

После установки `TELEGRAM_BOT_TOKEN` в Worker откройте `/admin`, задайте webhook и создайте pairing-код. В личном чате с ботом отправьте `/pair <код>`. После привязки команда `/generate N`, где `N` от 1 до 100, отправит CSV-документ в тот же личный чат. Группы, каналы, рассылка и расписание не поддерживаются.

Webhook принимает только private messages, сверяет `X-Telegram-Bot-Api-Secret-Token` и связывает один `chat.id`/`from.id`. Pairing/access-коды хешируются до записи. `update_id` claim атомарен: повтор webhook update не создаст вторую партию. Если отправка документа после создания batch не удалась, plaintext-коды не восстанавливаются и автоматически повторно не отправляются.

## Публичные данные и ограничения

По принятому решению исходная публичная Git-история остаётся без изменений. Полный `data/questions.json` и статические изображения можно скачать напрямую из публичного репозитория/Pages; Worker защищает выдачу приложения, а не исходные файлы. Анонимный installation ID допускает сброс квоты при очистке данных/смене браузера.
