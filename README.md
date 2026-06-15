# Setmore Calendar Cancellation Monitor Bot

A WhatsApp bot that monitors your Setmore calendar for cancellations and
automatically posts available slots to a WhatsApp group.

Uses [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js), an
unofficial library that drives a real WhatsApp account through headless
Chromium. No Meta Business account or API approval is required, but the
approach is against WhatsApp's ToS; use a dedicated phone number for the
bot account, not your personal one.

## Features

- **Automatic Monitoring**, checks the calendar every minute (configurable)
- **Cancellation Detection**, compares the live iCal feed with the previous state
- **Reschedule Detection**, identifies gaps created when appointments move
- **WhatsApp Group Notifications**, bold-formatted messages posted to a group
- **Broadcast-like delivery**, set the group to "admins only can send" so the bot
  is the sole poster and members just read
- **SQLite Database**, efficient appointment tracking and deduplication
- **Type-Safe**, TypeScript with strict type-checking
- **Production Ready**, PM2 configuration for deployment
- **Retry Logic**, automatic retries with exponential backoff
- **Timezone Aware**, displays times in Lisbon timezone

## How It Works

```
Every 60 seconds
    ↓
Fetch iCal Feed → Parse Calendar → Compare with Database
    ↓                                       ↓
Found Cancellation? → Format Message → Send to WhatsApp group
    ↓
Update Database
```

## Quick Start

### 1. WhatsApp account setup (do this first)

1. Get a **dedicated phone number** for the bot (separate SIM / eSIM).
   If the account is banned, you don't lose your personal WhatsApp.
2. Install WhatsApp on that phone and verify the number.
3. Create a group (e.g. "Kateryna Nails, Open Slots"):
   - Add at least one contact (WhatsApp requires ≥ 1 member to create a group).
   - Make the bot account a group **admin**.
   - Group Settings → Send messages → **Only admins** (broadcast-like mode).
   - Share the invite link with clients who want slot alerts.
4. Keep the bot phone online periodically so the linked-device session stays alive.

### 2. Install dependencies

```bash
yarn install
```

> Note: `whatsapp-web.js` pulls in Puppeteer which downloads Chromium (~170 MB).
> On a server, install the system Chromium dependencies first, see [DEPLOYMENT.md](DEPLOYMENT.md).

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# WhatsApp group ID, obtain with: yarn list-groups
WHATSAPP_GROUP_ID=1234567890-1609459200@g.us

# Where the WhatsApp session is saved (default shown)
WHATSAPP_SESSION_PATH=./data/wwebjs_auth

# Setmore iCal feed URL (Setmore → Integrations → iCal)
CALENDAR_URL=https://events.setmore.com/feeds/v1/...

# Check interval in ms (default 60 000 = 1 minute)
CHECK_INTERVAL_MS=60000

# SQLite database path (default shown)
DATABASE_PATH=./data/appointments.db
```

### 4. Log in and find the group ID

```bash
yarn list-groups
```

A QR code prints in the terminal. On the bot phone:
**WhatsApp → Linked Devices → Link a Device** → scan it.

The session is saved automatically. The script then prints every group the
account is in, with its `@g.us` ID:

```
Name : Kateryna Nails, Open Slots
ID   : 1234567890-1609459200@g.us
```

Copy the ID into `WHATSAPP_GROUP_ID` in `.env`.

### 5. Run in development

```bash
yarn dev
```

Subsequent runs reuse the saved session, no QR needed.

### 6. Build for production

```bash
yarn build
yarn start
```

## Configuration reference

| Variable | Description | Default |
|---|---|---|
| `WHATSAPP_GROUP_ID` | Group ID ending in `@g.us`, from `yarn list-groups` | **Required** |
| `WHATSAPP_SESSION_PATH` | Directory for the LocalAuth WhatsApp session | `./data/wwebjs_auth` |
| `CALENDAR_URL` | Setmore iCal feed URL | **Required** |
| `CHECK_INTERVAL_MS` | How often to check, in milliseconds | `60000` (1 min) |
| `DATABASE_PATH` | SQLite database file path | `./data/appointments.db` |

## Project structure

```
setmore_bot/
├── src/
│   ├── index.ts              # Main entry point
│   ├── calendar/
│   │   ├── fetcher.ts        # Fetch and parse iCal feed
│   │   └── types.ts          # Shared type definitions
│   ├── database/
│   │   ├── db.ts             # Database operations
│   │   └── schema.ts         # SQLite schema
│   ├── whatsapp/
│   │   ├── client.ts         # WhatsApp client (send* functions)
│   │   └── formatter.ts      # Message formatting
│   ├── monitor/
│   │   ├── scheduler.ts      # Main polling loop
│   │   └── detector.ts       # Cancellation/reschedule detection
│   └── scripts/
│       └── list-groups.ts    # One-shot helper to find group @g.us ID
├── data/
│   ├── appointments.db       # SQLite database (created at runtime)
│   └── wwebjs_auth/          # WhatsApp session (created at runtime)
├── .env                      # Configuration (not committed)
├── .env.example              # Configuration template
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies and scripts
```

## Scripts

```bash
yarn dev          # Run in development (tsx, no build step)
yarn build        # Compile TypeScript to dist/
yarn start        # Run compiled output
yarn list-groups  # Print group IDs for the linked WhatsApp account
yarn format       # Format with Prettier
yarn lint         # Lint with ESLint
yarn type-check   # Type-check without building
yarn test         # Run interval unit tests
```

## Notification format

When a cancellation is detected, the group receives:

```
🎉 *New Slot Available!*

📅 *Date:* Monday, January 29, 2026
🕐 *Time:* 14:30 - 16:00 (Lisbon time)

Book now: https://katerynails.setmore.com/

#AvailableSlot
```

(`*bold*` renders natively in WhatsApp.)

## Cancellation detection algorithm

1. Fetch current appointments from the Setmore iCal feed.
2. Filter to future-only; deduplicate recurring events by iCal UID.
3. Compare with active appointments in the database:
   - **In DB but NOT in feed** → cancelled → send notification.
   - **In feed but NOT in DB** → new → add to DB.
   - **In both** → existing → update `last_seen`.
4. Also detect reschedules that create gaps worthy of notification.

## Edge cases handled

- **First run**, initialises the DB without sending any notifications.
- **Past appointments**, only future appointments are considered.
- **Network failures**, retries with exponential backoff.
- **Multiple cancellations**, combined into a single WhatsApp message.
- **Graceful shutdown**, SIGTERM/SIGINT destroys the WhatsApp client cleanly.

## Performance

- **Memory**: ~300–500 MB (Chromium + Node.js process)
- **CPU**: < 1% when idle between checks
- **Network**: 1 iCal fetch per check interval + 1 WhatsApp Web connection

## Security

- Environment variables for all secrets.
- `.env` not committed to git.
- WhatsApp session stored locally, keep the `data/` directory private.
- Rate limiting: 1-second delay between individual messages.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| WhatsApp ToS violation / ban | Use a dedicated phone number, not personal |
| Library breaks on WhatsApp Web update | Pin `whatsapp-web.js` version; upgrade when needed |
| Session expiry | Keep the bot phone online; `LocalAuth` persists the session |
| Bot loses group admin | Monitor: sends will fail if admin is removed |

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full instructions including:
- Server setup and Chromium system dependencies
- Initial QR scan procedure on a remote server
- PM2 and Docker configurations
- Persistent session directory setup
- Troubleshooting

## Database schema

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

## Credits

Built with:
- [Node.js](https://nodejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [node-ical](https://github.com/jens-maus/node-ical)
- [PM2](https://pm2.keymetrics.io/)

---

Made with ❤️ for Kateryna Nails Lisboa
