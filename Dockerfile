# Pinned, not floating (#659). `node:20-slim` moved under us: the host sat on
# 20.19.2 while this image resolved to 20.20.2, and #610 lived in that gap for
# weeks — a PATCH-level difference (20.19.4 lists the tests, 20.19.5 throws).
# This version and .nvmrc are pinned to each other; move them together.
FROM node:20.20.2-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20.20.2-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DB_PATH=/data/mapsofbharat.db
RUN npm run build

FROM node:20.20.2-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/mapsofbharat.db
# Which commit is actually running (to-do 344). The image is built from the working
# tree and committed afterwards, so image timestamps cannot prove provenance — an
# image can legitimately predate the commit it contains. Stamping the sha in makes
# the question answerable instead of inferred: /api/health reports it, and
# `docker inspect` carries the label. Empty when built without the build arg, which
# is itself a signal the deploy ritual was skipped.
ARG GIT_SHA=unknown
ARG GIT_DIRTY=unknown
ENV GIT_SHA=$GIT_SHA
ENV GIT_DIRTY=$GIT_DIRTY
LABEL org.opencontainers.image.revision=$GIT_SHA
LABEL xyz.vault7a.git-dirty=$GIT_DIRTY
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /data && chown nextjs:nodejs /data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
