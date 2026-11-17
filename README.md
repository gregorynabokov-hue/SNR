# СНР OS — Сенсорная Нейропластическая Рекалибровка

PWA без сборки: HTML5 / CSS3 / Vanilla JS, Web Audio API, Canvas, Vibration API, localStorage.

## Запуск на GitHub Pages
1. Загрузите все файлы из архива в корень репозитория.
2. Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Откройте `https://<user>.github.io/<repo>/` и установите на главный экран.

Локально: `python3 -m http.server 8000` и откройте http://localhost:8000.
Service worker и камера работают только по HTTPS (или localhost).

## Файлы
`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png`.
При изменении файлов увеличьте `VER` в `sw.js`.

Не является медицинским изделием. Исследовательский инструмент.
