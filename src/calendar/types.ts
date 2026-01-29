/**
 * Appointment data structure
 * Represents a single appointment from the Setmore calendar
 */
export interface Appointment {
  /** Unique identifier for the appointment (from iCal UID) */
  id: string;
  /** Start time as Unix timestamp (milliseconds) */
  startTime: number;
  /** End time as Unix timestamp (milliseconds) */
  endTime: number;
  /** Summary/title of the appointment */
  summary: string | null;
  /** Description/details of the appointment */
  description: string | null;
  /** Status: 'active' or 'cancelled' */
  status: 'active' | 'cancelled';
  /** Last time this appointment was seen in the feed (Unix timestamp) */
  lastSeen: number;
  /** When this record was first created (Unix timestamp) */
  createdAt: number;
}

/**
 * Raw calendar event from node-ical
 */
export interface CalendarEvent {
  type: string;
  uid?: string;
  start?: Date;
  end?: Date;
  summary?: string;
  description?: string;
}
