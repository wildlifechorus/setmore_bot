/**
 * Setmore Calendar Cancellation Monitor Bot
 * Main entry point for the application.
 *
 * Notifications fan out to every configured channel (WhatsApp and/or Telegram).
 * A channel is enabled automatically when its env vars are present:
 *   - WhatsApp: WHATSAPP_GROUP_ID
 *   - Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID
 * At least one channel must be configured.
 *
 * On first WhatsApp launch a QR code is printed to the terminal — scan it with
 * WhatsApp on the dedicated bot phone to link the session.  Subsequent launches
 * reuse the saved session automatically.
 */

import * as dotenv from 'dotenv';
import { initDatabase, closeDatabase } from './database/db';
import {
  initNotifiers,
  destroyNotifiers,
  NotifiersConfig,
} from './notifications';
import { startScheduler, stopScheduler } from './monitor/scheduler';

dotenv.config();

/**
 * Application configuration loaded from environment variables.
 */
interface Config {
  /** iCal feed URL for the Setmore calendar. */
  calendarUrl: string;
  /** How often to check the calendar, in milliseconds. */
  checkIntervalMs: number;
  /** Path to the SQLite database file. */
  databasePath: string;
  /** Resolved notification channel configuration. */
  notifiers: NotifiersConfig;
}

/**
 * Load and validate configuration from environment variables.
 * @throws Error if required configuration is missing or no channel is set
 */
function loadConfig(): Config {
  const calendarUrl = process.env.CALENDAR_URL;
  if (!calendarUrl) {
    throw new Error('CALENDAR_URL environment variable is required');
  }

  // Booking URL is hardcoded as per requirements.
  const bookingUrl = 'https://katerynails.setmore.com/';

  // WhatsApp is enabled when its group ID is present.
  const whatsappGroupId = process.env.WHATSAPP_GROUP_ID;
  const whatsapp = whatsappGroupId
    ? {
        groupId: whatsappGroupId,
        sessionPath:
          process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth',
      }
    : undefined;

  // Telegram is enabled when both its token and channel ID are present.
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
  const telegram =
    telegramToken && telegramChannelId
      ? { token: telegramToken, channelId: telegramChannelId }
      : undefined;

  if (!whatsapp && !telegram) {
    throw new Error(
      'No notification channel configured. Set WHATSAPP_GROUP_ID and/or ' +
        'TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID.',
    );
  }

  return {
    calendarUrl,
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '60000', 10),
    databasePath: process.env.DATABASE_PATH || './data/appointments.db',
    notifiers: { bookingUrl, whatsapp, telegram },
  };
}

/**
 * Main application function.
 * Initialises infrastructure in order: DB → notification channels → scheduler.
 * Channels are awaited so the scheduler never fires before they are ready.
 */
async function main(): Promise<void> {
  console.log('=================================================');
  console.log('  Setmore Calendar Cancellation Monitor Bot');
  console.log('=================================================\n');

  try {
    console.log('Loading configuration...');
    const config = loadConfig();
    console.log('Configuration loaded successfully\n');

    console.log('Initialising database...');
    initDatabase(config.databasePath);
    console.log('Database initialised\n');

    // Notification channels must be ready before the scheduler starts sending.
    // WhatsApp init may print a QR code to the terminal on first launch.
    console.log('Initialising notification channels...');
    await initNotifiers(config.notifiers);
    console.log('Notification channels ready\n');

    console.log('Starting monitoring scheduler...');
    startScheduler({
      calendarUrl: config.calendarUrl,
      checkIntervalMs: config.checkIntervalMs,
    });

    console.log('\n=================================================');
    console.log('  Bot is now running and monitoring calendar');
    console.log('  Press Ctrl+C to stop');
    console.log('=================================================\n');
  } catch (error) {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown — stops the scheduler, tears down notification channels,
 * and closes the database before exiting.
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n\nReceived ${signal} signal. Shutting down gracefully...`);

  stopScheduler();
  await destroyNotifiers();
  closeDatabase();

  console.log('Shutdown complete. Goodbye!\n');
  process.exit(0);
}

/**
 * Log uncaught errors but keep the bot running.
 */
function handleUncaughtError(error: Error, origin: string): void {
  console.error(`Uncaught error (${origin}):`, error);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('uncaughtException', (error) =>
  handleUncaughtError(error, 'uncaughtException'),
);
process.on('unhandledRejection', (error) =>
  handleUncaughtError(error as Error, 'unhandledRejection'),
);

main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
