import { Events, Message } from 'discord.js';
import { feedbackService } from '../services/feedbackService.js';
import { logger } from '../utils/logger.js';

export const messageEventName = Events.MessageCreate;

export async function onMessageCreate(message: Message): Promise<void> {
  try {
    await feedbackService.handleChannelMessage(message);
  } catch (err) {
    logger.error('MESSAGE', 'Failed to process channel feedback message', err);
  }
}
