/**
 * Shared message formatter
 *
 * Builds the cancellation / reschedule message bodies once, parameterised by a
 * per-channel markup style.  WhatsApp uses `*bold*`; Telegram (HTML parse mode)
 * uses `<b>bold</b>`.  Keeping the structure here avoids duplicating the layout
 * across channels.
 */

import { Appointment } from '../calendar/types';
import { RescheduledAppointment } from '../monitor/detector';

/**
 * Per-channel markup adapter.
 */
export interface MarkupStyle {
  /** Wrap text so it renders bold in the target channel. */
  bold(text: string): string;
  /**
   * Escape any dynamic text that is interpolated into the message so it does
   * not break the channel's parse mode.  Plain-text channels can pass through.
   */
  escape(text: string): string;
}

/**
 * Escape the HTML special characters Telegram's HTML parse mode cares about.
 * @param text - Raw text to escape
 * @returns Escaped text safe for Telegram HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** WhatsApp markup: asterisks for bold, no escaping needed. */
export const whatsappStyle: MarkupStyle = {
  bold: (text) => `*${text}*`,
  escape: (text) => text,
};

/** Telegram markup: HTML bold tags with HTML escaping of dynamic content. */
export const telegramHtmlStyle: MarkupStyle = {
  bold: (text) => `<b>${text}</b>`,
  escape: escapeHtml,
};

/**
 * The set of message formatters bound to a single markup style.
 */
export interface MessageFormatter {
  formatCancellationMessage(
    appointment: Appointment,
    bookingUrl: string,
  ): string;
  formatMultipleCancellations(
    appointments: Appointment[],
    bookingUrl: string,
  ): string;
  formatRescheduleMessage(
    rescheduled: RescheduledAppointment,
    bookingUrl: string,
  ): string;
  formatMultipleReschedules(
    rescheduled: RescheduledAppointment[],
    bookingUrl: string,
  ): string;
}

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
 * Build a set of message formatters bound to the given markup style.
 * @param style - The per-channel markup adapter
 * @returns Formatter functions producing channel-ready message bodies
 */
export function createMessageFormatter(style: MarkupStyle): MessageFormatter {
  const { bold, escape } = style;

  function formatCancellationMessage(
    appointment: Appointment,
    bookingUrl: string,
  ): string {
    const date = escape(formatDate(appointment.startTime));
    const timeRange = escape(
      formatTimeRange(appointment.startTime, appointment.endTime),
    );

    let message = `🎉 ${bold('New Slot Available!')}\n\n`;
    message += `📅 ${bold('Date:')} ${date}\n`;
    message += `🕐 ${bold('Time:')} ${timeRange} (Lisbon time)\n`;
    message += `\nBook now: ${escape(bookingUrl)}\n`;
    message += '\n#AvailableSlot';

    return message;
  }

  function formatMultipleCancellations(
    appointments: Appointment[],
    bookingUrl: string,
  ): string {
    if (appointments.length === 0) {
      return '';
    }

    if (appointments.length === 1) {
      return formatCancellationMessage(appointments[0], bookingUrl);
    }

    let message = `🎉 ${bold(`${appointments.length} New Slots Available!`)}\n\n`;

    const sortedApts = [...appointments].sort(
      (a, b) => a.startTime - b.startTime,
    );

    for (let i = 0; i < sortedApts.length; i++) {
      const apt = sortedApts[i];
      const date = escape(formatDate(apt.startTime));
      const timeRange = escape(formatTimeRange(apt.startTime, apt.endTime));

      message += `${i + 1}. ${bold(date)}\n`;
      message += `   🕐 ${timeRange}\n\n`;
    }

    message += `Book now: ${escape(bookingUrl)}\n`;
    message += '\n#AvailableSlot';

    return message;
  }

  function formatRescheduleMessage(
    rescheduled: RescheduledAppointment,
    bookingUrl: string,
  ): string {
    const date = escape(formatDate(rescheduled.gapStartTime));
    const timeRange = escape(
      formatTimeRange(rescheduled.gapStartTime, rescheduled.gapEndTime),
    );

    let message = `🎉 ${bold('New Slot Available!')}\n\n`;
    message += `📅 ${bold('Date:')} ${date}\n`;
    message += `🕐 ${bold('Time:')} ${timeRange} (Lisbon time)\n`;
    message += `\nBook now: ${escape(bookingUrl)}\n`;
    message += '\n#AvailableSlot #Reschedule';

    return message;
  }

  function formatMultipleReschedules(
    rescheduled: RescheduledAppointment[],
    bookingUrl: string,
  ): string {
    if (rescheduled.length === 0) {
      return '';
    }

    if (rescheduled.length === 1) {
      return formatRescheduleMessage(rescheduled[0], bookingUrl);
    }

    let message = `🎉 ${bold(`${rescheduled.length} New Slots Available!`)}\n\n`;

    const sorted = [...rescheduled].sort(
      (a, b) => a.gapStartTime - b.gapStartTime,
    );

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const date = escape(formatDate(item.gapStartTime));
      const timeRange = escape(
        formatTimeRange(item.gapStartTime, item.gapEndTime),
      );

      message += `${i + 1}. ${bold(date)}\n`;
      message += `   🕐 ${timeRange}\n\n`;
    }

    message += `Book now: ${escape(bookingUrl)}\n`;
    message += '\n#AvailableSlot #Reschedule';

    return message;
  }

  return {
    formatCancellationMessage,
    formatMultipleCancellations,
    formatRescheduleMessage,
    formatMultipleReschedules,
  };
}
