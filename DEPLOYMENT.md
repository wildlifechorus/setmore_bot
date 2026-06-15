# Deployment Guide

This guide covers deploying the Setmore Calendar Cancellation Monitor Bot to a
production server. The bot uses [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js),
which drives a real WhatsApp account through headless Chromium. This means the
server needs Chromium system libraries, more RAM than a typical Node.js bot
(~300–500 MB), and a persistent login session.

---

## Prerequisites

- Node.js v18 or higher
- Yarn package manager
- A **dedicated** WhatsApp phone number (not your personal account)
- The WhatsApp account already belongs to the target group
- SSH access to your server (for remote deployment)

---

## Part 1, WhatsApp Setup (manual, one-time)

Do this before touching the server.

### 1.1 Dedicated phone number

Get a SIM card or eSIM for the bot. Using your personal WhatsApp risks losing
it if the account is flagged by WhatsApp.

### 1.2 Install WhatsApp and verify the number

Install WhatsApp (or WhatsApp Business) on a phone with the dedicated SIM and
complete phone-number verification.

### 1.3 Create the notification group

1. Open WhatsApp → New Group.
2. Add at least one contact (groups need ≥ 1 member to be created).
3. Name the group something descriptive, e.g. "Kateryna Nails, Open Slots".
4. Go to Group Settings → **Send messages → Only admins**.
   This makes it broadcast-like: only the bot posts, members just read.
5. Add the bot phone as a group **admin**.
6. Share the group invite link with clients who want slot alerts.
7. Keep the phone online periodically so the linked-device session stays alive
   (WhatsApp allows up to ~14 days offline for a linked device).

---

## Part 2, Local Development Setup

### 2.1 Clone / download the project

```bash
cd /path/to/setmore_bot
```

### 2.2 Install dependencies

```bash
yarn install
```

> `whatsapp-web.js` bundles Puppeteer which downloads a compatible Chromium
> binary (~170 MB) on first install.

### 2.3 Configure environment variables

```bash
cp .env.example .env
nano .env
```

Fill in:

```env
# WhatsApp group ID, obtained in step 2.4 below
WHATSAPP_GROUP_ID=

# Directory for the WhatsApp session (default shown)
WHATSAPP_SESSION_PATH=./data/wwebjs_auth

# Setmore iCal feed (Setmore → Integrations → iCal)
CALENDAR_URL=https://events.setmore.com/feeds/v1/...

# Check interval in ms (default 60 000 = 1 minute)
CHECK_INTERVAL_MS=60000

# SQLite database path (default shown)
DATABASE_PATH=./data/appointments.db
```

### 2.4 Log in and find the group ID

```bash
yarn list-groups
```

A QR code prints in the terminal. On the **bot phone**:
**WhatsApp → Linked Devices → Link a Device** → scan the QR.

After scanning, the script prints every group the bot account is in:

```
─────────────────────────────────────────────────────────────────────────
Name : Kateryna Nails, Open Slots
ID   : 1234567890-1609459200@g.us
─────────────────────────────────────────────────────────────────────────
```

Copy the `@g.us` ID into `WHATSAPP_GROUP_ID` in `.env`.

The session is saved to `./data/wwebjs_auth/`, subsequent runs (including the
main bot) reuse it automatically with no QR needed.

### 2.5 Run in development

```bash
yarn dev
```

Watch the logs. The first check initialises the database; no notifications are
sent on the first run.

---

## Part 3, Production Deployment

### Option A: Server with PM2 (recommended)

#### 3.1 Install Node.js and Yarn on the server

```bash
# Node.js v18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Yarn
npm install -g yarn
```

#### 3.2 Install Chromium system dependencies

`whatsapp-web.js` uses Puppeteer's bundled Chromium, but Chromium needs
system libraries that are not installed by default on minimal server images.

```bash
sudo apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  fonts-liberation \
  xdg-utils
```

> If you are on a headless server without a display server, Chromium still
> works in headless mode; the `--no-sandbox` and `--disable-setuid-sandbox`
> flags are already set in the client code.

#### 3.3 Install PM2

```bash
yarn global add pm2
```

#### 3.4 Upload project files

```bash
# Using rsync (excludes node_modules, .env, and session data)
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'dist/' \
  /local/path/setmore_bot/ user@server:/path/to/setmore_bot/

# Or via git
ssh user@server
git clone <repository-url> /path/to/setmore_bot
cd /path/to/setmore_bot
```

#### 3.5 Install dependencies on the server

```bash
cd /path/to/setmore_bot
yarn install
```

#### 3.6 Create the data directory and .env

```bash
mkdir -p data logs
nano .env   # paste in your production .env values
chmod 600 .env
```

#### 3.7 Build

```bash
yarn build
```

#### 3.8 Transfer the WhatsApp session

If you logged in locally (step 2.4), copy the session to the server so you do
not have to scan a QR again:

```bash
rsync -avz ./data/wwebjs_auth/ user@server:/path/to/setmore_bot/data/wwebjs_auth/
```

**Alternatively**, perform the initial QR scan directly on the server.
The QR is printed to stdout, so forward it via SSH with a PTY:

```bash
ssh -t user@server "cd /path/to/setmore_bot && node dist/index.js"
# or in dev mode:
ssh -t user@server "cd /path/to/setmore_bot && yarn dev"
```

Scan the QR from the terminal, wait for "WhatsApp client ready", then `Ctrl-C`.
The session is saved. You can now run the bot under PM2.

#### 3.9 Start with PM2

```bash
pm2 start dist/index.js --name setmore-bot
pm2 save
```

#### 3.10 Configure PM2 to start on boot

```bash
pm2 startup
# Run the command it prints (it will look like: sudo env PATH=... pm2 startup ...)
pm2 save
```

#### PM2 management commands

```bash
pm2 status                          # Check running status
pm2 logs setmore-bot                # Tail logs
pm2 logs setmore-bot --lines 200    # Last 200 lines
pm2 restart setmore-bot             # Restart
pm2 stop setmore-bot                # Stop without removing
pm2 delete setmore-bot              # Remove from PM2
pm2 monit                           # CPU/memory dashboard
```

---

### Option B: Docker

The Docker image needs Chromium system libraries. Use the `node:18` image
(Debian-based) instead of `node:18-alpine`, since Alpine's musl libc does
not support Chromium well.

**Dockerfile:**

```dockerfile
FROM node:18

WORKDIR /app

# Install Chromium system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    fonts-liberation \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install

# Copy source and build
COPY . .
RUN yarn build

# Runtime data directories
RUN mkdir -p data logs

CMD ["node", "dist/index.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  setmore-bot:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      # Persist the SQLite DB and the WhatsApp session across container restarts
      - ./data:/app/data
      - ./logs:/app/logs
```

Initial QR scan with Docker (interactive, one-time):

```bash
docker-compose run --rm setmore-bot node dist/index.js
# Scan the QR, wait for "WhatsApp client ready", then Ctrl-C
```

The session is persisted in `./data/wwebjs_auth/` via the volume mount.
Subsequent `docker-compose up -d` starts will reuse it.

---

### Running on a local Mac (development/low-volume)

```bash
yarn build
pm2 start dist/index.js --name setmore-bot
pm2 startup launchd
pm2 save
```

---

## Part 4, Session Persistence

The WhatsApp session is stored in `WHATSAPP_SESSION_PATH` (default
`./data/wwebjs_auth/`). This is the most critical piece of state to protect:

- **Back it up** alongside `appointments.db`.
- **Do not wipe** `data/` on deploys, use rsync's `--exclude data/` instead
  of blowing away the directory.
- If the session is lost, the next startup prints a QR code and requires a
  re-scan from the bot phone.
- Linked-device sessions expire after roughly 14 days of the phone being
  offline. Keep the bot phone connected to the internet periodically.

### Back up the session

```bash
# Manual backup
cp -r data/wwebjs_auth data/wwebjs_auth.backup.$(date +%Y%m%d_%H%M%S)

# Cron job (daily backup)
0 2 * * * cp -r /path/to/setmore_bot/data/wwebjs_auth \
  /backup/location/wwebjs_auth.$(date +\%Y\%m\%d)
```

---

## Part 5, Testing the Deployment

### 5.1 Check logs

```bash
pm2 logs setmore-bot
```

### 5.2 Verify first run

On the very first check the bot should log:
```
First run complete - no notifications sent
```

This is correct, it seeds the database without alerting.

### 5.3 Test the WhatsApp connection

Temporarily add a call to `testBotConnection()` in `main()` just after
`initClient()`, or run a quick script:

```typescript
import * as dotenv from 'dotenv';
import { initClient, testBotConnection } from './src/whatsapp/client';

dotenv.config();

initClient({
  groupId: process.env.WHATSAPP_GROUP_ID!,
  sessionPath: process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth',
  bookingUrl: 'https://katerynails.setmore.com/',
}).then(() => testBotConnection()).then(() => process.exit(0));
```

You should see "🤖 Setmore Bot is online..." posted to the group.

### 5.4 Simulate a cancellation

1. Note existing appointments in the database.
2. Remove an appointment from Setmore.
3. Wait for the next check cycle.
4. A "🎉 New Slot Available!" message should appear in the WhatsApp group.

### 5.5 Watch for errors

```bash
pm2 logs setmore-bot --err
```

---

## Troubleshooting

### WhatsApp client fails to start

**Symptom:** `Error: Failed to launch the browser process`

**Cause:** Missing Chromium system libraries.

**Fix:** Run the `apt-get install` block from step 3.2 and retry.

---

### QR code keeps appearing on every restart

**Cause:** The session directory is not being persisted, or it was deleted.

**Fix:**
- Confirm `WHATSAPP_SESSION_PATH` in `.env` points to a directory that
  survives restarts.
- If using Docker, confirm the `data/` volume is mounted.
- Re-scan the QR once after fixing the path.

---

### Messages not arriving in the group

**Check 1, Group ID correct?**

Run `yarn list-groups` again and compare the printed ID with `WHATSAPP_GROUP_ID`.

**Check 2, Bot is group admin?**

In the WhatsApp group → participants → verify the bot account shows "Admin".

**Check 3, Group send permission?**

Group Settings → Send messages → must be "Only admins" (and the bot must be an
admin). If set to "All participants", non-admin sends still work; ensure the
bot phone is in the group.

**Check 4, Session disconnected?**

Look for `WhatsApp client disconnected` in the logs. Restart the bot; if the
session is still valid it reconnects. If not, a new QR scan is required.

---

### `auth_failure` in logs

The session is corrupted or expired. Delete the session directory and re-scan:

```bash
pm2 stop setmore-bot
rm -rf data/wwebjs_auth
pm2 start setmore-bot   # QR code will appear in pm2 logs setmore-bot
```

Scan the QR interactively:

```bash
pm2 stop setmore-bot
node dist/index.js      # QR prints to terminal
# Scan, wait for "WhatsApp client ready", Ctrl-C
pm2 start setmore-bot
```

---

### Calendar not fetching

```bash
curl -H "User-Agent: Apple Calendar" \
     -H "Accept: text/calendar" \
     "$CALENDAR_URL"
```

If that returns data, the URL is fine. Check your `.env` value.

---

### High memory usage

Chromium uses ~300–500 MB RSS. This is expected. If the server has less than
1 GB RAM, consider increasing swap or upgrading the instance.

---

## Maintenance

### Update dependencies

```bash
yarn outdated
yarn upgrade
yarn build
pm2 restart setmore-bot
```

When updating `whatsapp-web.js`, test in development first, major releases
sometimes require session re-authentication.

### Rotate logs

PM2 handles log rotation via `pm2-logrotate`:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Back up the database

```bash
# Manual
cp data/appointments.db data/appointments.db.$(date +%Y%m%d_%H%M%S)

# Cron (daily at 02:00)
0 2 * * * cp /path/to/setmore_bot/data/appointments.db \
  /backup/appointments.db.$(date +\%Y\%m\%d)
```

### Reset the database (caution, deletes all state)

```bash
pm2 stop setmore-bot
rm data/appointments.db
pm2 start setmore-bot   # first run re-seeds with no notifications
```

---

## Security Best Practices

1. **Never commit `.env`**, already in `.gitignore`.
2. **Restrict file permissions**:
   ```bash
   chmod 600 .env
   chmod 700 data/wwebjs_auth
   chmod 600 data/appointments.db
   ```
3. **Use a firewall**, the bot makes outbound connections only; no inbound
   ports need to be open.
4. **Keep dependencies updated**, `yarn upgrade` regularly.
5. **Dedicated WhatsApp number**, isolates ban risk from your personal account.

---

## Performance Tuning

### Adjust the check interval

```env
CHECK_INTERVAL_MS=300000   # 5 minutes (lower API load)
CHECK_INTERVAL_MS=30000    # 30 seconds (faster alerts)
```

### Memory

Chromium is the dominant memory consumer. Node.js heap itself stays at
~50–100 MB. No SQLite tuning is needed for typical volumes.

---

## Monitoring

### Health check script

```bash
#!/bin/bash
# health-check.sh
if pm2 list | grep -q "setmore-bot.*online"; then
  echo "Bot is running"
  exit 0
else
  echo "Bot is NOT running!"
  exit 1
fi
```

Cron (every 5 minutes):

```bash
*/5 * * * * /path/to/health-check.sh || \
  echo "Setmore bot down!" | mail -s "Alert: Bot Down" your@email.com
```

---

## Summary

Your bot is now deployed and monitoring your Setmore calendar for cancellations.

Key points:
- Checks the calendar every minute (configurable)
- Detects cancellations and reschedules automatically
- Posts WhatsApp-formatted notifications to the group
- Runs continuously with PM2 and auto-restarts on failure
- Starts on system boot via `pm2 startup`
- **Keep `data/wwebjs_auth/` backed up**, losing it forces a QR re-scan
- **Keep the bot phone online**, Linked Device sessions expire after ~14 days
  of the phone being offline
