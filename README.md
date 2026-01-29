# Setmore Calendar Cancellation Monitor Bot

A Telegram bot that monitors your Setmore calendar for cancellations and automatically posts available slots to your Telegram channel.

## Features

- 🔄 **Automatic Monitoring** - Checks calendar every minute (configurable)
- 📅 **Cancellation Detection** - Compares current calendar with previous state
- 📱 **Telegram Notifications** - Beautiful formatted messages with booking link
- 💾 **SQLite Database** - Efficient appointment tracking
- 🔒 **Type-Safe** - Built with TypeScript and strict type checking
- 🚀 **Production Ready** - PM2 configuration for deployment
- ⚡ **Retry Logic** - Automatic retries with exponential backoff
- 🕒 **Timezone Aware** - Displays times in Lisbon timezone

## How It Works

```
Every 60 seconds
    ↓
Fetch iCal Feed → Parse Calendar → Compare with Database
    ↓                                       ↓
Found Cancellation? → Format Message → Send to Telegram
    ↓
Update Database
```

## Quick Start

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHANNEL_ID=@yourchannel
CALENDAR_URL=https://events.setmore.com/feeds/v1/Y2VjMzY4ZDE4ZWQ4MGVlMV8xNzY5NjkyMzQwODg4
CHECK_INTERVAL_MS=60000
DATABASE_PATH=./data/appointments.db
```

### 3. Run in Development

```bash
yarn dev
```

### 4. Build for Production

```bash
yarn build
```

### 5. Start with PM2

```bash
pm2 start dist/index.js --name setmore-bot
```

## Configuration

All configuration is done through environment variables in the `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from @BotFather | *Required* |
| `TELEGRAM_CHANNEL_ID` | Channel ID (e.g., @channel or -100...) | *Required* |
| `CALENDAR_URL` | Your Setmore iCal feed URL | *Required* |
| `CHECK_INTERVAL_MS` | How often to check (milliseconds) | 60000 (1 min) |
| `DATABASE_PATH` | SQLite database location | ./data/appointments.db |
| `LOG_LEVEL` | Logging verbosity | info |

## Getting Started with Telegram

### Create a Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow prompts
3. Copy the bot token
4. Add token to `.env` as `TELEGRAM_BOT_TOKEN`

### Get Your Channel ID

**For public channels:**
- Use your channel's username: `@yourchannel`

**For private channels:**
1. Add your bot to the channel as admin
2. Send a test message
3. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find `"chat":{"id":-100...}`
5. Use that numeric ID

### Add Bot to Channel

1. Go to channel settings → Administrators
2. Add your bot
3. Grant "Post Messages" permission

## Project Structure

```
setmore_bot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── calendar/
│   │   ├── fetcher.ts        # Fetch and parse iCal
│   │   └── types.ts          # Type definitions
│   ├── database/
│   │   ├── db.ts             # Database operations
│   │   └── schema.ts         # Database schema
│   ├── telegram/
│   │   ├── bot.ts            # Telegram bot logic
│   │   └── formatter.ts      # Message formatting
│   └── monitor/
│       ├── scheduler.ts      # Main loop
│       └── detector.ts       # Cancellation detection
├── .env                      # Configuration (not committed)
├── .env.example              # Configuration template
├── ecosystem.config.js       # PM2 configuration
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

## Scripts

```bash
# Development
yarn dev              # Run with hot-reload

# Build
yarn build            # Compile TypeScript

# Production
yarn start            # Run compiled code

# Code Quality
yarn format           # Format with Prettier
yarn lint             # Lint with ESLint
yarn type-check       # Check types without building
```

## Notification Format

When a cancellation is detected, the bot sends:

```
🎉 New Slot Available!

📅 Date: Monday, January 29, 2026
🕐 Time: 14:30 - 16:00 (Lisbon time)
💅 Service: Manicure + custom nail art

Book now: https://katerynails.setmore.com/

#AvailableSlot
```

## Development

### Type Safety

The project uses strict TypeScript configuration:
- No implicit `any`
- Strict null checks
- Unused variable warnings
- Explicit function return types (where needed)

### Code Style

Prettier configuration enforces:
- Single quotes
- Semicolons
- 2-space indentation
- 80 character line width
- Trailing commas

### Error Handling

- All async operations wrapped in try-catch
- Automatic retries with exponential backoff
- Network failures don't crash the bot
- Graceful shutdown on SIGTERM/SIGINT

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions including:
- Server setup
- PM2 configuration
- Docker deployment
- Troubleshooting
- Monitoring
- Maintenance

## Database Schema

```sql
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,              -- iCal UID
  start_time INTEGER NOT NULL,      -- Unix timestamp (ms)
  end_time INTEGER NOT NULL,        -- Unix timestamp (ms)
  summary TEXT,                     -- Appointment title
  description TEXT,                 -- Appointment details
  status TEXT DEFAULT 'active',     -- 'active' or 'cancelled'
  last_seen INTEGER NOT NULL,       -- Last check timestamp
  created_at INTEGER NOT NULL       -- Record creation timestamp
);
```

## Cancellation Detection Algorithm

1. Fetch current appointments from Setmore calendar
2. Load active future appointments from database
3. Compare appointment IDs:
   - **In DB but NOT in feed** → Cancelled (send notification)
   - **In feed but NOT in DB** → New appointment (add to DB)
   - **In both** → Existing appointment (update last_seen)
4. Update database with changes

## Edge Cases Handled

- ✅ **First Run** - Initializes database without sending notifications
- ✅ **Past Appointments** - Only considers future appointments
- ✅ **Network Failures** - Retries with exponential backoff
- ✅ **Parse Errors** - Logs error and continues monitoring
- ✅ **Telegram Failures** - Queues for retry
- ✅ **Multiple Cancellations** - Combines into single message

## Testing

### Local Testing

1. Set `CHECK_INTERVAL_MS=10000` (10 seconds) for faster testing
2. Run `yarn dev`
3. Watch logs for calendar checks
4. Verify first run initialization

### Cancellation Simulation

1. Note current appointments in database
2. Manually remove an event from Setmore
3. Wait for next check cycle
4. Verify notification in Telegram

## Troubleshooting

### Bot not starting?

- Check `.env` file exists and has all required variables
- Verify database directory is writable
- Check Node.js version (requires v18+)

### Not detecting cancellations?

- Verify calendar URL is accessible
- Check database has appointments
- Review logs: `pm2 logs setmore-bot`

### Telegram not working?

- Verify bot token is correct
- Check channel ID format
- Ensure bot is channel admin with post permission

## Performance

- **Memory Usage**: ~50-100 MB
- **CPU Usage**: < 1% (mostly idle)
- **Network**: 1 API call per check interval
- **Database**: SQLite with WAL mode (very efficient)

## Security

- Environment variables for sensitive data
- `.env` file not committed to git
- Input validation on calendar data
- Rate limiting on Telegram messages
- Read-only database queries where possible

## Contributing

This is a private project, but you can:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure tests pass (`yarn type-check`, `yarn lint`)
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues:
1. Check logs: `pm2 logs setmore-bot`
2. Review [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
3. Verify `.env` configuration
4. Test network connectivity

## Credits

Built with:
- [Node.js](https://nodejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [node-ical](https://github.com/jens-maus/node-ical)
- [PM2](https://pm2.keymetrics.io/)

---

Made with ❤️ for Kateryna Nails Lisboa
