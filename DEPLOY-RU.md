# Пошаговая настройка DrivePrep

Инструкция для самостоятельного подключения Supabase, Cloudflare Worker и GitHub Pages. Выполняйте по порядку. Никакие реальные ключи/коды не добавляйте в Git или frontend.

## 0. Перенесите изменения в свой clone репозитория

Скачайте архив `driveprep-changes.zip`, распакуйте его в корень вашего локального clone `Driver_Test` с сохранением каталогов и разрешите замену изменённых файлов. Внутри архива — только изменённые/новые исходники и инструкции: нет `node_modules`, `out/`, `.git`, реальных секретов или JSON банка.

Если распаковываете через терминал, находясь в корне своего clone:

```bash
unzip -o /path/to/driveprep-changes.zip -d .
```

Сначала просмотрите `git status --short` и diff. Не добавляйте `data/questions.json` повторно в Pages artifact.

## 1. Создайте Supabase project и примените схему

1. Создайте проект в Supabase Dashboard и сохраните URL проекта. Создайте достаточно надёжный пароль БД и сохраните его в своём менеджере секретов.
2. Откройте **SQL Editor → New query**.
3. Откройте файл `supabase/migrations/20261021000000_driveprep_access.sql` из проекта, скопируйте SQL целиком в редактор и нажмите **Run**.
4. Убедитесь, что в schema `public` появились таблицы: `access_code_batches`, `access_codes`, `app_users`, `sessions`, `daily_question_usage`, `question_bank`.

Миграция включает RLS и закрывает прямой доступ `anon`/`authenticated` к таблицам и функциям. Не добавляйте публичные policies к этим данным.

## 2. Импортируйте вопросы в Supabase

В корне проекта сначала выполните dry-run. Он только проверяет выбранные записи и ничего не пишет:

```bash
node supabase/scripts/import-questions.mjs
```

Затем возьмите Project URL и `service_role` key в **Supabase Dashboard → Project Settings → API**. Это мастер-ключ БД: используйте его только в локальном терминале, не присылайте в чат, не помещайте в `.env` для Next.js и не добавляйте в GitHub Variables.

Linux/macOS, Bash:

```bash
read -rsp 'Supabase service_role key: ' SUPABASE_SERVICE_ROLE_KEY; echo
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY
node supabase/scripts/import-questions.mjs --write
unset SUPABASE_SERVICE_ROLE_KEY
```

Windows PowerShell:

```powershell
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = Read-Host 'Supabase service_role key'
node supabase/scripts/import-questions.mjs --write
Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY
```

Успешный импорт должен сообщить о 200 записях: по 100 для Subject 1 и Subject 4. Скрипт делает upsert по ID и не меняет остальные изображения/файлы.

## 3. Настройте и разверните Cloudflare Worker

Требуется Node.js 20+ и npm. В терминале:

```bash
cd worker
npm ci
npm run typecheck
npx wrangler login
```

Команда `wrangler login` откроет авторизацию Cloudflare в браузере. Затем создайте четыре Worker secrets. Команды попросят значение в интерактивном prompt; не передавайте реальные значения в аргументах команды и не включайте `set -x`:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CODE_PEPPER
npx wrangler secret put ADMIN_KEY
```

- `SUPABASE_URL` — Project URL Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` — только серверный service-role key из Supabase;
- `CODE_PEPPER` — случайная строка не короче 32 символов. Не теряйте её и не меняйте без причины: коды и сессии хешируются с этим значением;
- `ADMIN_KEY` — длинный случайный ключ администратора для создания кодов. Не используйте его как frontend variable.

У Worker уже задан `CORS_ORIGINS` в `worker/wrangler.jsonc`: `https://xoppop888.github.io`. Для GitHub Pages project-site `/Driver_Test/` origin тот же (без пути). Если вы публикуете Pages на другом домене, замените origin в `wrangler.jsonc` до deploy. В `worker/.dev.vars.example` указаны значения для локальной разработки; копируйте его в `.dev.vars`, локальный файл не коммитьте.

Разверните Worker:

```bash
npx wrangler deploy
```

Сохраните выданный базовый URL, например `https://driveprep-access-api.<account>.workers.dev`. Проверьте health route:

```bash
curl -fsS 'https://<имя-worker>.<аккаунт>.workers.dev/health'
```

Ожидается JSON с `"ok":true`. Если запрос из браузера блокируется CORS, проверьте `CORS_ORIGINS`: нужен только origin Pages без пути и без завершающего `/`.

## 4. Настройте GitHub Actions и опубликуйте Worker

Если вы хотите, чтобы дальнейшие изменения автоматически развёртывали Worker:

1. В Cloudflare создайте API token с разрешением для деплоя Workers, скопируйте значение и Account ID.
2. В GitHub откройте **Settings → Secrets and variables → Actions → Secrets** и добавьте:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare API token;
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare Account ID.
3. Эти два значения — Actions secrets, не variables и не строки в YAML.
4. После push workflow `.github/workflows/deploy-worker.yml` выполнит `npm ci`, typecheck и deploy. Можно также вручную запустить **Actions → Deploy Worker → Run workflow**.

Worker secret values `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER` и `ADMIN_KEY` задаются Worker commands в шаге 3, а не Actions environment.

## 5. Подключите Pages к Worker и опубликуйте frontend

1. В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и создайте variable:
   - `NEXT_PUBLIC_API_BASE_URL` = URL из шага 3 **без завершающего `/v1`** и без `/` на конце.
2. В **Settings → Pages** установите **Source: GitHub Actions**.
3. Убедитесь, что Pages workflow `.github/workflows/deploy-pages.yml` оставлен в ветке `main`.
4. Скопируйте изменения из архива в свой clone, просмотрите diff, затем commit/push в `main` обычным Git. При успешной сборке workflow опубликует `out/` в Pages.
5. Откройте страницу `/admin/`, например `https://xoppop888.github.io/Driver_Test/admin/`. Административный ключ вводится на странице для текущего запроса; страница его не сохраняет.

Пример публикации после проверки `git status` и diff:

```bash
git add .
git commit -m "Add DrivePrep access API and daily quota"
git push origin main
```

`NEXT_PUBLIC_API_BASE_URL` — публичная настройка URL, а не секрет. Не задавайте тут `SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER`, `ADMIN_KEY` или любой другой закрытый ключ.

## 6. Сгенерируйте и проверьте access-код

1. На `/admin/` задайте количество кодов (не более 100), при желании срок действия и комментарий.
2. Введите `ADMIN_KEY`, который ранее установлен в Cloudflare, и нажмите кнопку генерации.
3. Сразу скачайте CSV или скопируйте коды в свой защищённый канал хранения. Открытый код показывается один раз; в Supabase сохраняется только его хеш.
4. В приложении нажмите **Unlock / Код доступа**, введите один тестовый код. Должно появиться подтверждение активированного доступа.
5. Откройте Practice или Mock Exam: после активации API должен выдать 100 вопросов на выбранный Subject.
6. Повторно используйте тот же код в другом состоянии доступа: погашенный код должен быть отклонён.
7. В приватном окне/другом installation ID проверьте бесплатный ответ: для каждого Subject выдаётся до 50 вопросов на текущую дату Asia/Shanghai; повторный запрос в этот день должен вернуть тот же пул.

В ответах есть `resetAt` (следующая полночь Asia/Shanghai). Дневная квота относится к ID установки в браузере: очистка данных сайта/новый браузер создают новый анонимный ID и новый бесплатный лимит. Premium bearer-сессия действует 30 дней с последнего использования и продлевается при активном использовании; после полной очистки данных сессия не восстанавливается по ID установки.

## 7. Проверки перед передачей пользователям

В корне проекта:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

В `worker/`:

```bash
npm ci
npm run typecheck
npx wrangler deploy --dry-run
```

После live deploy дополнительно проверьте реальный `/health`, погашение кода, отказ повторного погашения, получение 50 бесплатных/100 premium вопросов и mobile viewport 375 px. Не выполняйте реальный тест погашения на единственном production-коде; сгенерируйте отдельный временный тестовый код.

## 8. Важное ограничение исходного банка

Полный исходный `data/questions.json` сейчас уже присутствует в GitHub-репозитории. Если репозиторий публичный, посетитель может скачать файл напрямую; отсутствие JSON в Pages `out/` не скроет исходник из репозитория или git-истории. Перед обещанием пользователям, что полный банк закрыт, решите отдельно: сделать репозиторий private либо согласовать удаление банка и очистку публичной истории. Не переписывайте историю без копии, плана и осознанного решения владельца. Изображения в `public/` также доступны напрямую.
