/**
 * Telegram message formatter
 * Formats appointment cancellations and reschedules into user-friendly messages
 */

import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';

/**
 * Format a date with timezone awareness
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted date string
 */
function formatDate(
  timestamp: number,
  timezone: string = 'Europe/Lisbon',
): string {
  const date = new Date(timestamp);

  // Format: "Monday, January 29, 2026"
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  return dateStr;
}

/**
 * Format a time with timezone awareness
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted time string (HH:MM)
 */
function formatTime(
  timestamp: number,
  timezone: string = 'Europe/Lisbon',
): string {
  const date = new Date(timestamp);

  // Format: "14:30"
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  });

  return timeStr;
}

/**
 * Format a time range
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @param timezone - IANA timezone identifier (default: Europe/Lisbon)
 * @returns Formatted time range string (e.g., "14:30 - 16:00")
 */
function formatTimeRange(
  startTime: number,
  endTime: number,
  timezone: string = 'Europe/Lisbon',
): string {
  const start = formatTime(startTime, timezone);
  const end = formatTime(endTime, timezone);
  return `${start} - ${end}`;
}

/**
 * Format a cancelled appointment into a Telegram message
 * @param appointment - The cancelled appointment
 * @param bookingUrl - URL to the booking page
 * @returns Formatted Telegram message
 */
export function formatCancellationMessage(
  appointment: Appointment,
  bookingUrl: string,
): string {
  const date = formatDate(appointment.startTime);
  const timeRange = formatTimeRange(appointment.startTime, appointment.endTime);

  let message = '🎉 New Slot Available!\n\n';
  message += `📅 Date: ${date}\n`;
  message += `🕐 Time: ${timeRange} (Lisbon time)\n`;
  message += `\nBook now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot';

  return message;
}

/**
 * Format multiple cancelled appointments into a single message
 * @param appointments - Array of cancelled appointments
 * @param bookingUrl - URL to the booking page
 * @returns Formatted Telegram message
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

  // Multiple cancellations
  let message = `🎉 ${appointments.length} New Slots Available!\n\n`;

  // Sort by start time
  const sortedApts = [...appointments].sort(
    (a, b) => a.startTime - b.startTime,
  );

  for (let i = 0; i < sortedApts.length; i++) {
    const apt = sortedApts[i];
    const date = formatDate(apt.startTime);
    const timeRange = formatTimeRange(apt.startTime, apt.endTime);

    message += `${i + 1}. ${date}\n`;
    message += `   🕐 ${timeRange}\n\n`;
  }

  message += `Book now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot';

  return message;
}

/**
 * Format a rescheduled appointment that creates a gap into a Telegram message
 * @param rescheduled - The rescheduled appointment info
 * @param bookingUrl - URL to the booking page
 * @returns Formatted Telegram message
 */
export function formatRescheduleMessage(
  rescheduled: RescheduledAppointment,
  bookingUrl: string,
): string {
  const date = formatDate(rescheduled.originalStartTime);
  const timeRange = formatTimeRange(
    rescheduled.originalStartTime,
    rescheduled.originalEndTime,
  );

  let message = '🎉 New Slot Available!\n\n';
  message += `📅 Date: ${date}\n`;
  message += `🕐 Time: ${timeRange} (Lisbon time)\n`;
  message += `\nBook now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot #Reschedule';

  return message;
}

/**
 * Format multiple rescheduled appointments into a single message
 * @param rescheduled - Array of rescheduled appointments
 * @param bookingUrl - URL to the booking page
 * @returns Formatted Telegram message
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

  // Multiple reschedules
  let message = `🎉 ${rescheduled.length} New Slots Available!\n\n`;

  // Sort by original start time
  const sorted = [...rescheduled].sort(
    (a, b) => a.originalStartTime - b.originalStartTime,
  );

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const date = formatDate(item.originalStartTime);
    const timeRange = formatTimeRange(
      item.originalStartTime,
      item.originalEndTime,
    );

    message += `${i + 1}. ${date}\n`;
    message += `   🕐 ${timeRange}\n\n`;
  }

  message += `Book now: ${bookingUrl}\n`;
  message += '\n#AvailableSlot #Reschedule';

  return message;
}
