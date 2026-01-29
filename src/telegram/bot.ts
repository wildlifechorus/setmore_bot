/**
 * Telegram bot module
 * Handles sending messages to Telegram channels
 */

import TelegramBot from 'node-telegram-bot-api';
import { Appointment } from '../calendar/types';
import { formatCancellationMessage, formatMultipleCancellations } from './formatter';

/**
 * Telegram bot instance
 */
let bot: TelegramBot | null = null;

/**
 * Bot configuration
 */
interface BotConfig {
  token: string;
  channelId: string;
  bookingUrl: string;
}

let config: BotConfig | null = null;

/**
 * Initialize the Telegram bot
 * @param botConfig - Bot configuration including token and channel ID
 */
export function initBot(botConfig: BotConfig): void {
  try {
    bot = new TelegramBot(botConfig.token, { polling: false });
    config = botConfig;
    console.log('Telegram bot initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error);
    throw error;
  }
}

/**
 * Get the bot instance
 * @throws Error if bot is not initialized
 */
function getBot(): TelegramBot {
  if (!bot || !config) {
    throw new Error('Bot not initialized. Call initBot() first.');
  }
  return bot;
}

/**
 * Get the bot configuration
 * @throws Error if bot is not initialized
 */
function getConfig(): BotConfig {
  if (!config) {
    throw new Error('Bot not initialized. Call initBot() first.');
  }
  return config;
}

/**
 * Send a message to the configured Telegram channel
 * @param message - Message text to send
 * @param options - Additional Telegram message options
 * @returns Promise that resolves when message is sent
 */
async function sendMessage(
  message: string,
  options: TelegramBot.SendMessageOptions = {},
): Promise<void> {
  const telegramBot = getBot();
  const { channelId } = getConfig();
  
  try {
    await telegramBot.sendMessage(channelId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...options,
    });
    console.log('Message sent to Telegram channel');
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    throw error;
  }
}

/**
 * Send a cancellation notification to the Telegram channel
 * @param appointment - The cancelled appointment
 * @returns Promise that resolves when notification is sent
 */
export async function sendCancellationNotification(
  appointment: Appointment,
): Promise<void> {
  const { bookingUrl } = getConfig();
  const message = formatCancellationMessage(appointment, bookingUrl);
  
  try {
    await sendMessage(message);
    console.log(`Cancellation notification sent for: ${appointment.id}`);
  } catch (error) {
    console.error('Failed to send cancellation notification:', error);
    throw error;
  }
}

/**
 * Send notifications for multiple cancellations
 * Can be sent as a single combined message or individual messages
 * @param appointments - Array of cancelled appointments
 * @param combineMessages - If true, send as one message; if false, send separately
 * @returns Promise that resolves when all notifications are sent
 */
export async function sendMultipleCancellationNotifications(
  appointments: Appointment[],
  combineMessages: boolean = true,
): Promise<void> {
  if (appointments.length === 0) {
    return;
  }
  
  const { bookingUrl } = getConfig();
  
  try {
    if (combineMessages) {
      // Send as a single combined message
      const message = formatMultipleCancellations(appointments, bookingUrl);
      await sendMessage(message);
      console.log(`Combined cancellation notification sent for ${appointments.length} appointments`);
    } else {
      // Send individual messages for each cancellation
      for (const apt of appointments) {
        await sendCancellationNotification(apt);
        
        // Add a small delay between messages to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Failed to send multiple cancellation notifications:', error);
    throw error;
  }
}

/**
 * Test the bot connection by sending a test message
 * @returns Promise that resolves when test message is sent
 */
export async function testBotConnection(): Promise<void> {
  const message = '🤖 Setmore Bot is online and monitoring for cancellations...';
  
  try {
    await sendMessage(message);
    console.log('Test message sent successfully');
  } catch (error) {
    console.error('Failed to send test message:', error);
    throw error;
  }
}
