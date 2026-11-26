import { env } from './config/env.js';
import { closeDatabase, initDatabase } from './database/database.js';
import { feedbackAdminCommand } from './commands/admin/feedbackAdmin.js';
import { deleteFeedbackContext } from './commands/context/deleteFeedback.js';
import { replyFeedbackContext } from './commands/context/replyFeedback.js';
import { userReviewsContext } from './commands/context/userReviews.js';
import { feedbackCommand } from './commands/public/feedback.js';
import { helpCommand } from './commands/public/help.js';
import { reviewsCommand } from './commands/public/reviews.js';
import { interactionEventName, onInteractionCreate } from './events/interactionCreate.js';
import { messageEventName, onMessageCreate } from './events/messageCreate.js';
import { onClientReady, readyEventName } from './events/ready.js';
import { FeedbackClient } from './structures/FeedbackClient.js';
import { logger } from './utils/logger.js';

const client = new FeedbackClient();

client.registerSlashCommand(feedbackCommand);
client.registerSlashCommand(reviewsCommand);
client.registerSlashCommand(helpCommand);
client.registerSlashCommand(feedbackAdminCommand);

client.registerContextCommand(replyFeedbackContext);
client.registerContextCommand(deleteFeedbackContext);
client.registerContextCommand(userReviewsContext);

client.once(readyEventName, () => {
  void onClientReady(client);
});

client.on(interactionEventName, (interaction) => {
  void onInteractionCreate(client, interaction);
});

client.on(messageEventName, (message) => {
  void onMessageCreate(message);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('BOOT', `Received ${signal}, shutting down cleanly`);
  closeDatabase();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('PROCESS', 'Unhandled promise rejection', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('PROCESS', 'Uncaught exception', err);
});

async function bootstrap(): Promise<void> {
  await initDatabase();

  if (!env.token || env.token.trim().length === 0) {
    logger.warn('BOOT', 'DISCORD_TOKEN is not configured in .env');
    logger.info('BOOT', 'Database initialized and ready; add DISCORD_TOKEN to .env to start');
    closeDatabase();
    return;
  }

  await client.login(env.token);
}

bootstrap().catch((err) => {
  logger.error('BOOT', 'Fatal startup error', err);
  closeDatabase();
  process.exit(1);
});
