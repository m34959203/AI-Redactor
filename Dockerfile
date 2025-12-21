# AI-Redactor Full Stack для Railway.com
# Frontend (React) + Backend (Node.js + LibreOffice)

# Stage 1: Build frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app

# Build arguments for Vite (passed from Railway)
ARG VITE_OPENROUTER_API_KEY
ENV VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY

# Copy frontend package files
COPY package*.json ./
RUN npm ci

# Copy frontend source and build
COPY . .
RUN npm run build

# Stage 2: Production image with LibreOffice
FROM node:20-slim

# Install LibreOffice and required tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    poppler-utils \
    fonts-liberation \
    fonts-dejavu \
    fonts-freefont-ttf \
    fonts-noto \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# Copy server code
COPY server/ ./server/

# Copy shared code (used by both frontend and backend)
COPY shared/ ./shared/

# Copy built frontend
COPY --from=frontend-builder /app/dist ./public

# Create temp directory for file processing
RUN mkdir -p /app/server/temp && chmod 777 /app/server/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose port (Railway will override with $PORT)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3001) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "server/index.js"]
