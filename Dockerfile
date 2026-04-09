# Multi-stage build
#
# Stages:
#   deps        — install ALL dependencies (shared base)
#   development — hot-reload with ts-node-dev; src mounted as a volume
#   builder     — compile TypeScript for production
#   production  — lean runtime image (no devDeps, no TS tooling)

# ── Stage 1: Install all dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# openssl is required by Prisma's query engine (Alpine uses musl + OpenSSL 3)
RUN apk add --no-cache openssl

COPY package.json yarn.lock ./
COPY prisma ./prisma

# Full install (devDeps included) so builder + dev both share this layer
RUN yarn install --frozen-lockfile

# ── Stage 2: Development (hot-reload) ─────────────────────────────────────────
FROM deps AS development

# tsconfig needed for ts-node-dev to resolve paths
COPY tsconfig.json ./

# src and prisma are MOUNTED as volumes at runtime — not baked in
# This means any file save on the host instantly reflects in the container.
EXPOSE 4030

CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "--exit-child", "src/index.ts"]

# ── Stage 3: Build (production compile) ───────────────────────────────────────
FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src

RUN yarn build

# ── Stage 4: Production ────────────────────────────────────────────────────────
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

RUN apk add --no-cache openssl

# Non-root user — Alpine uses addgroup/adduser, not groupadd/useradd
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs torbibi

COPY package.json yarn.lock ./
COPY prisma ./prisma

# Production deps only (postinstall runs prisma generate for this Alpine image)
RUN yarn install --frozen-lockfile --production && yarn cache clean

# Compiled JS from builder; Prisma client generated in builder for Alpine
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p logs && chown -R torbibi:nodejs /app

USER torbibi

EXPOSE 4030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4030/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
