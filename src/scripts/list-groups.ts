/**
 * list-groups — one-shot helper script
 *
 * Prints every WhatsApp group the linked account is a member of,
 * along with the group ID (@g.us) needed for WHATSAPP_GROUP_ID in .env.
 *
 * Usage:
 *   yarn list-groups
 *
 * First run: a QR code appears in the terminal — scan it with WhatsApp
 * on the bot phone (WhatsApp → Linked Devices → Link a Device).
 * The session is then saved to ./data/wwebjs_auth and reused on future runs.
 */

import * as dotenv from 'dotenv';
import { Client, LocalAuth, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

dotenv.config();

const SESSION_PATH =
  process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth';

/** Max time to wait for the 'ready' event (ms). */
const READY_TIMEOUT_MS = 120_000;

/** Max time to wait for getChats() after ready (ms). */
const CHAT_FETCH_TIMEOUT_MS = 90_000;

async function destroyAndExit(code: number): Promise<never> {
  try {
    await client.destroy();
  } catch {
    // ignore
  }
  process.exit(code);
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

// ── Event listeners ─────────────────────────────────────────────────────────

client.on('qr', (qr: string) => {
  console.log('\n📱 Scan this QR code with WhatsApp on the bot phone:');
  console.log('   WhatsApp → Linked Devices → Link a Device\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ Authenticated — session saved to', SESSION_PATH);
  console.log('   Waiting for WhatsApp Web to finish loading...');
});

// Fires with a percentage while WhatsApp Web initialises.
client.on('loading_screen', (percent: number, message: string) => {
  process.stdout.write(`\r   Loading: ${percent}% — ${message}          `);
});

// ── Ready timeout ────────────────────────────────────────────────────────────

const readyTimeout = setTimeout(async () => {
  console.error(
    `\n\n⚠️  'ready' event never fired after ${READY_TIMEOUT_MS / 1000}s.`,
  );
  console.error(
    '   This usually means WhatsApp Web is taking very long to sync on first login.',
  );
  console.error('   Try:\n   1. Wait a minute and run yarn list-groups again.');
  console.error(
    '   2. If it keeps failing, delete data/wwebjs_auth and re-scan the QR.\n',
  );
  await destroyAndExit(1);
}, READY_TIMEOUT_MS);

// ── Ready ────────────────────────────────────────────────────────────────────

client.on('ready', () => {
  clearTimeout(readyTimeout);
  process.stdout.write('\n');
  console.log('\n✅ Client ready. Fetching groups (may take up to 60s)...\n');

  const chatTimeout = setTimeout(async () => {
    console.error(
      `\n⚠️  getChats() timed out after ${CHAT_FETCH_TIMEOUT_MS / 1000}s.`,
    );
    console.error('   Run yarn list-groups again — subsequent runs are faster.\n');
    await destroyAndExit(1);
  }, CHAT_FETCH_TIMEOUT_MS);

  client
    .getChats()
    .then((chats: Chat[]) => {
      clearTimeout(chatTimeout);

      // Identify groups by @g.us suffix, more reliable than isGroup flag.
      const groups = chats.filter(
        (chat) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (chat.id as any)._serialized?.endsWith('@g.us') || chat.isGroup,
      );

      if (groups.length === 0) {
        console.log(
          'No groups found. Make sure the bot phone is a member of at least one WhatsApp group.',
        );
      } else {
        console.log(`Found ${groups.length} group(s):\n`);
        console.log('─'.repeat(70));
        for (const group of groups) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = (group.id as any)._serialized ?? String(group.id);
          console.log(`Name : ${group.name}`);
          console.log(`ID   : ${id}`);
          console.log('─'.repeat(70));
        }
        console.log(
          '\nCopy the ID of your target group into WHATSAPP_GROUP_ID in .env\n',
        );
      }
    })
    .catch((error: unknown) => {
      clearTimeout(chatTimeout);
      console.error('Error fetching chats:', error);
    })
    .finally(async () => {
      await destroyAndExit(0);
    });
});

client.on('auth_failure', async (msg: string) => {
  clearTimeout(readyTimeout);
  console.error('\nAuthentication failed:', msg);
  await destroyAndExit(1);
});

client.on('disconnected', (reason: string) => {
  console.warn('\nClient disconnected:', reason);
});

// ── Start ────────────────────────────────────────────────────────────────────

console.log('Initialising WhatsApp client...');
client.initialize().catch(async (error: unknown) => {
  clearTimeout(readyTimeout);
  console.error('Failed to initialise client:', error);
  await destroyAndExit(1);
});
