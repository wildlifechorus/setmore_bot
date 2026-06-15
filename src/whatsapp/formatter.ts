/**
 * WhatsApp message formatter
 * Formats appointment cancellations and reschedules into user-friendly messages.
 * Uses WhatsApp text markup: *bold*, _italic_, ~strikethrough~.
 */

import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';

/**
 * Format a date with timezone awareness.
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted date string, e.g. "Monday, January 29, 2026"
 */
function formatDate(
  timestamp: number,
  timezone: string = 'Europe/Lisbon',
): string {
  const date = new Date(timestamp);

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Format a time with timezone awareness.
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted time string, e.g. "14:30"
 */
function formatTime(
  timestamp: number,
  timezone: string = 'Europe/Lisbon',
): string {
  const date = new Date(timestamp);

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}

/**
 * Format a time range from two timestamps.
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted range string, e.g. "14:30 - 16:00"
 */
function formatTimeRange(
  startTime: number,
  endTime: number,
  timezone: string = 'Europe/Lisbon',
): string {
  return `${formatTime(startTime, timezone)} - ${formatTime(endTime, timezone)}`;
}

/**
 * Format a single cancelled appointment into a WhatsApp message.
 * @param appointment - The cancelled appointment
 * @param bookingUrl - URL to the booking page
 * @returns Formatted WhatsApp message string
 */
export function formatCancellationMessage(
  appointment: Appointment,
  bookingUrl: string,
): string {
  const date = formatDate(appointment.startTime);
  const timeRange = formatTimeRange(appointment.startTime, appointment.endTime);

  let message = '🎉 *New Slot Available!*\n\n';
  message += `📅 *Date:* ${date}\n`;
  message += `🕐 *Time:* ${timeRange} (Lisbon time)\n`;
  message += `\nBook now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot';

  return message;
}

/**
 * Format multiple cancelled appointments into a single WhatsApp message.
 * Falls through to the single-message formatter when only one appointment.
 * @param appointments - Array of cancelled appointments
 * @param bookingUrl - URL to the booking page
 * @returns Formatted WhatsApp message string
 */
export function formatMultipleCancellations(
  appointments: Appointment[],
  bookingUrl: string,
): string {
  if (appointments.length === 0) {
    return '';
  }

  if (appointments.length === 1) {
    return formatCancellationMessage(appointments[0], bookingUrl);
  }

  let message = `🎉 *${appointments.length} New Slots Available!*\n\n`;

  const sortedApts = [...appointments].sort(
    (a, b) => a.startTime - b.startTime,
  );

  for (let i = 0; i < sortedApts.length; i++) {
    const apt = sortedApts[i];
    const date = formatDate(apt.startTime);
    const timeRange = formatTimeRange(apt.startTime, apt.endTime);

    message += `${i + 1}. *${date}*\n`;
    message += `   🕐 ${timeRange}\n\n`;
  }

  message += `Book now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot';

  return message;
}

/**
 * Format a rescheduled appointment that creates a notify-worthy gap.
 * @param rescheduled - Includes gapStartTime / gapEndTime for the freed window
 * @param bookingUrl - URL to the booking page
 * @returns Formatted WhatsApp message string
 */
export function formatRescheduleMessage(
  rescheduled: RescheduledAppointment,
  bookingUrl: string,
): string {
  const date = formatDate(rescheduled.gapStartTime);
  const timeRange = formatTimeRange(
    rescheduled.gapStartTime,
    rescheduled.gapEndTime,
  );

  let message = '🎉 *New Slot Available!*\n\n';
  message += `📅 *Date:* ${date}\n`;
  message += `🕐 *Time:* ${timeRange} (Lisbon time)\n`;
  message += `\nBook now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot #Reschedule';

  return message;
}

/**
 * Format multiple rescheduled appointments into a single WhatsApp message.
 * Falls through to the single-message formatter when only one item.
 * @param rescheduled - Array of rescheduled appointments
 * @param bookingUrl - URL to the booking page
 * @returns Formatted WhatsApp message string
 */
export function formatMultipleReschedules(
  rescheduled: RescheduledAppointment[],
  bookingUrl: string,
): string {
  if (rescheduled.length === 0) {
    return '';
  }

  if (rescheduled.length === 1) {
    return formatRescheduleMessage(rescheduled[0], bookingUrl);
  }

  let message = `🎉 *${rescheduled.length} New Slots Available!*\n\n`;

  const sorted = [...rescheduled].sort(
    (a, b) => a.gapStartTime - b.gapStartTime,
  );

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const date = formatDate(item.gapStartTime);
    const timeRange = formatTimeRange(item.gapStartTime, item.gapEndTime);

    message += `${i + 1}. *${date}*\n`;
    message += `   🕐 ${timeRange}\n\n`;
  }

  message += `Book now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot #Reschedule';

  return message;
}
