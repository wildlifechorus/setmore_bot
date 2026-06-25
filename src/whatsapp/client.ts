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

/** How long to wait between reconnect attempts (ms). */
const RECONNECT_DELAY_MS = 15_000;

/** Maximum number of consecutive reconnect attempts before giving up. */
const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * How often to probe the Chromium page to verify the session is still alive.
 * Chosen to be shorter than the typical gap between notifications so frame
 * death is detected and healed before the next send is attempted.
 */
const HEALTH_CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Create a WhatsApp Notifier bound to the given configuration.
 * @param config - WhatsApp channel configuration
 * @returns A Notifier implementation for WhatsApp
 */
export function createWhatsAppNotifier(config: WhatsAppConfig): Notifier {
  const formatter = createMessageFormatter(whatsappStyle);
  let client: Client | null = null;
  let isReady = false;
  let reconnectAttempts = 0;
  let destroyed = false;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Stop the periodic health check timer.
   */
  function stopHealthCheck(): void {
    if (healthCheckTimer !== null) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  }

  /**
   * Start a periodic health check that evaluates a no-op expression on the
   * Chromium page.  If the page has been detached (frame death without a
   * disconnected event), the evaluate throws and triggerReconnect() is called
   * immediately — before the next notification is attempted.
   */
  function startHealthCheck(): void {
    stopHealthCheck();

    healthCheckTimer = setInterval(async () => {
      if (destroyed || !isReady || !client) {
        return;
      }

      try {
        // pupPage is a Puppeteer Page object; evaluate a trivial expression
        // to confirm the frame is still alive.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).pupPage.evaluate(() => true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stopHealthCheck();
        triggerReconnect(`Health check failed: ${msg}`);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Spin up a fresh Client instance and wire all event handlers.
   * Resolves when the `ready` event fires; rejects on `auth_failure`.
   */
  function createAndInitClient(): Promise<void> {
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
        isReady = true;
        reconnectAttempts = 0;
        startHealthCheck();
        resolve();
      });

      client.on('auth_failure', (msg: string) => {
        console.error('[WhatsApp] Authentication failed:', msg);
        isReady = false;
        client = null;
        reject(new Error(`WhatsApp auth failure: ${msg}`));
      });

      // Null out the stale client reference so subsequent sendMessage calls
      // immediately surface a clear "not initialised" error instead of a
      // cryptic Chromium protocol error. Then schedule a reconnect.
      client.on('disconnected', (reason: string) => {
        triggerReconnect(`Client disconnected: ${reason}`);
      });

      console.log('[WhatsApp] Initialising client (this may take a moment)...');
      client.initialize().catch(reject);
    });
  }

  /**
   * Return the active client, throwing if init() has not completed or the
   * client has disconnected and not yet reconnected.
   */
  function getClient(): Client {
    if (!client || !isReady) {
      throw new Error(
        'WhatsApp client is not ready. ' +
          (reconnectAttempts > 0
            ? `Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in progress.`
            : 'Call init() first.'),
      );
    }

    return client;
  }

  /**
   * Trigger a reconnect cycle from within a send-time error handler.
   * Marks the client as not ready, nulls the stale reference, and schedules
   * a fresh init — mirroring what the `disconnected` event handler does.
   * @param reason - Human-readable description logged before reconnecting
   */
  function triggerReconnect(reason: string): void {
    console.warn(`[WhatsApp] ${reason} — triggering reconnect.`);
    isReady = false;
    client = null;
    stopHealthCheck();

    if (destroyed) {
      return;
    }

    reconnectAttempts += 1;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[WhatsApp] Giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts.`,
      );
      return;
    }

    console.log(
      `[WhatsApp] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} ` +
        `in ${RECONNECT_DELAY_MS / 1000}s…`,
    );

    setTimeout(() => {
      if (destroyed) {
        return;
      }

      console.log('[WhatsApp] Reconnecting…');
      createAndInitClient().catch((err) => {
        console.error('[WhatsApp] Reconnect failed:', err);
      });
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Send a text message to the configured WhatsApp group.
   * Waits briefly after the send so the underlying Chromium session can flush
   * the message over the network before the process may exit.
   * Detects Chromium session failures (detached frame, session destroyed) and
   * triggers an automatic reconnect so future sends recover without a restart.
   * @param message - WhatsApp-markup message body
   */
  async function sendMessage(message: string): Promise<void> {
    try {
      const sent = await getClient().sendMessage(config.groupId, message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgId =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sent as any)?.id?._serialized ?? (sent as any)?.id ?? 'unknown';
      console.log(`[WhatsApp] Message sent to group (id: ${msgId})`);

      // Give Chromium a moment to flush the outgoing message over the network.
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // "detached Frame" means Chromium's page context was destroyed without
      // firing `disconnected`. Treat it the same way.
      if (
        msg.includes('detached Frame') ||
        msg.includes('detached frame') ||
        msg.includes('Session closed') ||
        msg.includes('Target closed') ||
        msg.includes('destroyed chrome')
      ) {
        triggerReconnect(`Chromium session error: ${msg}`);
      }

      // Re-throw so broadcast() logs the failure and Telegram still sends.
      throw err;
    }
  }

  return {
    name: 'WhatsApp',

    init(): Promise<void> {
      destroyed = false;
      return createAndInitClient();
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
      destroyed = true;
      isReady = false;
      stopHealthCheck();
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
