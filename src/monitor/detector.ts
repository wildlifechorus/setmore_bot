/**
 * Cancellation detection module
 * Compares current calendar state with database to detect cancellations
 */

import { Appointment } from '../calendar/types';
import {
  getFutureActiveAppointments,
  insertAppointment,
  updateLastSeen,
  markAsCancelled,
} from '../database/db';

/**
 * Result of a cancellation check
 */
export interface CancellationCheckResult {
  /** Newly cancelled appointments detected */
  cancelled: Appointment[];
  /** New appointments added */
  added: Appointment[];
  /** Existing appointments updated */
  updated: number;
}

/**
 * Detect cancellations by comparing current appointments with database
 *
 * Algorithm:
 * 1. Get all future active appointments from database
 * 2. Get all current appointments from calendar feed
 * 3. Compare UIDs:
 *    - In DB but NOT in current = Cancelled
 *    - In current but NOT in DB = New appointment
 *    - In both = Existing appointment (update last_seen)
 *
 * @param currentAppointments - Current appointments from calendar feed
 * @returns Result containing cancelled, added, and updated appointments
 */
export function detectCancellations(
  currentAppointments: Appointment[],
): CancellationCheckResult {
  const now = Date.now();

  // Get all future active appointments from database
  const dbAppointments = getFutureActiveAppointments();

  // Create sets for quick lookup
  const currentIds = new Set(currentAppointments.map((apt) => apt.id));
  const dbIds = new Set(dbAppointments.map((apt) => apt.id));

  // Find cancelled appointments (in DB but not in current feed)
  const cancelledAppointments: Appointment[] = [];
  for (const dbApt of dbAppointments) {
    if (!currentIds.has(dbApt.id)) {
      // This appointment is no longer in the feed - it was cancelled
      markAsCancelled(dbApt.id);
      cancelledAppointments.push(dbApt);
      console.log(
        `Detected cancellation: ${dbApt.id} - ${dbApt.summary || 'Untitled'}`,
      );
    }
  }

  // Find new appointments (in current feed but not in DB)
  const newAppointments: Appointment[] = [];
  for (const currentApt of currentAppointments) {
    if (!dbIds.has(currentApt.id)) {
      // This is a new appointment
      insertAppointment(currentApt);
      newAppointments.push(currentApt);
      console.log(
        `New appointment added: ${currentApt.id} - ${currentApt.summary || 'Untitled'}`,
      );
    }
  }

  // Update existing appointments (in both DB and current feed)
  let updatedCount = 0;
  for (const currentApt of currentAppointments) {
    if (dbIds.has(currentApt.id)) {
      // Update the last_seen timestamp
      updateLastSeen(currentApt.id, now);
      updatedCount++;
    }
  }

  console.log(
    `Check complete: ${cancelledAppointments.length} cancelled, ${newAppointments.length} new, ${updatedCount} updated`,
  );

  return {
    cancelled: cancelledAppointments,
    added: newAppointments,
    updated: updatedCount,
  };
}

/**
 * Check if this is the first run (database is empty)
 * @returns true if database is empty (first run), false otherwise
 */
export function isFirstRun(): boolean {
  const appointments = getFutureActiveAppointments();
  return appointments.length === 0;
}

/**
 * Initialize the database with current appointments on first run
 * This prevents false positives for cancellations on the first run
 * @param appointments - Current appointments from calendar feed
 */
export function initializeAppointments(appointments: Appointment[]): void {
  console.log(
    `First run detected. Initializing database with ${appointments.length} appointments`,
  );

  for (const apt of appointments) {
    insertAppointment(apt);
  }

  console.log('Database initialized successfully');
}
