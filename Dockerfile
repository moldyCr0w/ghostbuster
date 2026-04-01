# ── Stage 1: build the React client ──────────────────────────────────────────
FROM node:20-slim AS client-build
WORKDIR /build

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build


# ── Stage 2: production server ────────────────────────────────────────────────
FROM node:20-slim AS server
WORKDIR /app

# Build tools required to compile better-sqlite3 native bindings on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install server production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built React app from stage 1
COPY --from=client-build /build/dist ./client/dist

# Ensure the data directory exists (Railway will mount a volume here)
RUN mkdir -p /app/data

ENV NODE_ENV=production
# PORT is injected by Railway automatically
EXPOSE 3000

CMD ["node", "server/index.js"]
