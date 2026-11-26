import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { reviewsViewService } from '../../services/reviewsViewService.js';
import { SlashCommand } from '../../structures/Command.js';

export const helpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('دليل أوامر البوت'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply(reviewsViewService.buildHelpPayload(interaction.guild, 'all'));
  },
};
