# Перейди дорогу в Нячанге

«Frogger наоборот» для телефона. Местный закон: **иди медленно и ровно, и байки объедут тебя сами.** Один тап — один шаг. Ускоришься, замрёшь или дёрнешься, и байкер, уже выбравший траекторию, промахнётся.

Статическая веб-игра (Vite + TypeScript + Canvas, без бэкенда), раздаётся одним контейнером nginx. **Всё запускается только в Docker**, Node на хосте не нужен.

## Быстрый старт

```bash
docker compose --profile dev up --build dev
```

Разработка: http://localhost:5173, с телефона — `http://<IP мака>:5173`.

```bash
docker compose run --rm dev npm test
```

```bash
docker compose up -d --build web
```

Прод (nginx) на http://localhost:8080; порт меняется через `PORT=80`.

## Документация

| Документ | Что внутри |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | идея, ритм, как водители объезжают, транспорт, улицы, звёзды, тексты, стиль, звук |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | структура кода, симуляция и `tick()`, константы, рендер, UI, главный цикл, тесты |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | команды, тесты, балансный симулятор, боты, как добавить улицу, ручки сложности |
| [docs/DEPLOY.md](docs/DEPLOY.md) | **требования к VPS**, первый деплой, HTTPS, обновление и откат, мониторинг |
| [docs/DEPLOY_PAGES.md](docs/DEPLOY_PAGES.md) | **GitHub Pages**: бесплатный хостинг с HTTPS, что настроено и что сделать при первом запуске |
| [docs/DEPLOY_PROD.md](docs/DEPLOY_PROD.md) | **боевой сервер**: где живёт игра, как обновить и откатить, обходы блокировок, типовые проблемы |
| [docs/ROADMAP.md](docs/ROADMAP.md) | что готово, что дальше, известные ограничения |

## Требования к VPS (кратко)

1 vCPU, 1 ГБ RAM, 10 ГБ SSD, Ubuntu 24.04 или Debian 12 с Docker. Контейнер в работе занимает около 14 МиБ RAM, образ — 76 МБ. При сборке на сервере с 512 МБ RAM нужен swap. Подробности, замеры и HTTPS — в [docs/DEPLOY.md](docs/DEPLOY.md).
