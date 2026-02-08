# AI-Redactor Deployment Guide

Это руководство описывает развёртывание AI-Redactor на различных платформах.

## Текущее продакшн-развёртывание

Проект развёрнут и функционирует по адресу:

- **URL:** [https://AI-Redactor.zhezu.kz](https://AI-Redactor.zhezu.kz)
- **Организация:** Жезказганский университет имени О.А. Байконурова
- **Домен:** субдомен университетского сайта [zhezu.kz](https://zhezu.kz)

---

## Требования

- **PostgreSQL 14+** - база данных (опционально, без БД работает в режиме памяти)
- **Node.js 20+** - для сервера
- **LibreOffice** - для конвертации DOCX → PDF
- **OpenRouter API Key** - для AI-функций (бесплатно на [openrouter.ai](https://openrouter.ai))

## Переменные окружения

| Переменная | Обязательная | Описание |
|------------|--------------|----------|
| `DATABASE_URL` | Нет* | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | Да | Ключ API OpenRouter |
| `PORT` | Нет | Порт сервера (по умолчанию 3001) |
| `NODE_ENV` | Нет | Окружение (production/development) |
| `DB_SSL` | Нет | SSL для БД (true/false) |

*Без DATABASE_URL приложение работает, но данные не сохраняются между сессиями.

---

## Railway (Рекомендуется)

Railway автоматически настраивает PostgreSQL и переменные окружения.

### Быстрый деплой

1. Создайте проект на [Railway](https://railway.app)
2. Подключите GitHub репозиторий
3. Добавьте PostgreSQL plugin (в dashboard)
4. Установите переменные окружения:
   - `OPENROUTER_API_KEY` - ваш ключ
5. Railway автоматически:
   - Запустит build по `railway.toml`
   - Создаст `DATABASE_URL`
   - Запустит миграции при старте

### CLI деплой

```bash
# Установите Railway CLI
npm install -g @railway/cli

# Авторизуйтесь
railway login

# Создайте проект
railway init

# Добавьте PostgreSQL
railway add -p postgres

# Деплой
railway up
```

---

## Render

### Автоматический деплой через Blueprint

1. Форкните репозиторий на GitHub
2. Зайдите на [Render Dashboard](https://dashboard.render.com)
3. New → Blueprint
4. Подключите репозиторий
5. Render создаст:
   - Web Service из `render.yaml`
   - PostgreSQL базу данных
6. Установите `OPENROUTER_API_KEY` в dashboard

### Ручной деплой

1. Создайте PostgreSQL базу на Render
2. Создайте Web Service:
   - Docker runtime
   - Dockerfile: `Dockerfile.production`
3. Добавьте переменные:
   - `DATABASE_URL` (из PostgreSQL)
   - `OPENROUTER_API_KEY`

---

## Docker Compose (Локальная разработка)

```bash
# Запустите все сервисы (frontend + backend + PostgreSQL)
docker-compose up -d

# Или только production build
docker-compose --profile production up -d

# Логи
docker-compose logs -f backend

# Остановка
docker-compose down
```

Приложение будет доступно:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Production: http://localhost:80

---

## Docker (Продакшн)

```bash
# Build образа
docker build -f Dockerfile.production -t ai-redactor .

# Запуск с внешней PostgreSQL
docker run -d \
  --name ai-redactor \
  -p 80:80 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e OPENROUTER_API_KEY="sk-or-v1-..." \
  ai-redactor
```

---

## Heroku

```bash
# Создайте приложение
heroku create ai-redactor

# Добавьте PostgreSQL
heroku addons:create heroku-postgresql:mini

# Установите переменные
heroku config:set OPENROUTER_API_KEY=sk-or-v1-...

# Установите buildpack для LibreOffice
heroku buildpacks:add https://github.com/heroku/heroku-buildpack-apt
echo "libreoffice-core libreoffice-writer fonts-liberation" > Aptfile

# Деплой
git push heroku main
```

---

## VPS / Dedicated Server

### Установка зависимостей (Ubuntu/Debian)

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# LibreOffice
sudo apt-get install -y libreoffice-core libreoffice-writer

# Fonts (для кириллицы)
sudo apt-get install -y fonts-liberation fonts-dejavu fonts-freefont-ttf

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Создание базы данных
sudo -u postgres createuser ai_redactor
sudo -u postgres createdb -O ai_redactor ai_redactor
sudo -u postgres psql -c "ALTER USER ai_redactor PASSWORD 'your_password';"
```

### Сборка и запуск

```bash
# Клонирование
git clone https://github.com/your-repo/ai-redactor
cd ai-redactor

# Установка зависимостей
npm ci
cd server && npm ci && cd ..

# Сборка frontend
npm run build

# Копирование frontend в public
mkdir -p server/public
cp -r dist/* server/public/

# Настройка .env
cp .env.example server/.env
# Отредактируйте server/.env

# Запуск
cd server && node index.js
```

### Systemd сервис

```bash
sudo tee /etc/systemd/system/ai-redactor.service << EOF
[Unit]
Description=AI-Redactor Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ai-redactor/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/opt/ai-redactor/server/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable ai-redactor
sudo systemctl start ai-redactor
```

---

## Миграции базы данных

Миграции запускаются автоматически при старте сервера.

Для ручного запуска:

```bash
cd server
npm run migrate
```

---

## Проверка работоспособности

```bash
# Health check
curl http://localhost:3001/api/health

# Ожидаемый ответ:
{
  "status": "ok",
  "timestamp": "2024-12-22T10:00:00.000Z",
  "libreOffice": true,
  "ai": true,
  "database": true
}
```

---

## Troubleshooting

### LibreOffice не найден

```bash
# Проверьте установку
libreoffice --version

# Если не установлен (Ubuntu/Debian)
sudo apt-get install libreoffice-core libreoffice-writer
```

### База данных не подключается

1. Проверьте `DATABASE_URL`:
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```
2. Для облачных провайдеров убедитесь, что SSL включён:
   ```
   DATABASE_URL=postgresql://...?sslmode=require
   ```

### Ошибки с кириллицей в PDF

Установите шрифты:
```bash
sudo apt-get install fonts-liberation fonts-dejavu fonts-freefont-ttf
```

### AI не работает

1. Проверьте `OPENROUTER_API_KEY`
2. Проверьте баланс на [openrouter.ai](https://openrouter.ai)
3. Бесплатные модели имеют лимиты
