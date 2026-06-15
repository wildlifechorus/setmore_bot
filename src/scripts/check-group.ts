/**
 * check-group — diagnostic script
 *
 * Connects to WhatsApp, finds the configured group, and reports:
 *  - Whether the bot can see the group
 *  - The bot's own participant status (admin / not admin)
 *  - Current group send-message permissions
 *  - All participants
 *
 * Usage:
 *   yarn check-group
 */

import * as dotenv from 'dotenv';
import { Client, LocalAuth, GroupChat } from 'whatsapp-web.js';

dotenv.config();

const GROUP_ID = process.env.WHATSAPP_GROUP_ID;
const SESSION_PATH = process.env.WHATSAPP_SESSION_PATH || './data/wwebjs_auth';

if (!GROUP_ID) {
  console.error('❌ WHATSAPP_GROUP_ID is not set in .env');
  process.exit(1);
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

client.on('authenticated', () => console.log('✅ Authenticated'));

client.on('loading_screen', (percent: number) => {
  process.stdout.write(`\r   Loading: ${percent}%   `);
});

client.on('ready', async () => {
  process.stdout.write('\n');
  console.log('✅ Client ready\n');

  try {
    const chat = await client.getChatById(GROUP_ID!);

    if (!chat) {
      console.error(`❌ Group not found: ${GROUP_ID}`);
      console.error('   The bot phone may not be a member of this group.');
      await client.destroy();
      process.exit(1);
    }

    const group = chat as GroupChat;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = group as any;

    console.log('Group found:');
    console.log(`  Name           : ${group.name}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`  ID             : ${(group.id as any)._serialized}`);
    console.log(`  Participants   : ${group.participants?.length ?? 'unknown'}`);

    // Who is the bot?
    const botInfo = client.info;
    const botNumber = botInfo?.wid?._serialized;
    console.log(`\nBot phone number : ${botNumber ?? 'unknown'}`);

    if (group.participants && botNumber) {
      const botParticipant = group.participants.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => (p.id?._serialized ?? p.id) === botNumber,
      );

      if (!botParticipant) {
        console.log('\n⚠️  Bot is NOT listed as a participant in this group.');
        console.log(
          '   Add the bot phone to the group from another phone, then re-run.',
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isAdmin = (botParticipant as any).isAdmin || (botParticipant as any).isSuperAdmin;
        console.log(
          `\nBot participant status : ${isAdmin ? '✅ Admin' : '⚠️  NOT admin'}`,
        );
        if (!isAdmin) {
          console.log(
            '   The bot must be an admin to post when "Only admins can send" is on.',
          );
          console.log(
            '   Fix: open the group on your personal phone → group info → promote the bot to admin.',
          );
        }
      }
    }

    // Check announce (only-admins) mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isAnnounce = info.groupMetadata?.announce ?? info.announce ?? null;
    if (isAnnounce !== null) {
      console.log(
        `\nOnly-admins send mode : ${isAnnounce ? '🔒 ON (only admins can post)' : '🔓 OFF (all members can post)'}`,
      );
    }

    console.log('\n── All participants ──────────────────────────────────────');
    if (group.participants) {
      for (const p of group.participants) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pid = (p as any).id?._serialized ?? p.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const admin = (p as any).isAdmin || (p as any).isSuperAdmin ? ' [admin]' : '';
        console.log(`  ${pid}${admin}`);
      }
    }
    console.log('─'.repeat(60) + '\n');
  } catch (error) {
    console.error('Error checking group:', error);
  } finally {
    await client.destroy();
    process.exit(0);
  }
});

client.on('auth_failure', async (msg: string) => {
  console.error('Auth failed:', msg);
  process.exit(1);
});

console.log('Connecting...');
client.initialize().catch((error: unknown) => {
  console.error('Init error:', error);
  process.exit(1);
});
