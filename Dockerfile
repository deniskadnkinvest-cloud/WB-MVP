# Build Stage: Фронтенд (Vite)
FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage: Бэкенд (Express) + статика
FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app

# Копируем зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Копируем исходники бэкенда
COPY server.js .
COPY api ./api
COPY src/data ./src/data

# Копируем собранный фронтенд
COPY --from=build /app/dist ./dist

# Устанавливаем переменные окружения
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["node", "server.js"]
