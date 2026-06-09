# --- Сборка ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Сначала манифесты — для кэширования npm ci
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
RUN npm run build
# Оставляем только прод-зависимости для рантайма
RUN npm prune --omit=dev

# --- Рантайм ---
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Каталог для SQLite (монтируется как volume)
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
# DB_PATH по умолчанию ./data/perco.sqlite относительно WORKDIR /app
CMD ["node", "server/dist/index.js"]
