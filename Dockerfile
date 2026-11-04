# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (incl. dev, needed for the build) ----
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the standalone Next.js server ----
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: minimal image, non-root user ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC \
    npm_config_cache=/tmp/.npm \
    npm_config_update_notifier=false

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/drizzle ./drizzle
# Bundled CLI scripts (admin:recovery, db:migrate; backfill follows in phase 3)
COPY --from=build --chown=nextjs:nodejs /app/dist/cli ./dist/cli
COPY --from=build --chown=nextjs:nodejs /app/scripts/run-cli.mjs ./scripts/run-cli.mjs

USER nextjs
EXPOSE 3000

# Migrations and the scheduler start from instrumentation.ts inside server.js.
CMD ["node", "server.js"]
