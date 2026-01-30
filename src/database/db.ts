/**
 * Database module for managing appointment storage
 * Uses SQLite with better-sqlite3 for synchronous operations
 */

import Database from 'better-sqlite3';
import { Appointment } from '../calendar/types';
import { INIT_DATABASE } from './schema';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Database connection instance
 */
let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables
 * @param dbPath - Path to the SQLite database file
 */
export function initDatabase(dbPath: string): void {
  // Ensure the directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Open database connection
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables and indexes
  INIT_DATABASE.forEach((sql) => {
    db?.exec(sql);
  });

  console.log(`Database initialized at: ${dbPath}`);
}

/**
 * Get the database instance
 * @throws Error if database is not initialized
 */
function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Insert a new appointment into the database
 * @param appointment - Appointment to insert
 */
export function insertAppointment(appointment: Appointment): void {
  const stmt = getDb().prepare(`
    INSERT INTO appointments (id, start_time, end_time, summary, description, status, last_seen, created_at)
    VALUES (@id, @startTime, @endTime, @summary, @description, @status, @lastSeen, @createdAt)
  `);

  stmt.run({
    id: appointment.id,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    summary: appointment.summary,
    description: appointment.description,
    status: appointment.status,
    lastSeen: appointment.lastSeen,
    createdAt: appointment.createdAt,
  });
}

/**
 * Update the last_seen timestamp for an existing appointment
 * @param id - Appointment ID
 * @param lastSeen - New last_seen timestamp
 */
export function updateLastSeen(id: string, lastSeen: number): void {
  const stmt = getDb().prepare(`
    UPDATE appointments
    SET last_seen = ?
    WHERE id = ?
  `);

  stmt.run(lastSeen, id);
}

/**
 * Update appointment times when rescheduled
 * @param id - Appointment ID
 * @param startTime - New start time
 * @param endTime - New end time
 * @param lastSeen - New last_seen timestamp
 */
export function updateAppointmentTimes(
  id: string,
  startTime: number,
  endTime: number,
  lastSeen: number,
): void {
  const stmt = getDb().prepare(`
    UPDATE appointments
    SET start_time = ?, end_time = ?, last_seen = ?
    WHERE id = ?
  `);

  stmt.run(startTime, endTime, lastSeen, id);
}

/**
 * Mark an appointment as cancelled
 * @param id - Appointment ID
 */
export function markAsCancelled(id: string): void {
  const stmt = getDb().prepare(`
    UPDATE appointments
    SET status = 'cancelled'
    WHERE id = ?
  `);

  stmt.run(id);
}

/**
 * Get all active appointments (not cancelled)
 * @returns Array of active appointments
 */
export function getActiveAppointments(): Appointment[] {
  const stmt = getDb().prepare(`
    SELECT 
      id,
      start_time as startTime,
      end_time as endTime,
      summary,
      description,
      status,
      last_seen as lastSeen,
      created_at as createdAt
    FROM appointments
    WHERE status = 'active'
    ORDER BY start_time ASC
  `);

  return stmt.all() as Appointment[];
}

/**
 * Get all future active appointments (start time is after current time)
 * @returns Array of future active appointments
 */
export function getFutureActiveAppointments(): Appointment[] {
  const now = Date.now();
  const stmt = getDb().prepare(`
    SELECT 
      id,
      start_time as startTime,
      end_time as endTime,
      summary,
      description,
      status,
      last_seen as lastSeen,
      created_at as createdAt
    FROM appointments
    WHERE status = 'active' AND start_time > ?
    ORDER BY start_time ASC
  `);

  return stmt.all(now) as Appointment[];
}

/**
 * Get an appointment by ID
 * @param id - Appointment ID
 * @returns Appointment or undefined if not found
 */
export function getAppointmentById(id: string): Appointment | undefined {
  const stmt = getDb().prepare(`
    SELECT 
      id,
      start_time as startTime,
      end_time as endTime,
      summary,
      description,
      status,
      last_seen as lastSeen,
      created_at as createdAt
    FROM appointments
    WHERE id = ?
  `);

  return stmt.get(id) as Appointment | undefined;
}

/**
 * Delete old cancelled appointments (older than specified days)
 * @param daysOld - Delete cancelled appointments older than this many days
 * @returns Number of deleted records
 */
export function cleanupOldCancelledAppointments(daysOld: number = 30): number {
  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const stmt = getDb().prepare(`
    DELETE FROM appointments
    WHERE status = 'cancelled' AND created_at < ?
  `);

  const result = stmt.run(cutoffTime);
  return result.changes;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}
