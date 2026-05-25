# VTON MVP (Virtual Try-On)

Приложение для виртуальной примерки одежды (Virtual Try-On) на React 19 + Express с интеграцией Google GenAI и фоновыми задачами Inngest.

## Стек технологий
- **Фронтенд**: React 19 + Vite
- **Бэкенд**: Express.js
- **ИИ-функции**: Google GenAI SDK (`@google/genai`), `@imgly/background-removal` (удаление фона локально в браузере)
- **Фоновые задачи**: Inngest (`inngest`)
- **База данных**: Firebase (Firestore & Admin SDK)

## Установка и запуск

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Создайте файлы `.env` и `.env.local` на основе шаблона `.env.example`.
3. Запустите dev-сервер (одновременный запуск React и Express бэкенда):
   ```bash
   npm run dev
   ```
4. Запустите клиент Inngest для отладки фоновых задач локально:
   ```bash
   npm run catalog:inngest
   ```

## Контакты и Репозиторий
- **GitHub**: [VTON MVP Repo](https://github.com/deniskadnkinvest-cloud/WB-MVP)
