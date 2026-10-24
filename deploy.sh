#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Devil AI — serv00 Deploy Script
#  Run this on serv00 via SSH after uploading the project folder
# ═══════════════════════════════════════════════════════════════
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Devil AI — serv00 Setup         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

APP_DIR="$HOME/wsapai"
cd "$APP_DIR"

# ── Step 1: Check Node.js ────────────────────────────────────────
echo "▶ Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "  Node.js not found. Installing via pkg..."
  # serv00 uses FreeBSD, install node via pkg (needs devil command)
  devil lang nodejs on
  echo "  Reload shell: exec $SHELL"
else
  NODE_VER=$(node --version)
  echo "  Node.js $NODE_VER found ✓"
fi

# ── Step 2: Check npm ────────────────────────────────────────────
echo "▶ Checking npm..."
if ! command -v npm &>/dev/null; then
  echo "  ERROR: npm not found. Make sure Node.js is properly installed."
  exit 1
fi
echo "  npm $(npm --version) found ✓"

# ── Step 3: Install server dependencies ─────────────────────────
echo ""
echo "▶ Installing server dependencies (this may take a few minutes)..."
npm install --omit=dev
echo "  Done ✓"

# ── Step 4: Build React frontend ─────────────────────────────────
echo ""
echo "▶ Building React frontend..."
cd client
npm install
npm run build
cd ..
echo "  Done ✓"

# ── Step 5: Check .env exists ────────────────────────────────────
echo ""
if [ ! -f ".env" ]; then
  echo "⚠  No .env file found. Creating from template..."
  cp env.example .env
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║  IMPORTANT: Edit .env before starting!                  ║"
  echo "  ║  nano .env                                               ║"
  echo "  ║                                                          ║"
  echo "  ║  Required values:                                        ║"
  echo "  ║    ADMIN_PASSWORD=your-strong-password                  ║"
  echo "  ║    SESSION_SECRET=any-64-char-random-string             ║"
  echo "  ║    MONGODB_URI=mongodb://user:pass@mongo13.serv00.com.. ║"
  echo "  ║    OPENAI_API_KEY=sk-...                                ║"
  echo "  ║    PORT=<your reserved serv00 port>                     ║"
  echo "  ║    APP_URL=https://your-username.serv00.com             ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
  read -p "  Press ENTER after editing .env to continue, or Ctrl+C to stop..."
else
  echo "  .env found ✓"
fi

# ── Step 6: Install PM2 globally ─────────────────────────────────
echo ""
echo "▶ Installing PM2 globally..."
npm install -g pm2 2>/dev/null || npx pm2 --version
echo "  Done ✓"

# ── Step 7: Start with PM2 ───────────────────────────────────────
echo ""
echo "▶ Starting app with PM2..."
# Stop existing instance if running
pm2 stop devil-ai 2>/dev/null || true
pm2 delete devil-ai 2>/dev/null || true

# Start fresh
pm2 start ecosystem.config.cjs
pm2 save

echo "  App started ✓"
echo ""
echo "▶ Setting up auto-start on reboot..."
# serv00 cron-based auto-restart (pm2 startup doesn't work on shared hosts)
CRON_LINE="@reboot cd $APP_DIR && pm2 start ecosystem.config.cjs 2>/dev/null"
(crontab -l 2>/dev/null | grep -v "wsapai\|devil-ai"; echo "$CRON_LINE") | crontab -
echo "  Cron job added ✓"

# ── Done ─────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║  ✓ Deployment complete!                           ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "  Useful commands:"
echo "  pm2 logs devil-ai   → view live logs"
echo "  pm2 status                 → check if running"
echo "  pm2 restart devil-ai → restart app"
echo ""
echo "  Open your browser at:"
SOURCE_PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
echo "  http://$(hostname):${SOURCE_PORT:-3000}"
echo ""
