import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import { feedbackService } from '../../services/feedbackService.js';
import { SlashCommand } from '../../structures/Command.js';
import { buildStatusCard, toDisplayPayload } from '../../utils/components.js';

export const feedbackCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('إرسال فيدباك وتقييم للخدمة')
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('service')
        .setDescription('الخدمة المستلمة')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('rating')
        .setDescription('التقييم من 1 إلى 5')
        .setRequired(false)
        .addChoices(
          { name: '5 نجوم - ممتاز', value: 5 },
          { name: '4 نجوم - جيد جداً', value: 4 },
          { name: '3 نجوم - جيد', value: 3 },
          { name: 'نجمتان - مقبول', value: 2 },
          { name: 'نجمة واحدة - ضعيف', value: 1 }
        )
    )
    .addUserOption((opt) =>
      opt
        .setName('staff')
        .setDescription('المسؤول عن تنفيذ الطلب')
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName('image')
        .setDescription('صورة إثبات اختيارية')
        .setRequired(false)
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const config = guildConfigRepo.getOrCreate(interaction.guildId);
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = config.services
      .filter((s) => s.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((s) => ({ name: s.slice(0, 100), value: s.slice(0, 100) }));
    await interaction.respond(filtered);
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) return;

    const service = interaction.options.getString('service') || undefined;
    const rating = interaction.options.getInteger('rating') ?? 5;
    const staff = interaction.options.getUser('staff');
    const attachment = interaction.options.getAttachment('image');

    if (staff?.bot) {
      const card = buildStatusCard(
        'error',
        'اختيار غير صالح',
        'لا يمكن إسناد التقييم إلى حساب بوت'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    let imageUrl: string | null = null;
    if (attachment) {
      const isImage = Boolean(attachment.contentType?.startsWith('image/'));
      if (!isImage) {
        const card = buildStatusCard(
          'error',
          'نوع ملف غير مدعوم',
          'يرجى إرفاق صورة صالحة فقط'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }
      if (attachment.size > 8 * 1024 * 1024) {
        const card = buildStatusCard(
          'error',
          'حجم الصورة كبير',
          'الحد الأقصى لحجم الصورة المرفقة 8 ميجابايت'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }
      imageUrl = attachment.url;
    }

    await feedbackService.openFeedbackModal(interaction, {
      defaultService: service,
      defaultRating: rating,
      staffId: staff?.id ?? null,
      imageUrl,
    });
  },
};
