FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS development
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
RUN npm ci && npm cache clean --force
RUN npx playwright install chromium --with-deps
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM base AS builder
RUN npm ci && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
RUN npx prisma generate
RUN npx tsc

FROM base AS browser-install
RUN npm ci && npm cache clean --force
RUN npx playwright install chromium --with-deps

FROM node:22-slim AS production
WORKDIR /app
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=browser-install /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY --from=browser-install /app/node_modules/playwright-core /app/node_modules/playwright-core
COPY package.json ./
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
