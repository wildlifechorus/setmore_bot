/**
 * WhatsApp notifier
 * Sends messages to a WhatsApp group via whatsapp-web.js, which drives a real
 * WhatsApp account through headless Chromium.
 *
 * On first launch, a QR code is printed to the terminal; scan it from
 * WhatsApp -> Linked Devices -> Link a Device on the bot phone.
 * The session is persisted by LocalAuth so subsequent launches skip the QR.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';
import { Notifier } from '../notifications/types';
import {
  createMessageFormatter,
  whatsappStyle,
} from '../notifications/formatter';

/**
 * Configuration required to build the WhatsApp notifier.
 */
export interface WhatsAppConfig {
  /** WhatsApp group ID ending in @g.us — obtained via yarn list-groups. */
  groupId: string;
  /** Directory where the LocalAuth session is persisted across restarts. */
  sessionPath: string;
  /** Booking URL included in every notification message. */
  bookingUrl: string;
}

/**
 * Create a WhatsApp Notifier bound to the given configuration.
 * @param config - WhatsApp channel configuration
 * @returns A Notifier implementation for WhatsApp
 */
export function createWhatsAppNotifier(config: WhatsAppConfig): Notifier {
  const formatter = createMessageFormatter(whatsappStyle);
  let client: Client | null = null;

  /**
   * Return the active client, throwing if init() has not completed.
   */
  function getClient(): Client {
    if (!client) {
      throw new Error('WhatsApp client not initialised. Call init() first.');
    }

    return client;
  }

  /**
   * Send a text message to the configured WhatsApp group.
   * Waits briefly after the send so the underlying Chromium session can flush
   * the message over the network before the process may exit.
   * @param message - WhatsApp-markup message body
   */
  async function sendMessage(message: string): Promise<void> {
    const sent = await getClient().sendMessage(config.groupId, message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgId =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sent as any)?.id?._serialized ?? (sent as any)?.id ?? 'unknown';
    console.log(`[WhatsApp] Message sent to group (id: ${msgId})`);

    // Give Chromium a moment to flush the outgoing message over the network.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return {
    name: 'WhatsApp',

    init(): Promise<void> {
      return new Promise((resolve, reject) => {
        client = new Client({
          authStrategy: new LocalAuth({ dataPath: config.sessionPath }),
          puppeteer: {
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
            ],
          },
        });

        client.on('qr', (qr: string) => {
          console.log(
            '\n📱 Scan the QR code below with WhatsApp on the bot phone:',
          );
          console.log('   (WhatsApp → Linked Devices → Link a Device)\n');
          qrcode.generate(qr, { small: true });
        });

        client.on('authenticated', () => {
          console.log('[WhatsApp] Authenticated — session saved');
        });

        client.on('ready', () => {
          console.log('[WhatsApp] Client is ready');
          resolve();
        });

        client.on('auth_failure', (msg: string) => {
          console.error('[WhatsApp] Authentication failed:', msg);
          reject(new Error(`WhatsApp auth failure: ${msg}`));
        });

        client.on('disconnected', (reason: string) => {
          console.warn('[WhatsApp] Client disconnected:', reason);
        });

        console.log('[WhatsApp] Initialising client (this may take a moment)...');
        client.initialize().catch(reject);
      });
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
          `[WhatsApp] Combined cancellation notification sent for ${appointments.length} appointment(s)`,
        );
      } else {
        for (const apt of appointments) {
          const message = formatter.formatCancellationMessage(
            apt,
            config.bookingUrl,
          );
          await sendMessage(message);
          // Small delay between messages to avoid WhatsApp rate limiting.
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
          `[WhatsApp] Combined reschedule notification sent for ${rescheduled.length} appointment(s)`,
        );
      } else {
        for (const item of rescheduled) {
          const message = formatter.formatRescheduleMessage(
            item,
            config.bookingUrl,
          );
          await sendMessage(message);
          // Small delay between messages to avoid WhatsApp rate limiting.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },

    async testConnection(): Promise<void> {
      await sendMessage(
        '🤖 Setmore Bot is online and monitoring for cancellations...',
      );
      console.log('[WhatsApp] Test message sent successfully');
    },

    async destroy(): Promise<void> {
      if (client) {
        try {
          await client.destroy();
          console.log('[WhatsApp] Client destroyed');
        } catch (error) {
          console.error('[WhatsApp] Error destroying client:', error);
        } finally {
          client = null;
        }
      }
    },
  };
}
