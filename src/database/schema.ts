/**
 * SQL schema for the appointments database
 * This module contains the database schema definition
 */

/**
 * SQL statement to create the appointments table
 */
export const CREATE_APPOINTMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    summary TEXT,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled')),
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`;

/**
 * SQL statement to create index on start_time for faster queries
 */
export const CREATE_START_TIME_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_start_time ON appointments(start_time)
`;

/**
 * SQL statement to create index on status for faster queries
 */
export const CREATE_STATUS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_status ON appointments(status)
`;

/**
 * Initialize all database tables and indexes
 */
export const INIT_DATABASE = [
  CREATE_APPOINTMENTS_TABLE,
  CREATE_START_TIME_INDEX,
  CREATE_STATUS_INDEX,
];
