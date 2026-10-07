FROM oven/bun:1 AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# P0 is the first project build. The committed lockfile is added after the
# initial verified frontend build; do not require a lockfile that has not yet
# been generated for this configured template variant.
COPY package.json ./

# Install dependencies
RUN bun install --ignore-scripts

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for environment variables. NEXT_PUBLIC_* are inlined into the
# client bundle at build time, and .env.local is dockerignored, so they must be
# passed as build args (see docker-compose.frontend.yml) or the browser bundle
# bakes in stale defaults.
ARG NEXT_PUBLIC_API_URL=http://localhost:8010
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8010
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3010
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=50
ENV NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=$NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB
ARG NEXT_PUBLIC_RAG_ENABLED=false
ENV NEXT_PUBLIC_RAG_ENABLED=$NEXT_PUBLIC_RAG_ENABLED

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN useradd --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:bun /app/public ./public
COPY --from=builder --chown=nextjs:bun /app/.next/standalone ./
COPY --from=builder --chown=nextjs:bun /app/.next/static ./.next/static

USER nextjs

EXPOSE 3010

ENV PORT=3010
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
