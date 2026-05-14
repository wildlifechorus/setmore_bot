/**
 * Cancellation detection module
 * Compares current calendar state with database to detect cancellations
 */

import { Appointment } from '../calendar/types';
import {
  getActiveAppointments,
  getFutureActiveAppointments,
  insertAppointment,
  updateLastSeen,
  markAsCancelled,
  updateAppointmentTimes,
} from '../database/db';
import {
  freedSegmentsAfterReschedule,
  getLongestFreedSegment,
} from './intervals';

/**
 * Represents a rescheduled appointment that frees a contiguous block
 * of the previous slot large enough to notify about.
 */
export interface RescheduledAppointment {
  /** The appointment with its NEW time */
  appointment: Appointment;
  /** Previous booking start (Unix ms); useful for logs */
  originalStartTime: number;
  /** Previous booking end (Unix ms); useful for logs */
  originalEndTime: number;
  /** Start of the freed window shown to clients (Unix ms) */
  gapStartTime: number;
  /** End of the freed window shown to clients (Unix ms) */
  gapEndTime: number;
  /** Duration of gapStartTime–gapEndTime in whole minutes */
  gapDurationMinutes: number;
}

/**
 * Result of a cancellation check
 */
export interface CancellationCheckResult {
  /** Newly cancelled appointments detected */
  cancelled: Appointment[];
  /** New appointments added */
  added: Appointment[];
  /** Reschedules where a contiguous freed slice of the old slot is >= 1.5h */
  rescheduledWithGaps: RescheduledAppointment[];
  /** Existing appointments updated */
  updated: number;
}

/**
 * Detect cancellations and reschedules by comparing current appointments with database
 *
 * Algorithm:
 * 1. Get all future active appointments from database
 * 2. Get all current appointments from calendar feed
 * 3. Compare UIDs:
 *    - In DB but NOT in current = Cancelled
 *    - In current but NOT in DB = New appointment
 *    - In both = Existing appointment
 *      - If times changed: compute time in the OLD slot not covered by the
 *        NEW slot; if the longest contiguous freed piece is >= 1.5 hours,
 *        treat as rescheduled-with-gap (else only update times / last_seen)
 *      - If times unchanged = Update last_seen
 *
 * @param currentAppointments - Current appointments from calendar feed
 * @returns Result containing cancelled, added, rescheduled, and updated appointments
 */
export function detectCancellations(
  currentAppointments: Appointment[],
): CancellationCheckResult {
  const now = Date.now();
  const MIN_GAP_MINUTES = 90; // 1.5 hours
  const MIN_GAP_MS = MIN_GAP_MINUTES * 60 * 1000;

  // Future-only: used to detect cancellations (no longer in feed).
  const dbFutureAppointments = getFutureActiveAppointments();
  // All active rows: membership for "new vs existing" must include rows whose
  // start_time is already in the past; otherwise the same UID can reappear in
  // the feed with updated times and we would INSERT again (PRIMARY KEY error).
  const dbMap = new Map(getActiveAppointments().map((apt) => [apt.id, apt]));

  const currentIds = new Set(currentAppointments.map((apt) => apt.id));

  // Find cancelled appointments (in DB but not in current feed)
  const cancelledAppointments: Appointment[] = [];
  for (const dbApt of dbFutureAppointments) {
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
    if (!dbMap.has(currentApt.id)) {
      // This is a new appointment
      insertAppointment(currentApt);
      newAppointments.push(currentApt);
      console.log(
        `New appointment added: ${currentApt.id} - ${currentApt.summary || 'Untitled'}`,
      );
    }
  }

  // Check existing appointments for reschedules and updates
  const rescheduledWithGaps: RescheduledAppointment[] = [];
  let updatedCount = 0;

  for (const currentApt of currentAppointments) {
    const dbApt = dbMap.get(currentApt.id);

    if (dbApt) {
      // Check if the appointment times have changed (reschedule)
      const timesChanged =
        currentApt.startTime !== dbApt.startTime ||
        currentApt.endTime !== dbApt.endTime;

      if (timesChanged) {
        const freedSegments = freedSegmentsAfterReschedule(
          dbApt.startTime,
          dbApt.endTime,
          currentApt.startTime,
          currentApt.endTime,
        );
        const longestFreed = getLongestFreedSegment(freedSegments);
        const longestMs = longestFreed
          ? longestFreed.end - longestFreed.start
          : 0;

        if (longestFreed && longestMs >= MIN_GAP_MS) {
          const gapDurationMinutes = Math.round(longestMs / (60 * 1000));
          rescheduledWithGaps.push({
            appointment: currentApt,
            originalStartTime: dbApt.startTime,
            originalEndTime: dbApt.endTime,
            gapStartTime: longestFreed.start,
            gapEndTime: longestFreed.end,
            gapDurationMinutes,
          });

          console.log(
            `Detected reschedule creating gap: ${currentApt.id} - ${currentApt.summary || 'Untitled'} ` +
              `(${gapDurationMinutes} min contiguous freed in old slot)`,
          );
        }

        // Update the appointment times in the database
        updateAppointmentTimes(
          currentApt.id,
          currentApt.startTime,
          currentApt.endTime,
          now,
        );
        updatedCount++;
      } else {
        // Times haven't changed, just update the last_seen timestamp
        updateLastSeen(currentApt.id, now);
        updatedCount++;
      }
    }
  }

  console.log(
    `Check complete: ${cancelledAppointments.length} cancelled, ` +
      `${newAppointments.length} new, ${rescheduledWithGaps.length} rescheduled with gaps, ` +
      `${updatedCount} updated`,
  );

  return {
    cancelled: cancelledAppointments,
    added: newAppointments,
    rescheduledWithGaps,
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
