/**
 * Scheduler module
 * Main monitoring loop that checks for cancellations at regular intervals
 */

import {
  dedupeAppointmentsById,
  fetchAndParseCalendar,
  filterFutureAppointments,
} from '../calendar/fetcher';
import {
  detectCancellations,
  isFirstRun,
  initializeAppointments,
} from './detector';
import {
  sendMultipleCancellationNotifications,
  sendMultipleRescheduleNotifications,
} from '../telegram/bot';

/**
 * Scheduler configuration
 */
interface SchedulerConfig {
  /** Calendar feed URL */
  calendarUrl: string;
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Maximum retry attempts for calendar fetch */
  maxRetries?: number;
}

/**
 * Scheduler state
 */
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
let checkCount = 0;

/**
 * Perform a single check for cancellations
 * @param calendarUrl - URL to the iCal feed
 * @param maxRetries - Maximum retry attempts
 */
async function performCheck(
  calendarUrl: string,
  maxRetries: number = 3,
): Promise<void> {
  checkCount++;
  console.log(
    `\n--- Check #${checkCount} started at ${new Date().toISOString()} ---`,
  );

  try {
    // Fetch and parse the calendar
    const allAppointments = await fetchAndParseCalendar(calendarUrl, {
      maxRetries,
    });

    // Filter to future only, then one row per iCal UID (recurrences share UID).
    const futureAppointments = dedupeAppointmentsById(
      filterFutureAppointments(allAppointments),
    );
    console.log(`Found ${futureAppointments.length} future appointments`);

    // Check if this is the first run
    if (isFirstRun()) {
      // Initialize database with current appointments
      initializeAppointments(futureAppointments);
      console.log('First run complete - no notifications sent');
      return;
    }

    // Detect cancellations and reschedules
    const result = detectCancellations(futureAppointments);

    // Send notifications for cancelled appointments
    if (result.cancelled.length > 0) {
      console.log(
        `Sending notifications for ${result.cancelled.length} cancellation(s)...`,
      );
      await sendMultipleCancellationNotifications(result.cancelled, true);
      console.log('Cancellation notifications sent successfully');
    }

    // Send notifications for reschedules that create gaps
    if (result.rescheduledWithGaps.length > 0) {
      console.log(
        `Sending notifications for ${result.rescheduledWithGaps.length} reschedule(s) creating gaps...`,
      );
      await sendMultipleRescheduleNotifications(
        result.rescheduledWithGaps,
        true,
      );
      console.log('Reschedule notifications sent successfully');
    }

    if (
      result.cancelled.length === 0 &&
      result.rescheduledWithGaps.length === 0
    ) {
      console.log('No cancellations or significant reschedules detected');
    }

    console.log(`--- Check #${checkCount} completed ---\n`);
  } catch (error) {
    console.error(`Error during check #${checkCount}:`, error);
    // Don't throw - let the scheduler continue
  }
}

/**
 * Start the monitoring scheduler
 * @param config - Scheduler configuration
 */
export function startScheduler(config: SchedulerConfig): void {
  if (isRunning) {
    console.log('Scheduler is already running');
    return;
  }

  const { calendarUrl, checkIntervalMs, maxRetries = 3 } = config;

  console.log('Starting scheduler...');
  console.log(`Calendar URL: ${calendarUrl}`);
  console.log(
    `Check interval: ${checkIntervalMs}ms (${checkIntervalMs / 1000}s)`,
  );

  isRunning = true;

  // Perform initial check immediately
  performCheck(calendarUrl, maxRetries).catch((error) => {
    console.error('Error in initial check:', error);
  });

  // Schedule regular checks
  intervalId = setInterval(() => {
    performCheck(calendarUrl, maxRetries).catch((error) => {
      console.error('Error in scheduled check:', error);
    });
  }, checkIntervalMs);

  console.log('Scheduler started successfully');
}

/**
 * Stop the monitoring scheduler
 */
export function stopScheduler(): void {
  if (!isRunning) {
    console.log('Scheduler is not running');
    return;
  }

  console.log('Stopping scheduler...');

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  isRunning = false;
  console.log('Scheduler stopped');
}

/**
 * Check if the scheduler is currently running
 * @returns true if scheduler is running, false otherwise
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}

/**
 * Get the current check count
 * @returns Number of checks performed
 */
export function getCheckCount(): number {
  return checkCount;
}
