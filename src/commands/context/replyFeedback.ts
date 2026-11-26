import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { feedbackRepo } from '../../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import { MessageContextCommand } from '../../structures/Command.js';
import { buildStatusCard, toDisplayPayload } from '../../utils/components.js';
import { isFeedbackStaff, resolveInteractionMember } from '../../utils/permissions.js';

export const replyFeedbackContext: MessageContextCommand = {
  type: 'message',
  data: new ContextMenuCommandBuilder()
    .setName('الرد على الفيدباك')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
    if (!interaction.guild) return;
    const config = guildConfigRepo.getOrCreate(interaction.guild.id);
    const member = resolveInteractionMember(interaction);

    if (!isFeedbackStaff(member, config, interaction.memberPermissions)) {
      const card = buildStatusCard(
        'error',
        'صلاحية غير كافية',
        'هذا الإجراء مخصص للإدارة فقط'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const record = feedbackRepo.findByMessageId(interaction.targetMessage.id);
    if (!record || record.status !== 'PUBLISHED') {
      const card = buildStatusCard(
        'error',
        'رسالة غير مرتبطة بفيدباك',
        'هذه الرسالة ليست بطاقة فيدباك منشورة'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`fb_reply_modal:${record.id}`)
      .setTitle(`الرد على ${record.code}`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reply_text')
          .setLabel('رد الإدارة الرسمي')
          .setValue(record.staffReply ? record.staffReply.slice(0, 800) : '')
          .setPlaceholder('اكتب رد الإدارة الذي سيظهر أسفل الفيدباك')
          .setMaxLength(800)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },
};
