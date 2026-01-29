# Deployment Guide

This guide covers deploying the Setmore Calendar Cancellation Monitor Bot to a production server.

## Prerequisites

- Node.js v18 or higher
- Yarn package manager
- Telegram bot token (from @BotFather)
- Telegram channel ID
- SSH access to your server (for remote deployment)

## Local Development Setup

### 1. Clone/Download the Project

```bash
cd /path/to/setmore_bot
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHANNEL_ID=@yourchannel

# Setmore Calendar
CALENDAR_URL=https://events.setmore.com/feeds/v1/Y2VjMzY4ZDE4ZWQ4MGVlMV8xNzY5NjkyMzQwODg4

# Monitoring Settings
CHECK_INTERVAL_MS=60000
DATABASE_PATH=./data/appointments.db

# Optional: Logging
LOG_LEVEL=info
```

### 4. Run in Development Mode

```bash
yarn dev
```

This runs the bot with hot-reloading using `tsx`.

### 5. Build for Production

```bash
yarn build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Getting Telegram Credentials

### Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the prompts to name your bot
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Store this token in your `.env` file as `TELEGRAM_BOT_TOKEN`

### Get Channel ID

**Method 1: Using @username (for public channels)**
- Use your channel's public username (e.g., `@yourchannel`)

**Method 2: Using numeric ID (for private channels)**
1. Add your bot to the channel as an administrator
2. Send a test message to the channel
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for `"chat":{"id":-100...}` in the response
5. Use the numeric ID (e.g., `-1001234567890`)

### Add Bot to Channel

1. Open your Telegram channel
2. Go to channel settings → Administrators
3. Add your bot as an administrator
4. Grant permission to post messages

## Production Deployment

### Option 1: Server Deployment with PM2 (Recommended)

#### 1. Install Node.js and Yarn on Server

```bash
# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Yarn
npm install -g yarn
```

#### 2. Install PM2 Globally

```bash
yarn global add pm2
```

#### 3. Upload Project Files

Use SCP, rsync, or git to transfer files:

```bash
# Using rsync
rsync -avz --exclude 'node_modules' --exclude '.env' \
  /local/path/setmore_bot user@server:/path/to/setmore_bot

# Or using git
ssh user@server
cd /path/to
git clone <repository-url> setmore_bot
cd setmore_bot
```

#### 4. Install Dependencies on Server

```bash
cd /path/to/setmore_bot
yarn install --production
```

#### 5. Create Production .env File

```bash
nano .env
```

Add your production configuration (same format as `.env.example`).

#### 6. Build the Application

```bash
yarn build
```

#### 7. Create Logs Directory

```bash
mkdir -p logs
```

#### 8. Start with PM2

```bash
pm2 start dist/index.js --name setmore-bot
```

#### 9. Save PM2 Configuration

```bash
pm2 save
```

#### 10. Configure PM2 to Start on Boot

```bash
pm2 startup
# Follow the instructions printed by the command
```

### PM2 Management Commands

```bash
# View status
pm2 status

# View logs
pm2 logs setmore-bot

# View real-time logs
pm2 logs setmore-bot --lines 100

# Restart the bot
pm2 restart setmore-bot

# Stop the bot
pm2 stop setmore-bot

# Monitor CPU/Memory
pm2 monit

# View detailed info
pm2 show setmore-bot

# Delete from PM2
pm2 delete setmore-bot
```

### Alternative: Docker Deployment

If you prefer Docker over PM2, create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --production

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Create data directory
RUN mkdir -p data logs

# Start the application
CMD ["node", "dist/index.js"]
```

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  setmore-bot:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
```

Run with Docker:

```bash
docker-compose up -d
```

### Running on Local Machine (macOS)

Run continuously on your Mac:

```bash
# Build the project
yarn build

# Start with PM2
pm2 start dist/index.js --name setmore-bot

# Configure to start on login
pm2 startup launchd
pm2 save
```

## Testing the Deployment

### 1. Check Bot Logs

```bash
# For PM2
pm2 logs setmore-bot

# For Docker
docker-compose logs -f
```

### 2. Verify First Run

On first run, the bot should:
- Initialize the database with current appointments
- Not send any notifications
- Log: "First run complete - no notifications sent"

### 3. Test Cancellation Detection

To test, you need to simulate a cancellation:

1. Note the current appointments in the database
2. Wait for the next check cycle
3. If an appointment is removed from Setmore, the bot should detect it
4. Check Telegram channel for notification

### 4. Monitor for Errors

Watch the logs for any errors:

```bash
pm2 logs setmore-bot --err
```

## Troubleshooting

### Bot Not Sending Messages

**Check 1: Bot permissions**
- Ensure bot is added as channel administrator
- Verify bot has permission to post messages

**Check 2: Channel ID format**
- Public channels: `@channelname`
- Private channels: `-1001234567890` (must include the minus sign)

**Check 3: Test bot connection**

Add a test script to verify Telegram connection:

```typescript
import { initBot, testBotConnection } from './telegram/bot';

initBot({
  token: 'YOUR_TOKEN',
  channelId: 'YOUR_CHANNEL_ID',
  bookingUrl: 'https://katerynails.setmore.com/',
});

testBotConnection().then(() => {
  console.log('Bot test successful!');
}).catch(console.error);
```

### Calendar Not Fetching

**Check 1: Network connectivity**

```bash
curl -H "User-Agent: Apple Calendar" -H "Accept: text/calendar" \
  https://events.setmore.com/feeds/v1/Y2VjMzY4ZDE4ZWQ4MGVlMV8xNzY5NjkyMzQwODg4
```

**Check 2: URL is correct in .env**

Verify `CALENDAR_URL` in your `.env` file.

### Database Issues

**Check 1: Database file permissions**

```bash
ls -la data/appointments.db
```

**Check 2: Disk space**

```bash
df -h
```

**Reset database (caution: deletes all data)**

```bash
pm2 stop setmore-bot
rm data/appointments.db
pm2 start setmore-bot
```

## Maintenance

### Regular Maintenance Tasks

**1. Monitor Disk Space**

The database and logs can grow over time:

```bash
# Check database size
ls -lh data/appointments.db

# Check log size
ls -lh logs/
```

**2. Log Rotation**

PM2 handles log rotation automatically, but you can also use logrotate:

```bash
# /etc/logrotate.d/setmore-bot
/path/to/setmore_bot/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

**3. Database Cleanup**

Old cancelled appointments can be cleaned up periodically. You can add a cron job:

```bash
# Run cleanup script weekly
0 0 * * 0 node /path/to/cleanup-script.js
```

**4. Update Dependencies**

```bash
# Check for outdated packages
yarn outdated

# Update all dependencies
yarn upgrade

# Rebuild and restart
yarn build
pm2 restart setmore-bot
```

### Updating the Bot

```bash
# Stop the bot
pm2 stop setmore-bot

# Update code (via git or file transfer)
git pull
# or
rsync -avz local/path/ server:/remote/path/

# Install new dependencies
yarn install --production

# Rebuild
yarn build

# Restart
pm2 restart setmore-bot

# Or delete and start fresh
pm2 delete setmore-bot
pm2 start dist/index.js --name setmore-bot
pm2 save
```

## Monitoring

### Set Up Alerts

Consider setting up monitoring alerts:

1. **PM2 Plus** (formerly Keymetrics)
   - Real-time monitoring dashboard
   - Email/SMS alerts on crashes
   - https://pm2.io/

2. **UptimeRobot**
   - Monitor if the bot is running
   - Free tier available
   - https://uptimerobot.com/

3. **Log Monitoring**
   - Set up alerts for ERROR logs
   - Use tools like Papertrail or Loggly

### Health Check Script

Create a simple health check:

```bash
#!/bin/bash
# health-check.sh

if pm2 list | grep -q "setmore-bot.*online"; then
    echo "Bot is running"
    exit 0
else
    echo "Bot is not running!"
    exit 1
fi
```

Run it with cron:

```bash
# Check every 5 minutes
*/5 * * * * /path/to/health-check.sh || echo "Bot down!" | mail -s "Alert: Bot Down" your@email.com
```

## Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use environment-specific configs** - Separate dev/prod `.env` files
3. **Restrict file permissions**:
   ```bash
   chmod 600 .env
   chmod 600 data/appointments.db
   ```
4. **Use firewall rules** - Restrict unnecessary ports
5. **Keep dependencies updated** - Regular `yarn upgrade`
6. **Monitor logs for suspicious activity**

## Performance Tuning

### Adjust Check Interval

For less frequent checks (reduces API calls):

```env
CHECK_INTERVAL_MS=300000  # 5 minutes
```

For more frequent checks:

```env
CHECK_INTERVAL_MS=30000  # 30 seconds
```

### Database Optimization

The bot uses SQLite with WAL mode for better performance. No additional tuning needed for typical use.

## Backup

### Backup the Database

```bash
# Create backup
cp data/appointments.db data/appointments.db.backup

# Or with timestamp
cp data/appointments.db data/appointments.db.$(date +%Y%m%d_%H%M%S)
```

### Automate Backups

```bash
# Daily backup cron job
0 2 * * * cp /path/to/setmore_bot/data/appointments.db /backup/location/appointments.db.$(date +\%Y\%m\%d)
```

## Support

For issues or questions:
1. Check logs: `pm2 logs setmore-bot`
2. Verify configuration in `.env`
3. Test network connectivity to Setmore and Telegram
4. Review this documentation

## Summary

Your bot is now deployed and monitoring your Setmore calendar for cancellations! 🎉

Key points:
- ✅ Checks calendar every minute (configurable)
- ✅ Detects cancellations automatically
- ✅ Sends beautiful notifications to Telegram
- ✅ Runs continuously with PM2
- ✅ Auto-restarts on failure
- ✅ Starts on system boot
