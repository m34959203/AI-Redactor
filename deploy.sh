#!/bin/bash
# ============================================================
# AI-Redactor Deploy Script for Plesk (hoster.kz)
# Subdomain: AI-Redactor.zhezu.kz
# ============================================================
# Usage: bash deploy.sh
# Run this script from the project root directory via SSH
# ============================================================

set -e

echo "=========================================="
echo "  AI-Redactor Deployment Script"
echo "  Target: AI-Redactor.zhezu.kz"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo -e "\n${YELLOW}[1/7] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found! Installing via nvm...${NC}"

    # Install nvm
    if [ ! -d "$HOME/.nvm" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi

    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Install Node.js 20 LTS
    nvm install 20
    nvm use 20
    nvm alias default 20

    echo -e "${GREEN}Node.js $(node -v) installed successfully${NC}"
else
    echo -e "${GREEN}Node.js $(node -v) found${NC}"
fi

echo -e "\n${YELLOW}[2/7] Installing frontend dependencies...${NC}"
npm install --production=false

echo -e "\n${YELLOW}[3/7] Installing server dependencies...${NC}"
cd server && npm install && cd ..

echo -e "\n${YELLOW}[4/7] Building frontend (React + Vite)...${NC}"
npm run build

echo -e "\n${YELLOW}[5/7] Setting up production structure...${NC}"
# Copy built frontend to server/public for Express to serve
mkdir -p server/public
cp -r dist/* server/public/

# Copy .htaccess to dist for Apache
if [ -f ".htaccess" ]; then
    cp .htaccess dist/.htaccess
fi

# Create logs directory
mkdir -p logs

# Create temp directory for file processing
mkdir -p server/temp
chmod 755 server/temp

echo -e "${GREEN}Frontend built and copied to server/public/${NC}"

echo -e "\n${YELLOW}[6/7] Setting up .env file...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}Created .env from .env.example${NC}"
        echo -e "${RED}IMPORTANT: Edit .env and add your API keys!${NC}"
        echo "  nano .env"
    else
        cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3001

# AI API Keys (add at least one)
OPENROUTER_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
ENVEOF
        echo -e "${YELLOW}Created minimal .env file${NC}"
        echo -e "${RED}IMPORTANT: Edit .env and add your API keys!${NC}"
    fi
else
    echo -e "${GREEN}.env file already exists${NC}"
fi

echo -e "\n${YELLOW}[7/7] Setting up PM2 process manager...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    npm install -g pm2
fi

# Stop existing instance if running
pm2 stop ai-redactor 2>/dev/null || true
pm2 delete ai-redactor 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list for auto-restart on reboot
pm2 save

# Setup PM2 startup script (auto-start on server reboot)
echo -e "\n${YELLOW}Setting up PM2 auto-start...${NC}"
pm2 startup 2>/dev/null || echo -e "${YELLOW}Run the command above manually if needed${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "  Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Server running on: http://127.0.0.1:3001"
echo ""
echo -e "${YELLOW}Next steps in Plesk:${NC}"
echo "1. Set Document Root to: $(pwd)/dist"
echo "   (Plesk > AI-Redactor.zhezu.kz > Hosting & DNS > Hosting Settings)"
echo ""
echo "2. If mod_proxy is not enabled, contact hoster.kz support to enable:"
echo "   mod_proxy, mod_proxy_http"
echo ""
echo "3. Edit API keys in .env:"
echo "   nano $(pwd)/.env"
echo ""
echo "4. Check server status:"
echo "   pm2 status"
echo "   pm2 logs ai-redactor"
echo ""
echo "5. Test health endpoint:"
echo "   curl http://127.0.0.1:3001/api/health"
echo ""
