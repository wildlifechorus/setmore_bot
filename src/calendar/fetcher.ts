/**
 * Calendar fetcher module
 * Handles fetching and parsing iCal feeds from Setmore
 */

import fetch from 'node-fetch';
import * as ical from 'node-ical';
import { Appointment, CalendarEvent } from './types';

/**
 * Fetch configuration options
 */
interface FetchOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
}

/**
 * Fetch the iCal feed from the calendar URL
 * @param calendarUrl - URL to the iCal feed
 * @param options - Fetch options including retry configuration
 * @returns Raw iCal data as string
 * @throws Error if fetch fails after all retries
 */
async function fetchCalendarData(
  calendarUrl: string,
  options: FetchOptions = {},
): Promise<string> {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching calendar (attempt ${attempt}/${maxRetries})...`);

      const response = await fetch(calendarUrl, {
        headers: {
          'User-Agent': 'Apple Calendar',
          Accept: 'text/calendar',
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.text();
      console.log(`Calendar data fetched successfully (${data.length} bytes)`);
      return data;
    } catch (error) {
      lastError = error as Error;
      console.error(`Fetch attempt ${attempt} failed:`, error);

      // If not the last attempt, wait before retrying with exponential backoff
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to fetch calendar after ${maxRetries} attempts: ${lastError?.message}`,
  );
}

/**
 * Parse iCal data into appointment objects
 * @param icalData - Raw iCal data string
 * @returns Array of appointments
 */
function parseCalendarData(icalData: string): Appointment[] {
  const appointments: Appointment[] = [];
  const now = Date.now();

  try {
    // Parse the iCal data
    const events = ical.sync.parseICS(icalData);

    // Process each event
    for (const key in events) {
      const event = events[key] as CalendarEvent;

      // Only process VEVENT type entries with required fields
      if (
        event.type !== 'VEVENT' ||
        !event.uid ||
        !event.start ||
        !event.end
      ) {
        continue;
      }

      // Convert to Appointment object
      const appointment: Appointment = {
        id: event.uid,
        startTime: event.start.getTime(),
        endTime: event.end.getTime(),
        summary: event.summary || null,
        description: event.description || null,
        status: 'active',
        lastSeen: now,
        createdAt: now,
      };

      appointments.push(appointment);
    }

    console.log(`Parsed ${appointments.length} appointments from calendar`);
    return appointments;
  } catch (error) {
    console.error('Error parsing calendar data:', error);
    throw new Error(`Failed to parse calendar data: ${(error as Error).message}`);
  }
}

/**
 * Fetch and parse the calendar feed
 * @param calendarUrl - URL to the iCal feed
 * @param options - Fetch options including retry configuration
 * @returns Array of appointments from the calendar
 */
export async function fetchAndParseCalendar(
  calendarUrl: string,
  options: FetchOptions = {},
): Promise<Appointment[]> {
  try {
    // Fetch the calendar data
    const icalData = await fetchCalendarData(calendarUrl, options);

    // Parse into appointments
    const appointments = parseCalendarData(icalData);

    return appointments;
  } catch (error) {
    console.error('Error fetching and parsing calendar:', error);
    throw error;
  }
}

/**
 * Get only future appointments (start time is in the future)
 * @param appointments - Array of appointments to filter
 * @returns Array of future appointments
 */
export function filterFutureAppointments(
  appointments: Appointment[],
): Appointment[] {
  const now = Date.now();
  return appointments.filter((apt) => apt.startTime > now);
}
