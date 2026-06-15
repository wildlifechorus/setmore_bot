/**
 * WhatsApp client module
 * Handles sending messages to a WhatsApp group via whatsapp-web.js.
 * The client drives a real WhatsApp account through headless Chromium.
 *
 * On first launch, a QR code is printed to the terminal; scan it from
 * WhatsApp -> Linked Devices -> Link a Device on the bot phone.
 * The session is persisted by LocalAuth so subsequent launches skip the QR.
 */

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';
import {
  formatCancellationMessage,
  formatMultipleCancellations,
  formatRescheduleMessage,
  formatMultipleReschedules,
} from './formatter';

/**
 * Configuration required to initialise the WhatsApp client.
 */
interface ClientConfig {
  /** WhatsApp group ID ending in @g.us — obtained via yarn list-groups. */
  groupId: string;
  /** Directory where the LocalAuth session is persisted across restarts. */
  sessionPath: string;
  /** Booking URL included in every notification message. */
  bookingUrl: string;
}

/** Singleton whatsapp-web.js client instance. */
let waClient: Client | null = null;

/** Resolved config stored after initClient() succeeds. */
let clientConfig: ClientConfig | null = null;

/**
 * Initialise the WhatsApp client and wait until it is fully ready.
 *
 * On first run this prints a QR code to stdout; scan it with the bot phone.
 * On subsequent runs the LocalAuth session is reused automatically.
 *
 * @param config - Client configuration
 * @returns Promise that resolves when the client fires the 'ready' event
 */
export function initClient(config: ClientConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    waClient = new Client({
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

    waClient.on('qr', (qr: string) => {
      console.log('\n📱 Scan the QR code below with WhatsApp on the bot phone:');
      console.log('   (WhatsApp → Linked Devices → Link a Device)\n');
      qrcode.generate(qr, { small: true });
    });

    waClient.on('authenticated', () => {
      console.log('WhatsApp client authenticated — session saved');
    });

    waClient.on('ready', () => {
      console.log('WhatsApp client is ready');
      clientConfig = config;
      resolve();
    });

    waClient.on('auth_failure', (msg: string) => {
      console.error('WhatsApp authentication failed:', msg);
      reject(new Error(`WhatsApp auth failure: ${msg}`));
    });

    waClient.on('disconnected', (reason: string) => {
      console.warn('WhatsApp client disconnected:', reason);
    });

    console.log('Initialising WhatsApp client (this may take a moment)...');
    waClient.initialize().catch(reject);
  });
}

/**
 * Gracefully tear down the WhatsApp client.
 * Call this from the shutdown handler before the process exits.
 */
export async function destroyClient(): Promise<void> {
  if (waClient) {
    try {
      await waClient.destroy();
      console.log('WhatsApp client destroyed');
    } catch (error) {
      console.error('Error destroying WhatsApp client:', error);
    } finally {
      waClient = null;
      clientConfig = null;
    }
  }
}

/**
 * Return the active client instance, throwing if not yet initialised.
 */
function getClient(): Client {
  if (!waClient || !clientConfig) {
    throw new Error('WhatsApp client not initialised. Call initClient() first.');
  }

  return waClient;
}

/**
 * Return the stored config, throwing if not yet initialised.
 */
function getConfig(): ClientConfig {
  if (!clientConfig) {
    throw new Error('WhatsApp client not initialised. Call initClient() first.');
  }

  return clientConfig;
}

/**
 * Send a text message to the configured WhatsApp group.
 * Waits briefly after the send to allow the underlying Chromium session
 * to flush the message over the network before the process can exit.
 * @param message - Plain text / WhatsApp-markup message body
 */
async function sendMessage(message: string): Promise<void> {
  const client = getClient();
  const { groupId } = getConfig();

  try {
    const sent = await client.sendMessage(groupId, message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgId = (sent as any)?.id?._serialized ?? (sent as any)?.id ?? 'unknown';
    console.log(`Message sent to WhatsApp group (id: ${msgId})`);

    // Give Chromium a moment to flush the outgoing message over the
    // network before the caller can call destroyClient().
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    throw error;
  }
}

/**
 * Send a cancellation notification to the WhatsApp group.
 * @param appointment - The cancelled appointment
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
 * Send notifications for multiple cancellations.
 * @param appointments - Array of cancelled appointments
 * @param combineMessages - Send as one combined message (true) or individually (false)
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
      const message = formatMultipleCancellations(appointments, bookingUrl);
      await sendMessage(message);
      console.log(
        `Combined cancellation notification sent for ${appointments.length} appointments`,
      );
    } else {
      for (const apt of appointments) {
        await sendCancellationNotification(apt);
        // Small delay between messages to avoid WhatsApp rate limiting.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error(
      'Failed to send multiple cancellation notifications:',
      error,
    );
    throw error;
  }
}

/**
 * Send a reschedule notification to the WhatsApp group.
 * @param rescheduled - The rescheduled appointment info including the freed gap
 */
export async function sendRescheduleNotification(
  rescheduled: RescheduledAppointment,
): Promise<void> {
  const { bookingUrl } = getConfig();
  const message = formatRescheduleMessage(rescheduled, bookingUrl);

  try {
    await sendMessage(message);
    console.log(
      `Reschedule notification sent for: ${rescheduled.appointment.id}`,
    );
  } catch (error) {
    console.error('Failed to send reschedule notification:', error);
    throw error;
  }
}

/**
 * Send notifications for multiple reschedules.
 * @param rescheduled - Array of rescheduled appointments
 * @param combineMessages - Send as one combined message (true) or individually (false)
 */
export async function sendMultipleRescheduleNotifications(
  rescheduled: RescheduledAppointment[],
  combineMessages: boolean = true,
): Promise<void> {
  if (rescheduled.length === 0) {
    return;
  }

  const { bookingUrl } = getConfig();

  try {
    if (combineMessages) {
      const message = formatMultipleReschedules(rescheduled, bookingUrl);
      await sendMessage(message);
      console.log(
        `Combined reschedule notification sent for ${rescheduled.length} appointments`,
      );
    } else {
      for (const item of rescheduled) {
        await sendRescheduleNotification(item);
        // Small delay between messages to avoid WhatsApp rate limiting.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('Failed to send multiple reschedule notifications:', error);
    throw error;
  }
}

/**
 * Test the WhatsApp connection by sending a message to the group.
 * Useful for verifying the bot is online and the group ID is correct.
 */
export async function testBotConnection(): Promise<void> {
  const message =
    '🤖 Setmore Bot is online and monitoring for cancellations...';

  try {
    await sendMessage(message);
    console.log('Test message sent successfully');
  } catch (error) {
    console.error('Failed to send test message:', error);
    throw error;
  }
}
