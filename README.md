Open Truly Chat
================

This is a Node.js + React app that lets you connect a WhatsApp account and respond to incoming messages using an OpenAI-powered bot.

Key features:
- Simple password-protected admin login
- Upload a WhatsApp chat `.txt` file to train the reply style
- Configure your OpenAI API key in the web UI

Local development:
1. Install dependencies: `npm install` and `cd client && npm install`
2. Build frontend: `npm run build`
3. Start server: `npm run dev`

Deployment (Render Web Service):
- Build Command: `npm install && npm run build`
- Start Command: `node index.js`

Required environment variables (set in Render, not committed to git):
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `NODE_ENV=production`

