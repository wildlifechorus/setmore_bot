/**
 * Telegram notifier
 * Sends messages to a Telegram channel via node-telegram-bot-api using HTML
 * parse mode.  No polling is used — the bot only pushes notifications.
 */

import TelegramBot from 'node-telegram-bot-api';
import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';
import { Notifier } from '../notifications/types';
import {
  createMessageFormatter,
  telegramHtmlStyle,
} from '../notifications/formatter';

/**
 * Configuration required to build the Telegram notifier.
 */
export interface TelegramConfig {
  /** Bot token from @BotFather. */
  token: string;
  /** Target channel ID (e.g. @channel or -100...). */
  channelId: string;
  /** Booking URL included in every notification message. */
  bookingUrl: string;
}

/**
 * Create a Telegram Notifier bound to the given configuration.
 * @param config - Telegram channel configuration
 * @returns A Notifier implementation for Telegram
 */
export function createTelegramNotifier(config: TelegramConfig): Notifier {
  const formatter = createMessageFormatter(telegramHtmlStyle);
  let bot: TelegramBot | null = null;

  /**
   * Return the active bot, throwing if init() has not completed.
   */
  function getBot(): TelegramBot {
    if (!bot) {
      throw new Error('Telegram bot not initialised. Call init() first.');
    }

    return bot;
  }

  /**
   * Send a message to the configured Telegram channel.
   * @param message - HTML-formatted message body
   */
  async function sendMessage(message: string): Promise<void> {
    await getBot().sendMessage(config.channelId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    });
    console.log('[Telegram] Message sent to channel');
  }

  return {
    name: 'Telegram',

    async init(): Promise<void> {
      bot = new TelegramBot(config.token, { polling: false });
      // Validate the token early so the registry can drop this channel if the
      // credentials are wrong, rather than failing on the first real send.
      const me = await bot.getMe();
      console.log(`[Telegram] Authenticated as @${me.username}`);
    },

    async sendMultipleCancellationNotifications(
      appointments: Appointment[],
      combineMessages: boolean = true,
    ): Promise<void> {
      if (appointments.length === 0) {
        return;
      }

      if (combineMessages) {
        const message = formatter.formatMultipleCancellations(
          appointments,
          config.bookingUrl,
        );
        await sendMessage(message);
        console.log(
          `[Telegram] Combined cancellation notification sent for ${appointments.length} appointment(s)`,
        );
      } else {
        for (const apt of appointments) {
          const message = formatter.formatCancellationMessage(
            apt,
            config.bookingUrl,
          );
          await sendMessage(message);
          // Small delay between messages to avoid Telegram rate limiting.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },

    async sendMultipleRescheduleNotifications(
      rescheduled: RescheduledAppointment[],
      combineMessages: boolean = true,
    ): Promise<void> {
      if (rescheduled.length === 0) {
        return;
      }

      if (combineMessages) {
        const message = formatter.formatMultipleReschedules(
          rescheduled,
          config.bookingUrl,
        );
        await sendMessage(message);
        console.log(
          `[Telegram] Combined reschedule notification sent for ${rescheduled.length} appointment(s)`,
        );
      } else {
        for (const item of rescheduled) {
          const message = formatter.formatRescheduleMessage(
            item,
            config.bookingUrl,
          );
          await sendMessage(message);
          // Small delay between messages to avoid Telegram rate limiting.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },

    async testConnection(): Promise<void> {
      await sendMessage(
        '🤖 Setmore Bot is online and monitoring for cancellations...',
      );
      console.log('[Telegram] Test message sent successfully');
    },

    async destroy(): Promise<void> {
      // node-telegram-bot-api with polling: false holds no persistent
      // connection to close; simply drop the reference.
      bot = null;
      console.log('[Telegram] Client released');
    },
  };
}
