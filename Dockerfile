# ====================================
# SHENCOM CRM - Docker Build
# ====================================

# Stage 1: Build frontend apps
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install root dependencies (backend)
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Build desktop client
COPY client/package.json client/package-lock.json* client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

# Build mobile app
COPY mobile/package.json mobile/package-lock.json* mobile/
RUN cd mobile && npm ci
COPY mobile/ mobile/
RUN cd mobile && npm run build

# Copy server
COPY server/ server/

# ====================================
# Stage 2: Production runtime
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --production && apk del python3 make g++

# Copy built assets from builder stage
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/mobile/dist mobile/dist
COPY --from=builder /app/server server

# Create data directory for SQLite persistent volume
RUN mkdir -p /data

# Expose port (Render injects PORT env var)
EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/data/shencom.db

CMD ["node", "server/index.js"]
