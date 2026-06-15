/**
 * Setmore Calendar Cancellation Monitor Bot
 * Main entry point for the application.
 *
 * On first launch a QR code is printed to the terminal — scan it with
 * WhatsApp on the dedicated bot phone to link the session.
 * Subsequent launches reuse the saved session automatically.
 */

import * as dotenv from 'dotenv';
import { initDatabase, closeDatabase } from './database/db';
import { initClient, destroyClient } from './whatsapp/client';
import { startScheduler, stopScheduler } from './monitor/scheduler';

dotenv.config();

/**
 * Application configuration loaded from environment variables.
 */
interface Config {
  /** WhatsApp group ID (ends in @g.us) — obtain via yarn list-groups. */
  whatsappGroupId: string;
  /** Directory where the LocalAuth WhatsApp session is persisted. */
  whatsappSessionPath: string;
  /** iCal feed URL for the Setmore calendar. */
  calendarUrl: string;
  /** How often to check the calendar, in milliseconds. */
  checkIntervalMs: number;
  /** Path to the SQLite database file. */
  databasePath: string;
  /** Booking URL included in every notification message. */
  bookingUrl: string;
}

/**
 * Load and validate configuration from environment variables.
 * @throws Error if a required environment variable is missing
 */
function loadConfig(): Config {
  const whatsappGroupId = process.env.WHATSAPP_GROUP_ID;
  const calendarUrl = process.env.CALENDAR_URL;

  if (!whatsappGroupId) {
    throw new Error('WHATSAPP_GROUP_ID environment variable is required');
  }

  if (!calendarUrl) {
    throw new Error('CALENDAR_URL environment variable is required');
  }

  return {
    whatsappGroupId,
    whatsappSessionPath:
      process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth',
    calendarUrl,
    checkIntervalMs: parseInt(
      process.env.CHECK_INTERVAL_MS || '60000',
      10,
    ),
    databasePath: process.env.DATABASE_PATH || './data/appointments.db',
    // Booking URL is hardcoded as per requirements.
    bookingUrl: 'https://katerynails.setmore.com/',
  };
}

/**
 * Main application function.
 * Initialises infrastructure in order: DB → WhatsApp client → scheduler.
 * WhatsApp initialisation is awaited so the scheduler never fires before
 * the client is ready.
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

    // WhatsApp client must be fully ready before the scheduler starts
    // sending notifications.  initClient() resolves on the 'ready' event,
    // which may involve printing a QR code on first launch.
    console.log('Initialising WhatsApp client...');
    await initClient({
      groupId: config.whatsappGroupId,
      sessionPath: config.whatsappSessionPath,
      bookingUrl: config.bookingUrl,
    });
    console.log('WhatsApp client ready\n');

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
 * Graceful shutdown — stops the scheduler, destroys the WhatsApp client,
 * and closes the database before exiting.
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n\nReceived ${signal} signal. Shutting down gracefully...`);

  stopScheduler();
  await destroyClient();
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
