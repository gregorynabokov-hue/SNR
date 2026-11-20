# Прокси на Deno Deploy (без командной строки)

1. Откройте **console.deno.com** и войдите через GitHub.
2. Создайте новый проект (New project / Playground) с пустым шаблоном.
3. Удалите весь код в редакторе и вставьте содержимое `proxy/deno-deploy.ts`.
4. Откройте **Settings → Environment Variables** и добавьте:
   - `ALLOWED_ORIGIN` = `https://gregorynabokov-hue.github.io`
   - `LLM_BASE_URL` = `https://coarena.ai/api/v1`
   - `LLM_MODEL` = название модели из кабинета Coarena
   - `OPENAI_API_KEY` = **новый** ключ Coarena (старый отзовите)
5. Нажмите **Save & Deploy**. Адрес будет вида `https://<имя>.deno.dev`.
6. Вставьте адрес в настройки сайта: Настройки → «Адрес сервера вступлений».

Интерфейс Deno Deploy меняется. Если названия пунктов отличаются, ищите раздел переменных окружения в настройках проекта.
