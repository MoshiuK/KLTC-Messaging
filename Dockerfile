# ── Stage 1: build client ────────────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: build server ────────────────────────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npx tsc

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Server runtime deps only
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Compiled server + prisma client
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=server-build /app/server/node_modules/@prisma ./server/node_modules/@prisma
COPY server/prisma ./server/prisma

# Built client (served as static files by the server)
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server

EXPOSE 5173

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
