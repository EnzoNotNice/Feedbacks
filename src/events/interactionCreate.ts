import { Events, Interaction } from 'discord.js';
import { handleButtonInteraction } from '../handlers/buttonHandler.js';
import { handleModalInteraction } from '../handlers/modalHandler.js';
import { handleSelectInteraction } from '../handlers/selectHandler.js';
import { FeedbackClient } from '../structures/FeedbackClient.js';
import { buildStatusCard, toDisplayPayload } from '../utils/components.js';
import { logger } from '../utils/logger.js';

export const interactionEventName = Events.InteractionCreate;

export async function onInteractionCreate(
  client: FeedbackClient,
  interaction: Interaction
): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      const cmd = client.slashCommands.get(interaction.commandName);
      if (cmd?.autocomplete) {
        await cmd.autocomplete(interaction);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const cmd = client.slashCommands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      const cmd = client.contextCommands.get(interaction.commandName);
      if (cmd && cmd.type === 'message') {
        await cmd.execute(interaction);
      }
      return;
    }

    if (interaction.isUserContextMenuCommand()) {
      const cmd = client.contextCommands.get(interaction.commandName);
      if (cmd && cmd.type === 'user') {
        await cmd.execute(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isAnySelectMenu()) {
      await handleSelectInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalInteraction(interaction);
    }
  } catch (err) {
    logger.error('INTERACTION', 'Unhandled interaction error', err);
    if (interaction.isRepliable()) {
      const errCard = buildStatusCard(
        'error',
        'حدث خطأ غير متوقع',
        'تعذر إتمام هذا الإجراء حالياً يرجى المحاولة لاحقاً'
      );
      const payload = toDisplayPayload(errCard, { ephemeral: true });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => undefined);
      } else {
        await interaction.reply(payload).catch(() => undefined);
      }
    }
  }
}
