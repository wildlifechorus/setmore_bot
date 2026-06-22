/**
 * Notification registry
 *
 * Builds the set of active notifiers from environment presence, initialises
 * them, and fans cancellation / reschedule broadcasts out to every active
 * channel.  Sending is best-effort: one channel failing never blocks another.
 */

import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';
import { Notifier } from './types';
import { createWhatsAppNotifier } from '../whatsapp/client';
import { createTelegramNotifier } from '../telegram/client';

/**
 * Configuration for initialising the notification channels.
 */
export interface NotifiersConfig {
  /** Booking URL included in every notification message. */
  bookingUrl: string;
  /** WhatsApp settings; channel is enabled when groupId is present. */
  whatsapp?: {
    groupId: string;
    sessionPath: string;
  };
  /** Telegram settings; channel is enabled when token + channelId are present. */
  telegram?: {
    token: string;
    channelId: string;
  };
}

/** Active notifiers that successfully initialised. */
let activeNotifiers: Notifier[] = [];

/**
 * Build the list of notifiers requested by the configuration.
 * A channel is only built when its required settings are present.
 * @param config - Notification configuration
 * @returns The notifiers to initialise
 */
function buildRequestedNotifiers(config: NotifiersConfig): Notifier[] {
  const requested: Notifier[] = [];

  if (config.whatsapp) {
    requested.push(
      createWhatsAppNotifier({
        groupId: config.whatsapp.groupId,
        sessionPath: config.whatsapp.sessionPath,
        bookingUrl: config.bookingUrl,
      }),
    );
  }

  if (config.telegram) {
    requested.push(
      createTelegramNotifier({
        token: config.telegram.token,
        channelId: config.telegram.channelId,
        bookingUrl: config.bookingUrl,
      }),
    );
  }

  return requested;
}

/**
 * Initialise every requested notifier, keeping the ones that come up.
 * @param config - Notification configuration
 * @throws Error if no channel is requested or none initialise successfully
 */
export async function initNotifiers(config: NotifiersConfig): Promise<void> {
  const requested = buildRequestedNotifiers(config);

  if (requested.length === 0) {
    throw new Error(
      'No notification channels configured. Set WHATSAPP_GROUP_ID and/or ' +
        'TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID.',
    );
  }

  console.log(
    `Initialising ${requested.length} notification channel(s): ` +
      requested.map((n) => n.name).join(', '),
  );

  const results = await Promise.allSettled(
    requested.map(async (notifier) => {
      await notifier.init();
      return notifier;
    }),
  );

  activeNotifiers = [];
  results.forEach((result, index) => {
    const notifier = requested[index];
    if (result.status === 'fulfilled') {
      activeNotifiers.push(notifier);
    } else {
      console.error(
        `Failed to initialise ${notifier.name} channel:`,
        result.reason,
      );
    }
  });

  if (activeNotifiers.length === 0) {
    throw new Error('All notification channels failed to initialise.');
  }

  console.log(
    `Active notification channel(s): ` +
      activeNotifiers.map((n) => n.name).join(', '),
  );
}

/**
 * Run an action against every active notifier, best-effort.
 * Each channel's failure is logged but does not affect the others.
 * @param action - Description used in logs
 * @param fn - The per-notifier operation to run
 */
async function broadcast(
  action: string,
  fn: (notifier: Notifier) => Promise<void>,
): Promise<void> {
  await Promise.all(
    activeNotifiers.map(async (notifier) => {
      try {
        await fn(notifier);
      } catch (error) {
        console.error(`[${notifier.name}] Failed to ${action}:`, error);
      }
    }),
  );
}

/**
 * Broadcast cancellation notifications to all active channels.
 * @param appointments - Cancelled appointments
 * @param combineMessages - Send as one combined message (true) or individually
 */
export async function broadcastCancellations(
  appointments: Appointment[],
  combineMessages: boolean = true,
): Promise<void> {
  await broadcast('send cancellation notifications', (notifier) =>
    notifier.sendMultipleCancellationNotifications(
      appointments,
      combineMessages,
    ),
  );
}

/**
 * Broadcast reschedule notifications to all active channels.
 * @param rescheduled - Rescheduled appointments that free a gap
 * @param combineMessages - Send as one combined message (true) or individually
 */
export async function broadcastReschedules(
  rescheduled: RescheduledAppointment[],
  combineMessages: boolean = true,
): Promise<void> {
  await broadcast('send reschedule notifications', (notifier) =>
    notifier.sendMultipleRescheduleNotifications(rescheduled, combineMessages),
  );
}

/**
 * Send a test message on every active channel, best-effort.
 */
export async function testNotifiers(): Promise<void> {
  await broadcast('send test message', (notifier) =>
    notifier.testConnection(),
  );
}

/**
 * Tear down every active notifier.
 */
export async function destroyNotifiers(): Promise<void> {
  await Promise.all(
    activeNotifiers.map(async (notifier) => {
      try {
        await notifier.destroy();
      } catch (error) {
        console.error(`[${notifier.name}] Error during destroy:`, error);
      }
    }),
  );
  activeNotifiers = [];
}
