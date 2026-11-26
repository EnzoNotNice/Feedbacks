import { env } from '../src/config/env.js';
import { emojiService } from '../src/services/emojiService.js';
import { logger } from '../src/utils/logger.js';

async function main(): Promise<void> {
  if (!env.token || !env.clientId) {
    logger.error('ENV', 'DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const count = await emojiService.syncViaRest(env.token, env.clientId, force);
  logger.success('EMOJI_SYNC', `Synced ${count} application emojis to Discord Developer Portal`);
}

main().catch((err) => {
  logger.error('EMOJI_SYNC', 'Failed to sync emojis', err);
  process.exit(1);
});
