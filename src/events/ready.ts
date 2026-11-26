import { ActivityType, Events } from 'discord.js';
import { env } from '../config/env.js';
import { emojiService } from '../services/emojiService.js';
import { FeedbackClient } from '../structures/FeedbackClient.js';
import { logger } from '../utils/logger.js';

export async function onClientReady(client: FeedbackClient): Promise<void> {
  if (!client.user) return;

  logger.success('READY', `Logged in as ${client.user.tag} (${client.user.id})`);
  logger.info('READY', `Connected to ${client.guilds.cache.size} guild(s)`);

  client.user.setPresence({
    status: 'online',
    activities: [
      {
        name: env.statusText,
        type: ActivityType.Custom,
      },
    ],
  });

  await emojiService.syncWithClient(client);
  await client.deployCommands();

  logger.success('READY', 'Feedback system initialized and ready');
}

export const readyEventName = Events.ClientReady;
