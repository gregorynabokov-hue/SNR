# Чек-лист: внедрение ИИ-вступлений на ноутбуке

## 0. Что нужно заранее
- Node.js 18+ (проверка: `node -v` в терминале).
- Аккаунт Cloudflare (cloudflare.com, бесплатный).
- Новый ключ Coarena. Старый, который был на скриншоте, должен быть отозван.
- Название модели из кабинета Coarena.

## 1. Папка проекта
```
mkdir snr-proxy && cd snr-proxy
```
Скопируйте в неё `worker.js` и `wrangler.toml` из папки `proxy/` архива.
В `wrangler.toml` замените `REPLACE_WITH_MODEL` на название модели.

## 2. Вход и секрет
```
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
```
Вставьте новый ключ Coarena, когда программа попросит. Ключ никуда не сохраняется в файлах.

## 3. Деплой
```
npx wrangler deploy
```
В выводе будет адрес вида `https://snr-os-scenario.<аккаунт>.workers.dev`. Скопируйте его.

## 4. Проверка из терминала
```
curl -X POST https://ВАШ-АДРЕС.workers.dev -H "Content-Type: application/json" -H "Origin: https://gregorynabokov-hue.github.io" -d "{\"protocol\":\"shield\",\"day\":1,\"vuln\":[60,40,20,50],\"recent\":[]}"
```
Ожидаемо: JSON с полями `title` и `intro`.
- `403` — не совпадает `ALLOWED_ORIGIN`.
- `502` — проблема с ключом, моделью или адресом Coarena. Смотрите логи: `npx wrangler tail`.

## 5. Подключение к сайту
Настройки сайта → «Адрес сервера вступлений» → вставьте адрес воркера.
Откройте любую инструкцию перед сессией: вместо стандартного текста должно появиться вступление от модели.

## 6. Если что-то не работает
Пришлите вывод `curl` и строки из `npx wrangler tail` (без ключа). Из них видно, на каком шаге сбой.
