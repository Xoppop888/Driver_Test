# DrivePrep — статус и последний шаг настройки

Подключения уже работают; код опубликован. Руководство ниже описывает только текущее состояние и действие, которое ещё нужно выполнить вручную. **Секреты не отправляйте в чат и не добавляйте в Git.**

## Что уже сделано

- В Supabase создан проект `DrivePrep` в организации Binhai, регион Singapore; миграция применена, импортированы 200 вопросов — 100 для Subject 1 и 100 для Subject 4.
- Изменения опубликованы в `main` репозитория `Xoppop888/Driver_Test`.
- CI, GitHub Pages и Cloudflare Worker deployment завершились успешно.
- Страница: <https://xoppop888.github.io/Driver_Test/>.
- Worker API: <https://driveprep-access-api.savage-rhg.workers.dev>.
- GitHub Actions Secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID` уже используются рабочим workflow. Повторно создавать их не нужно.
- URL Worker уже задан в Pages workflow как публичная настройка. Отдельную GitHub Actions Variable `NEXT_PUBLIC_API_BASE_URL` добавлять не требуется.

## Остался один обязательный шаг: добавить три секрета в Cloudflare Worker

Worker уже развернут, но выдача вопросов, погашение кодов и панель администратора не заработают, пока Worker не получит серверные секреты.

1. Откройте **Cloudflare Dashboard → Workers & Pages → `driveprep-access-api` → Settings → Variables and Secrets**.
2. В разделе **Secrets** выберите добавление секрета и создайте три значения с именами **точно как ниже**:

   | Имя | Откуда взять / как создать |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → проект DrivePrep → **Project Settings → API Keys**. Нужен именно секретный `service_role` / secret key, не `anon` и не publishable key. |
   | `CODE_PEPPER` | Сгенерируйте случайное значение длиной не менее 32 символов. Например, в своём терминале выполните `openssl rand -hex 32`. |
   | `ADMIN_KEY` | Сгенерируйте ещё одно отдельное случайное значение той же командой. Сохраните его в менеджере паролей: этот ключ понадобится для входа на страницу администратора. |

   Команду `openssl rand -hex 32` для `CODE_PEPPER` и `ADMIN_KEY` выполните **два раза**, чтобы значения отличались. Вводите получившиеся строки прямо в Cloudflare; не присылайте их мне.
3. Сохраните изменения и, если Dashboard предложит, нажмите **Deploy**. Не меняйте и не удаляйте уже заданные secrets.

`SUPABASE_URL` уже прописан как публичная Worker variable в конфигурации проекта: `https://poiechqgfesrmuvcdnal.supabase.co`. CORS уже ограничен origin Pages `https://xoppop888.github.io`.

## После добавления секретов

- Проверьте health endpoint: <https://driveprep-access-api.savage-rhg.workers.dev/health>. Ожидается `{"ok":true,"service":"driveprep-access-api"}`. Это проверяет доступность Worker, а не работу Supabase RPC.
- Откройте приложение и запросите бесплатный набор вопросов. Для каждого Subject должно выдаваться до 50 вопросов в сутки по времени Китая.
- На <https://xoppop888.github.io/Driver_Test/admin/> введите сохранённый `ADMIN_KEY`, сгенерируйте один временный код и проверьте его погашение. Код отображается только при генерации — сразу сохраните его.
- После погашения кода для этого устройства должны выдаваться 100 вопросов по выбранному Subject.

## Важное о приватности банка вопросов

По вашему решению оставить публичную Git-историю без изменений, исходный `data/questions.json` остаётся в репозитории. Поэтому, хотя приложение после настройки API получает банк из Supabase и статическая Pages-сборка не включает JSON-файл, **исходный банк всё ещё можно скачать из публичного GitHub-репозитория и его истории**. Я не переписывал историю и не удалял файл.

## Справочные документы

- [Подробное описание инфраструктуры и API](README.infrastructure.md)
- [Cloudflare Workers — secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Workers — интеграция с Supabase](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — RPC](https://supabase.com/docs/reference/javascript/rpc)
