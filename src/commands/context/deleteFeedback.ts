import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { feedbackRepo } from '../../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import { feedbackService } from '../../services/feedbackService.js';
import { MessageContextCommand } from '../../structures/Command.js';
import { buildStatusCard, toDisplayPayload } from '../../utils/components.js';
import { isGuildAdmin, resolveInteractionMember } from '../../utils/permissions.js';

export const deleteFeedbackContext: MessageContextCommand = {
  type: 'message',
  data: new ContextMenuCommandBuilder()
    .setName('حذف الفيدباك')
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const member = resolveInteractionMember(interaction);

    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard(
        'error',
        'صلاحية غير كافية',
        'حذف الفيدباك متاح للمسؤولين فقط'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const record = feedbackRepo.findByMessageId(interaction.targetMessage.id);
    if (!record || record.status === 'DELETED') {
      const card = buildStatusCard(
        'error',
        'رسالة غير مرتبطة بفيدباك',
        'هذه الرسالة ليست بطاقة فيدباك مسجلة'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري الحذف', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });

    guildConfigRepo.getOrCreate(guild.id);
    await feedbackService.deleteFeedback(guild, record, interaction.user.id, 'حذف سريع من القائمة');

    const okCard = buildStatusCard(
      'success',
      'تم حذف الفيدباك',
      `تم حذف الفيدباك \`${record.code}\` بنجاح`
    );
    await interaction.editReply(toDisplayPayload(okCard));
  },
};
