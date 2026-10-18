# Деплой на VPS

Игра — это статика (≈ 60 КБ, из них ≈ 20 КБ после gzip), её раздаёт один контейнер nginx. Нет базы данных, нет секретов, нет пользовательских данных на сервере: прогресс игроков живёт в их браузерах. Бэкапы серверу не нужны, достаточно git-репозитория.

> Как устроен и обновляется наш боевой сервер, описано в [DEPLOY_PROD.md](DEPLOY_PROD.md).

## Требования к VPS

### Замеры (Docker на arm64, 17.10.2026)

| Что | Значение |
|---|---|
| Прод-образ `nhatrang-crossing` (nginx 1.27 alpine + статика) | 76 МБ |
| RAM контейнера nginx в покое | ≈ 14 МиБ |
| CPU в покое | ≈ 0 % |
| Сборочный образ (node 22 alpine + зависимости) | ≈ 360 МБ |
| Бандл: JS / CSS / HTML | 35 / 6 / 1.2 КБ (gzip: 14.5 / 2 / 0.6 КБ) |
| Сборка образа (`npm ci` + тесты + `tsc` + `vite build`) | ≈ 1 минута на ноутбуке |

Пиковое потребление памяти при сборке не замерялось. По опыту `npm ci` + `tsc` + `vite` занимают 400–700 МБ.

### Рекомендация

| | Минимум | Рекомендуется |
|---|---|---|
| CPU | 1 vCPU | 1 vCPU |
| RAM | 512 МБ — только если образ собирается не на VPS (или + 1 ГБ swap) | 1 ГБ, сборка прямо на VPS |
| Диск | 5 ГБ | 10 ГБ SSD (ОС + Docker + кэш сборки) |
| Трафик | любой тариф | любой тариф |
| ОС | любой Linux с Docker | Ubuntu 24.04 LTS или Debian 12 |
| Архитектура | amd64 или arm64 (базовые образы мультиархитектурные) | — |
| Расположение | — | Сингапур, Гонконг или Вьетнам: быстрее первая загрузка у игроков в Нячанге |

Оценка нагрузки (не замерялась): nginx на 1 vCPU отдаёт статику тысячами запросов в секунду. Первый визит — около 20 КБ трафика, потом всё берётся из кэша браузера. 10 000 визитов ≈ 200 МБ. Узким местом скорее станет канал, чем CPU или RAM.

Если на VPS уже живут другие проекты, игре хватит самого маленького слота. Отдельный сервер ей не нужен.

## Первый деплой

### 1. Подготовка сервера

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
sudo usermod -aG docker $USER
```

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

Если RAM 512 МБ–1 ГБ и сборка идёт на сервере, добавь swap:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Код на сервер

У репозитория пока нет удалённого remote. Варианты:
- запушить в GitHub или Gitea и сделать `git clone` на сервере;
- или скопировать файлы:

```bash
rsync -av --exclude node_modules --exclude dist --exclude .git ./ user@vps:/opt/nhatrang-crossing/
```

### 3. Запуск

Самый простой вариант — игра сразу на 80-м порту, без HTTPS:

```bash
cd /opt/nhatrang-crossing && PORT=80 docker compose up -d --build web
```

Сборка образа прогоняет тесты и `tsc`. Если они падают, образ не собирается и старая версия продолжает работать.

Проверка:

```bash
docker compose ps
```

```bash
curl -s http://localhost/healthz
```

Статус должен быть `healthy`, ответ `/healthz` — `ok`.

## HTTPS

Для PWA (добавление на домашний экран) и доверия браузеров нужен HTTPS. Два варианта.

### Вариант А: на сервере уже есть обратный прокси (nginx, Caddy, Traefik)

Опубликуй контейнер только на localhost и проксируй на него:

```bash
PORT=127.0.0.1:8080 docker compose up -d --build web
```

В прокси: `proxy_pass http://127.0.0.1:8080;` для nginx или `reverse_proxy 127.0.0.1:8080` для Caddy.

### Вариант Б: отдельный Caddy с автоматическим Let's Encrypt

> Пример конфигурации, в проекте пока не проверялся.

Создай рядом с `docker-compose.yml` файл `Caddyfile`:

```
game.example.com {
    encode zstd gzip
    reverse_proxy web:80
}
```

И `docker-compose.override.yml` (Compose подхватит его автоматически):

```yaml
services:
  web:
    ports: !reset []
  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
volumes:
  caddy_data:
  caddy_config:
```

DNS-запись A (и AAAA) домена должна указывать на VPS до первого запуска. Затем:

```bash
docker compose up -d --build
```

`!reset` требует Docker Compose ≥ 2.24.

## Обновление

```bash
cd /opt/nhatrang-crossing && git pull && docker compose up -d --build web
```

Хэшированные ассеты кэшируются у игроков навсегда, а `index.html` и манифест отдаются с `no-cache`. Поэтому новая версия подхватывается при следующем открытии без сброса кэша.

Откат: собрать предыдущий коммит. Ещё удобнее перед обновлением сохранить текущий образ:

```bash
docker tag nhatrang-crossing:latest nhatrang-crossing:prev
```

```bash
docker tag nhatrang-crossing:prev nhatrang-crossing:latest && docker compose up -d --no-build web
```

Чистка старых слоёв и кэша сборки (раз в несколько обновлений):

```bash
docker image prune -f && docker builder prune -f --filter until=168h
```

## Наблюдение

- `GET /healthz` → `ok` (без записи в access-лог). Подходит для UptimeRobot, Uptime Kuma и подобных сервисов.
- Встроенный healthcheck Docker каждые 30 с.
- `restart: unless-stopped` поднимает контейнер после падения и перезагрузки сервера.
- Логи: `docker compose logs -f web`. Ротация уже настроена: 3 файла по 10 МБ.

## Что настроено в nginx (`nginx.conf`)

| Что | Как |
|---|---|
| gzip | css, js, json, manifest, svg |
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` |
| `index.html`, манифест | `no-cache` |
| Заголовки | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN` |
| SPA-фолбэк | неизвестные пути отдают `index.html` |
| `/healthz` | `200 ok` |

## Чек-лист перед публичным запуском

- [ ] HTTPS и домен.
- [ ] Иконки PWA и `apple-touch-icon` (пока не сделаны, см. [ROADMAP.md](ROADMAP.md)).
- [ ] Проверка на реальных iPhone и Android: звук, тапы, safe-area, 60 fps.
- [ ] Мониторинг `/healthz`.
