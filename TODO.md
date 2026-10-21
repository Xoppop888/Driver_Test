# DrivePrep — статус реализации

## Локальная реализация

- [x] **Бесплатный доступ:** не более 50 вопросов каждого Subject в сутки; сброс по `Asia/Shanghai`; повторный запрос в тот же день возвращает тот же пул. Квота привязана к анонимному installation ID, поэтому очистка данных/новое устройство может создать новый ID.
- [x] **Полный банк:** одноразовый код открывает 4 378 вопросов — 2 545 Subject 1 и 1 833 Subject 4. Premium-практика запрашивает страницы до 50 вопросов; одна premium-попытка экзамена содержит 100 случайных вопросов выбранного Subject.
- [x] **Ошибки:** practice flow по `?mistakes=true` и `?question=<id>` получает только серверно разрешённые вопросы по сохранённым ID; полный банк для страницы ошибок не загружается.
- [x] **Данные:** новая аддитивная миграция расширяет ранги, хранит текстовый `image_url`, сохраняет JSON-поля и первые 100 прежних рангов. Бинарные изображения в Supabase не загружаются.
- [x] **Безопасный rollout:** миграция сохраняет прежнюю выдачу 100 premium-вопросов до явного `activate_full_question_bank()` после проверки количества записей и deploy Worker. RPC выдачи сохраняет legacy-контракт, включая запросы без `mode`; Pages workflow запускается вручную.
- [x] **Telegram:** личный чат одного администратора, одноразовый pairing-код, `/generate N` для 1–100 кодов в CSV-файле, webhook secret-token check, проверка private chat/user и идемпотентная обработка `update_id`. Нет групп, каналов, рассылок и расписания. `TELEGRAM_BOT_TOKEN` предназначен для Worker secret; plaintext access-коды не сохраняются в БД/логах.
- [x] **Локальная проверка:** frontend typecheck/build, Worker typecheck, Wrangler dry-run, import dry-run (4 378), PostgreSQL parse обеих миграций и `git diff --check` пройдены; frontend export не содержит полного JSON-банка.

## Production-действия — пока не выполнены

- [ ] Применить `20261021010000_expand_question_bank_and_telegram.sql` к существующему Supabase после базовой миграции.
- [ ] Выполнить `supabase/scripts/import-questions.mjs --write` в доверенной среде с service-role secret и подтвердить 2 545 + 1 833 записей.
- [ ] Проверить/задать Cloudflare Worker secrets (`CODE_PEPPER` ≥32 случайных символа, `ADMIN_KEY` 32–256 случайных символов). До развертывания настроить Cloudflare Access или аналогичную edge-защиту/rate limiting для `/v1/admin/*`.
- [ ] Развернуть обновлённый Worker, затем вызвать `select public.activate_full_question_bank();` и продолжать только при `ok=true` и полных счётчиках.
- [ ] После проверки Worker/activation вручную запустить Pages workflow.
- [ ] Пользователь должен установить `TELEGRAM_BOT_TOKEN` как Cloudflare Worker secret, затем `/admin` устанавливает webhook/pairing; Telegram pairing-команду `/pair <код>` администратор отправляет из личного чата.
- [ ] Выполнить production smoke checks без генерации реальных кодов и без искусственного расхода дневной квоты.

## Публичные данные

- [x] Сохранить публичную Git-историю без переписывания по решению пользователя. Исходный `data/questions.json` и статические изображения остаются доступными напрямую; server-side access gate не скрывает их из публичного репозитория/истории.

## UI и доступность сети

- [x] Окно ввода access-code вынесено в portal `document.body`, чтобы sticky header с `backdrop-filter` не обрезал его; мобильный вид учитывает safe area и экранную клавиатуру.
- [ ] Выбрать надёжный API endpoint для mainland China. Сейчас Pages отправляет запросы на `driveprep-access-api.savage-rhg.workers.dev`; проверка с внешней сети показывает health/CORS HTTP 200, но теста из Китая нет. Требуется либо пользовательский домен для Worker (может улучшить доступность, но не гарантирует её), либо размещение/ускорение, доступное в Китае с необходимой ICP/регуляторной готовностью.
- [ ] После выбора endpoint обновить Pages build variable и выполнить тест на реальном подключении без VPN из Китая.
