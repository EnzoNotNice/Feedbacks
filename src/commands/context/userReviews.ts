import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import { reviewsViewService } from '../../services/reviewsViewService.js';
import { UserContextCommand } from '../../structures/Command.js';

export const userReviewsContext: UserContextCommand = {
  type: 'user',
  data: new ContextMenuCommandBuilder()
    .setName('تقييمات العضو')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false),

  async execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
    if (!interaction.guild) return;
    const config = guildConfigRepo.getOrCreate(interaction.guild.id);
    const payload = reviewsViewService.buildBrowserPayload(interaction.guild, config, {
      page: 1,
      rating: null,
      sort: 'newest',
      userId: interaction.targetUser.id,
      service: null,
    });
    await interaction.reply(payload);
  },
};
