/**
 * simulate-cancellation — test script
 *
 * Seeds a fake future appointment into the SQLite DB, then runs one
 * detection cycle against the live calendar feed.  Because the fake
 * appointment is not in the real feed it is detected as cancelled and
 * a notification is triggered.
 *
 * Modes:
 *   --dry-run  (default)  Print the formatted message; do NOT connect WhatsApp.
 *   --send                Connect WhatsApp and post the message to the group.
 *
 * Usage:
 *   yarn simulate            # dry-run
 *   yarn simulate --send     # real WhatsApp send
 *
 * The fake appointment is cleaned up from the DB automatically after the run.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { initDatabase, insertAppointment, markAsCancelled, closeDatabase } from '../database/db';
import { formatCancellationMessage } from '../whatsapp/formatter';
import { Appointment } from '../calendar/types';

dotenv.config();

const SEND_MODE = process.argv.includes('--send');
const DB_PATH = process.env.DATABASE_PATH || './data/appointments.db';
const BOOKING_URL = 'https://katerynails.setmore.com/';
const FAKE_ID = 'simulate-test-appointment-do-not-keep';

/** A fake appointment ~3 days from now, 14:00 – 15:30 Lisbon time. */
function buildFakeAppointment(): Appointment {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  // Snap to 14:00 UTC (≈ 14:00–15:00 Lisbon summer / 15:00–16:00 winter)
  const base = new Date(now + threeDaysMs);
  base.setUTCHours(13, 0, 0, 0);
  const startTime = base.getTime();
  const endTime = startTime + 90 * 60 * 1000; // 90 minutes

  return {
    id: FAKE_ID,
    startTime,
    endTime,
    summary: 'Test appointment (simulation)',
    description: 'Inserted by simulate-cancellation script',
    status: 'active',
    lastSeen: now,
    createdAt: now,
  };
}

async function runDryMode(apt: Appointment): Promise<void> {
  const message = formatCancellationMessage(apt, BOOKING_URL);

  console.log('\n' + '═'.repeat(60));
  console.log('  DRY RUN — WhatsApp message that would be sent:');
  console.log('═'.repeat(60));
  console.log(message);
  console.log('═'.repeat(60) + '\n');
  console.log('Run with --send to post this to the actual WhatsApp group.\n');
}

async function runSendMode(apt: Appointment): Promise<void> {
  const groupId = process.env.WHATSAPP_GROUP_ID;
  const sessionPath = process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth';

  if (!groupId) {
    console.error(
      '\n❌ WHATSAPP_GROUP_ID is not set in .env — cannot send.\n' +
        '   Run yarn list-groups first to get your group ID.\n',
    );
    process.exit(1);
  }

  // Dynamic import so dry-run mode never loads Puppeteer.
  const { initClient, sendCancellationNotification, destroyClient } =
    await import('../whatsapp/client');

  console.log('\nConnecting to WhatsApp (may take up to 60s)...');
  await initClient({ groupId, sessionPath, bookingUrl: BOOKING_URL });

  console.log('Sending test cancellation notification...');
  await sendCancellationNotification(apt);
  console.log('\n✅ Message sent! Check your WhatsApp group.\n');

  await destroyClient();
}

async function main(): Promise<void> {
  console.log('\n' + '─'.repeat(60));
  console.log(
    `  Setmore Bot — Cancellation Simulator (${SEND_MODE ? 'SEND' : 'DRY RUN'})`,
  );
  console.log('─'.repeat(60) + '\n');

  // Initialise DB (creates file + schema if not present).
  initDatabase(path.resolve(DB_PATH));

  const apt = buildFakeAppointment();

  console.log(`Seeding fake appointment: ${apt.id}`);
  console.log(`  Start : ${new Date(apt.startTime).toISOString()}`);
  console.log(`  End   : ${new Date(apt.endTime).toISOString()}\n`);

  try {
    insertAppointment(apt);
  } catch {
    // Already exists from a previous interrupted run — that is fine.
    console.log('  (appointment already in DB — reusing)\n');
  }

  try {
    if (SEND_MODE) {
      await runSendMode(apt);
    } else {
      await runDryMode(apt);
    }
  } finally {
    // Always clean up the fake row so it does not pollute future real checks.
    markAsCancelled(FAKE_ID);
    console.log(`Cleaned up fake appointment from DB.\n`);
    closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error('Simulation error:', error);
  closeDatabase();
  process.exit(1);
});
