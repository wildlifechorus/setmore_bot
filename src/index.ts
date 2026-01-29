/**
 * Setmore Calendar Cancellation Monitor Bot
 * Main entry point for the application
 */

import * as dotenv from 'dotenv';
import { initDatabase, closeDatabase } from './database/db';
import { initBot } from './telegram/bot';
import { startScheduler, stopScheduler } from './monitor/scheduler';

/**
 * Load environment variables from .env file
 */
dotenv.config();

/**
 * Configuration from environment variables
 */
interface Config {
  telegramBotToken: string;
  telegramChannelId: string;
  calendarUrl: string;
  checkIntervalMs: number;
  databasePath: string;
  bookingUrl: string;
}

/**
 * Load and validate configuration from environment variables
 * @throws Error if required environment variables are missing
 */
function loadConfig(): Config {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
  const calendarUrl = process.env.CALENDAR_URL;
  const databasePath = process.env.DATABASE_PATH || './data/appointments.db';
  const checkIntervalMs = parseInt(
    process.env.CHECK_INTERVAL_MS || '60000',
    10,
  );
  
  // Booking URL is hardcoded as per requirements
  const bookingUrl = 'https://katerynails.setmore.com/';
  
  // Validate required environment variables
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }
  
  if (!telegramChannelId) {
    throw new Error('TELEGRAM_CHANNEL_ID environment variable is required');
  }
  
  if (!calendarUrl) {
    throw new Error('CALENDAR_URL environment variable is required');
  }
  
  return {
    telegramBotToken,
    telegramChannelId,
    calendarUrl,
    checkIntervalMs,
    databasePath,
    bookingUrl,
  };
}

/**
 * Main application function
 */
async function main(): Promise<void> {
  console.log('=================================================');
  console.log('  Setmore Calendar Cancellation Monitor Bot');
  console.log('=================================================\n');
  
  try {
    // Load configuration
    console.log('Loading configuration...');
    const config = loadConfig();
    console.log('Configuration loaded successfully\n');
    
    // Initialize database
    console.log('Initializing database...');
    initDatabase(config.databasePath);
    console.log('Database initialized\n');
    
    // Initialize Telegram bot
    console.log('Initializing Telegram bot...');
    initBot({
      token: config.telegramBotToken,
      channelId: config.telegramChannelId,
      bookingUrl: config.bookingUrl,
    });
    console.log('Telegram bot initialized\n');
    
    // Start the scheduler
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
 * Graceful shutdown handler
 */
function handleShutdown(signal: string): void {
  console.log(`\n\nReceived ${signal} signal. Shutting down gracefully...`);
  
  // Stop the scheduler
  stopScheduler();
  
  // Close database connection
  closeDatabase();
  
  console.log('Shutdown complete. Goodbye!\n');
  process.exit(0);
}

/**
 * Handle uncaught errors
 */
function handleUncaughtError(error: Error, origin: string): void {
  console.error(`Uncaught error (${origin}):`, error);
  // Don't exit - let the bot continue running
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Register error handlers
process.on('uncaughtException', (error) => handleUncaughtError(error, 'uncaughtException'));
process.on('unhandledRejection', (error) => handleUncaughtError(error as Error, 'unhandledRejection'));

// Start the application
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
