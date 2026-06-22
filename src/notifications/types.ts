/**
 * Notifier abstraction
 *
 * A Notifier represents a single outbound channel (WhatsApp, Telegram, ...).
 * The scheduler talks only to the notification registry, which fans calls out
 * to every active Notifier, so adding or removing a channel never touches the
 * monitoring logic.
 */

import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';

/**
 * A single outbound notification channel.
 *
 * Implementations are expected to be self-contained: they own their client,
 * formatting, and any rate-limiting.  All methods reject on failure so the
 * registry can apply best-effort handling per channel.
 */
export interface Notifier {
  /** Human-readable channel name, used in logs (e.g. 'WhatsApp'). */
  readonly name: string;

  /**
   * Establish the channel connection and validate credentials.
   * Resolves only when the channel is ready to send.
   */
  init(): Promise<void>;

  /**
   * Send notifications for one or more cancelled appointments.
   * @param appointments - Cancelled appointments to announce
   * @param combineMessages - Send as one combined message (true) or individually
   */
  sendMultipleCancellationNotifications(
    appointments: Appointment[],
    combineMessages?: boolean,
  ): Promise<void>;

  /**
   * Send notifications for one or more reschedules that free a gap.
   * @param rescheduled - Rescheduled appointments to announce
   * @param combineMessages - Send as one combined message (true) or individually
   */
  sendMultipleRescheduleNotifications(
    rescheduled: RescheduledAppointment[],
    combineMessages?: boolean,
  ): Promise<void>;

  /**
   * Send a one-off test message to verify the channel is wired up correctly.
   */
  testConnection(): Promise<void>;

  /**
   * Tear down the channel connection and release resources.
   */
  destroy(): Promise<void>;
}
