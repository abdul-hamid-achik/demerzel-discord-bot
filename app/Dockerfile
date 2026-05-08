# syntax=docker/dockerfile:1.7

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/logs && chown -R bun:bun /app/logs
USER bun
CMD ["bun", "run", "src/index.ts"]
