# Прод-сервер: как деплоить

Рабочая инструкция для боевого сервера игры. Общие требования к VPS, HTTPS и настройки nginx описаны в [DEPLOY.md](DEPLOY.md). Здесь — что реально настроено на нашем сервере и как его обновлять.

Первый деплой: 18.10.2026.

## Сервер

| Что | Значение |
|---|---|
| IP | `185.87.51.137` |
| Хост | `vds3079971.my-ihor.ru` |
| Игра | http://185.87.51.137/ |
| Healthcheck | http://185.87.51.137/healthz → `ok` |
| ОС | Ubuntu 24.04, ядро 6.8, amd64 |
| Ресурсы | ≈ 700 МБ RAM, диск 8.7 ГБ (занято ≈ 27 %) |
| Docker | 29.1.3, пакет `docker.io` из Ubuntu |
| Вход | `ssh root@185.87.51.137` (пароль в репозиторий не кладём) |
| Код на сервере | `/opt/frogger` |
| Контейнер | `frogger`, образ `nhatrang-crossing:latest`, порт 80 → 80 |

## Особенности сервера (важно)

### 1. Нет `docker compose` и buildx

Команды `docker compose ...` из README и [DEPLOY.md](DEPLOY.md) здесь **не работают**. Образ собирается обычным `docker build` (старый сборщик, при сборке печатает предупреждение `DEPRECATED` — это нормально), контейнер запускается через `docker run`.

### 2. Docker Hub и registry.npmjs.org с сервера недоступны

Запросы к `registry-1.docker.io` и `registry.npmjs.org` обрываются по таймауту. Обход:

- **Базовые образы** скачиваются с зеркала Google `mirror.gcr.io` и перетегируются под имена из `Dockerfile`:
  - `mirror.gcr.io/library/nginx:1.27-alpine` → `nginx:1.27-alpine`;
  - `node:22-alpine` — локальный образ на основе `mirror.gcr.io/library/node:22-alpine`, в котором npm глобально настроен на зеркало `https://registry.npmmirror.com`.
- Поэтому сборку **нельзя** запускать с `--pull`: Docker пойдёт в Docker Hub и упадёт. Также не удаляйте образы `node:22-alpine` и `nginx:1.27-alpine` (`docker image prune` без `-a` их не трогает).

Если образы всё-таки пропали, восстановить их так:

```bash
docker pull mirror.gcr.io/library/nginx:1.27-alpine && docker tag mirror.gcr.io/library/nginx:1.27-alpine nginx:1.27-alpine
```

```bash
printf "FROM mirror.gcr.io/library/node:22-alpine\nRUN npm config set -g registry https://registry.npmmirror.com\n" | docker build -t node:22-alpine -
```

### 3. Медленный CPU: тесты-симуляции не укладываются в 5 секунд

Тесты в `tests/avoidance.test.ts` на этом сервере идут ≈ 40 секунд и падают по стандартному таймауту vitest. Поэтому в **серверной копии** `Dockerfile` строка

```dockerfile
RUN npm test && npm run build
```

заменена на

```dockerfile
RUN npx vitest run --testTimeout=120000 && npm run build
```

Эта правка живёт только на сервере. Каждая новая заливка кода перезаписывает `Dockerfile`, поэтому замену нужно делать заново (она уже есть в команде обновления ниже).

### 4. На сервере нет rsync

Код заливается архивом через `tar` поверх SSH.

## Обновление игры

Все команды запускаются **на маке из корня проекта**.

### Шаг 1. Залить код

```bash
COPYFILE_DISABLE=1 tar czf - --exclude node_modules --exclude dist --exclude .git --exclude .claude . | ssh root@185.87.51.137 'rm -rf /opt/frogger && mkdir -p /opt/frogger && tar xzf - -C /opt/frogger 2>/dev/null && ls /opt/frogger'
```

`COPYFILE_DISABLE=1` не даёт macOS добавить в архив служебные файлы `._*`.

### Шаг 2. Сохранить текущий образ для отката

```bash
ssh root@185.87.51.137 'docker tag nhatrang-crossing:latest nhatrang-crossing:prev'
```

### Шаг 3. Поправить таймаут тестов и собрать образ

```bash
ssh root@185.87.51.137 'cd /opt/frogger && sed -i "s/RUN npm test && npm run build/RUN npx vitest run --testTimeout=120000 \&\& npm run build/" Dockerfile && docker build --target prod -t nhatrang-crossing:latest .'
```

Сборка занимает пару минут: `npm ci`, тесты (≈ 45 с), `tsc`, `vite build`. Если тесты или `tsc` падают, образ не пересобирается, а старый контейнер продолжает работать.

### Шаг 4. Перезапустить контейнер

```bash
ssh root@185.87.51.137 'docker rm -f frogger; docker run -d --name frogger -p 80:80 --restart unless-stopped --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 nhatrang-crossing:latest'
```

Игра недоступна около секунды, пока стартует новый контейнер.

### Шаг 5. Проверить

```bash
curl -s http://185.87.51.137/healthz
```

Ответ должен быть `ok`. Статус контейнера (через ≈ 30 секунд после запуска должен быть `healthy`):

```bash
ssh root@185.87.51.137 'docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"'
```

Новая версия подхватывается у игроков при следующем открытии: `index.html` отдаётся с `no-cache`, а ассеты имеют хэши в именах.

## Откат

Если после обновления что-то сломалось, вернуть предыдущий образ (сохранённый на шаге 2):

```bash
ssh root@185.87.51.137 'docker tag nhatrang-crossing:prev nhatrang-crossing:latest && docker rm -f frogger; docker run -d --name frogger -p 80:80 --restart unless-stopped --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 nhatrang-crossing:latest'
```

## Повседневные команды

Все выполняются на сервере (`ssh root@185.87.51.137`).

| Задача | Команда |
|---|---|
| Статус | `docker ps` |
| Логи (live) | `docker logs -f frogger` |
| Последние 100 строк логов | `docker logs --tail 100 frogger` |
| Перезапуск | `docker restart frogger` |
| Остановить | `docker stop frogger` |
| Запустить снова | `docker start frogger` |
| Ресурсы контейнера | `docker stats --no-stream frogger` |
| Свободное место | `df -h /` |
| Чистка старых слоёв | `docker image prune -f && docker builder prune -f` |

Контейнер запущен с `--restart unless-stopped`: он поднимается сам после падения и после перезагрузки сервера. Логи ротируются: 3 файла по 10 МБ.

## Типовые проблемы

| Симптом | Причина и что делать |
|---|---|
| `failed to resolve reference "docker.io/library/..."`, `TLS handshake timeout` | Пропал перетегированный базовый образ, и Docker пошёл в Docker Hub. Восстановите образы командами из раздела «Особенности сервера», п. 2. |
| `npm error Exit handler never called!` на шаге `npm ci` | npm не может достучаться до реестра. Проверьте, что образ `node:22-alpine` собран с зеркалом (п. 2), и что зеркало доступно: `curl -sI https://registry.npmmirror.com/vite`. |
| `Test timed out in 5000ms` | Не применена правка таймаута в `Dockerfile` (шаг 3). |
| `docker: unknown command: docker compose` | На сервере нет Compose, используйте команды из этого документа. |
| Сайт не открывается, контейнер работает | Проверьте, что порт 80 слушается: `ss -tlnp \| grep :80`, и что его не закрыл фаервол (`ufw` на сервере не настраивался). |
| Сборка падает из-за нехватки памяти (`Killed`, OOM в `dmesg`) | На сервере ≈ 700 МБ RAM. Добавьте swap — команда есть в [DEPLOY.md](DEPLOY.md), раздел «Подготовка сервера». |

## Безопасность

- Пароль root был передан в открытом виде. Его стоит сменить (`passwd` на сервере) и перейти на вход по SSH-ключу:

  ```bash
  ssh-copy-id root@185.87.51.137
  ```

  После проверки входа по ключу можно отключить вход по паролю (`PasswordAuthentication no` в `/etc/ssh/sshd_config`, затем `systemctl restart ssh`).
- Фаервол (`ufw`) на сервере не включался. Наружу сейчас слушают только 22 (SSH) и 80 (игра).
- HTTPS пока нет. Как его подключить, описано в [DEPLOY.md](DEPLOY.md), раздел «HTTPS». Вариант с Caddy требует Docker Compose, поэтому на этом сервере его придётся либо установить, либо запустить Caddy через `docker run`.
