# 🚀 Руководство по деплою

Это руководство поможет вам задеплоить AI-Редактор научного журнала на различные платформы.

## Vercel (Рекомендуется)

Vercel - лучший вариант для деплоя Vite/React приложений.

### Способ 1: Через Vercel CLI

1. **Установите Vercel CLI**
```bash
npm i -g vercel
```

2. **Войдите в аккаунт**
```bash
vercel login
```

3. **Деплой**
```bash
vercel
```

4. **Добавьте переменные окружения**
```bash
vercel env add VITE_ANTHROPIC_API_KEY
```

### Способ 2: Через GitHub интеграцию

1. Загрузите проект на GitHub
2. Перейдите на [vercel.com](https://vercel.com)
3. Нажмите "Import Project"
4. Выберите ваш GitHub репозиторий
5. В настройках добавьте переменную окружения:
   - Name: `VITE_ANTHROPIC_API_KEY`
   - Value: ваш API ключ Anthropic
6. Нажмите "Deploy"

### Production URL

После успешного деплоя вы получите URL вида:
```
https://your-project.vercel.app
```

## Netlify

### Способ 1: Через Netlify CLI

1. **Установите Netlify CLI**
```bash
npm install -g netlify-cli
```

2. **Соберите проект**
```bash
npm run build
```

3. **Деплой**
```bash
netlify deploy --prod --dir=dist
```

### Способ 2: Через Netlify UI

1. Соберите проект локально:
```bash
npm run build
```

2. Перейдите на [netlify.com](https://www.netlify.com/)
3. Drag & drop папку `dist` в зону деплоя
4. В Site Settings → Environment Variables добавьте:
   - Key: `VITE_ANTHROPIC_API_KEY`
   - Value: ваш API ключ

## GitHub Pages

1. Установите пакет для деплоя:
```bash
npm install --save-dev gh-pages
```

2. Добавьте в `package.json`:
```json
{
  "homepage": "https://yourusername.github.io/AI-Redactor",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

3. Обновите `vite.config.js`:
```js
export default defineConfig({
  base: '/AI-Redactor/',
  // ... остальная конфигурация
})
```

4. Деплой:
```bash
npm run deploy
```

**⚠️ Важно:** GitHub Pages не поддерживает переменные окружения. Не используйте для production!

## Docker

### Dockerfile

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;

    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### Сборка и запуск

```bash
docker build -t ai-redactor .
docker run -p 80:80 -e VITE_ANTHROPIC_API_KEY=your_key ai-redactor
```

## Переменные окружения

Для всех платформ необходимо настроить:

| Переменная | Описание | Обязательна |
|-----------|----------|-------------|
| `VITE_ANTHROPIC_API_KEY` | API ключ Anthropic Claude | ✅ Да |

## Проверка перед деплоем

Чеклист перед деплоем:

- [ ] Выполнена сборка без ошибок (`npm run build`)
- [ ] Проверен preview (`npm run preview`)
- [ ] Добавлены все переменные окружения
- [ ] `.env` файл в `.gitignore`
- [ ] Обновлен README с правильными URL
- [ ] Проверена работа на мобильных устройствах

## Оптимизация Production

1. **Минификация**
```js
// vite.config.js уже настроен
build: {
  minify: 'terser'
}
```

2. **Code splitting**
```js
// Уже настроено в vite.config.js
rollupOptions: {
  output: {
    manualChunks: {
      'react-vendor': ['react', 'react-dom'],
      'icons': ['lucide-react']
    }
  }
}
```

3. **Кеширование**
- Vercel автоматически настроит правильные заголовки
- Для других платформ используйте CDN

## Мониторинг

### Vercel Analytics

Добавьте в `App.jsx`:
```jsx
import { Analytics } from '@vercel/analytics/react';

function App() {
  return (
    <>
      <YourApp />
      <Analytics />
    </>
  );
}
```

### Sentry для отслеживания ошибок

```bash
npm install @sentry/react
```

```jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: import.meta.env.MODE,
});
```

## Troubleshooting

### Проблема: "Module not found"

**Решение:** Проверьте что все зависимости установлены:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Проблема: API ключ не работает

**Решение:** Убедитесь что:
1. Переменная называется `VITE_ANTHROPIC_API_KEY` (с префиксом VITE_)
2. После добавления переменной перезапущен build
3. На платформе деплоя переменная добавлена корректно

### Проблема: 404 на роутах

**Решение:** Настройте rewrites:

Vercel: уже настроено в `vercel.json`

Netlify: создайте `_redirects`:
```
/*    /index.html   200
```

## Безопасность

1. **Никогда** не коммитьте `.env` файлы
2. Используйте разные API ключи для dev и production
3. Ограничьте rate limits на API ключах
4. Регулярно ротируйте API ключи
5. Используйте HTTPS (автоматически на Vercel/Netlify)

## Контакты для поддержки

Если возникли проблемы при деплое:
- 📧 Email: support@example.com
- 💬 GitHub Issues: [создать issue](https://github.com/yourusername/AI-Redactor/issues)
