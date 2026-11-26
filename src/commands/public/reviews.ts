import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import { feedbackRepo } from '../../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import {
  ReviewSortMode,
  reviewsViewService,
} from '../../services/reviewsViewService.js';
import { SlashCommand } from '../../structures/Command.js';
import {
  buildFeedbackCard,
  buildStatusCard,
  toDisplayPayload,
} from '../../utils/components.js';
import { isGuildAdmin, resolveInteractionMember } from '../../utils/permissions.js';

export const reviewsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('reviews')
    .setDescription('استعراض وإحصائيات آراء العملاء')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('تصفح قائمة الفيدباك')
        .addIntegerOption((opt) =>
          opt
            .setName('rating')
            .setDescription('تصفية حسب عدد النجوم')
            .setRequired(false)
            .addChoices(
              { name: '5 نجوم', value: 5 },
              { name: '4 نجوم', value: 4 },
              { name: '3 نجوم', value: 3 },
              { name: 'نجمتان', value: 2 },
              { name: 'نجمة واحدة', value: 1 }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('service')
            .setDescription('تصفية حسب الخدمة')
            .setAutocomplete(true)
            .setRequired(false)
        )
        .addUserOption((opt) =>
          opt
            .setName('user')
            .setDescription('عرض تقييمات عضو محدد')
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName('sort')
            .setDescription('ترتيب النتائج')
            .setRequired(false)
            .addChoices(
              { name: 'الأحدث أولاً', value: 'newest' },
              { name: 'الأعلى تقييماً', value: 'highest' },
              { name: 'الأكثر إفادة', value: 'helpful' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('إحصائيات وتقييمات السيرفر')
    )
    .addSubcommand((sub) =>
      sub
        .setName('top')
        .setDescription('ترتيب أعلى الطاقم والعملاء')
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('نوع الترتيب')
            .setRequired(false)
            .addChoices(
              { name: 'أعلى الطاقم تقييماً', value: 'staff' },
              { name: 'أكثر العملاء تفاعلاً', value: 'reviewers' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('عرض تفاصيل فيدباك محدد')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('معرف الفيدباك مثل FB-0001')
            .setAutocomplete(true)
            .setRequired(true)
        )
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'service') {
      const config = guildConfigRepo.getOrCreate(interaction.guildId);
      const q = focused.value.toLowerCase();
      const choices = config.services
        .filter((s) => s.toLowerCase().includes(q))
        .slice(0, 25)
        .map((s) => ({ name: s.slice(0, 100), value: s.slice(0, 100) }));
      await interaction.respond(choices);
      return;
    }
    if (focused.name === 'id') {
      const q = focused.value.toLowerCase();
      const list = feedbackRepo.listPublished(interaction.guildId, { page: 1, pageSize: 25 });
      const choices = list.items
        .filter(
          (item) =>
            item.code.toLowerCase().includes(q) ||
            item.service.toLowerCase().includes(q)
        )
        .slice(0, 25)
        .map((item) => ({
          name: `${item.code} - ${item.service} (${item.rating}/5)`.slice(0, 100),
          value: item.code,
        }));
      await interaction.respond(choices);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const config = guildConfigRepo.getOrCreate(guild.id);
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const rating = interaction.options.getInteger('rating');
      const service = interaction.options.getString('service');
      const user = interaction.options.getUser('user');
      const sort = (interaction.options.getString('sort') as ReviewSortMode) || 'newest';

      const payload = reviewsViewService.buildBrowserPayload(guild, config, {
        page: 1,
        rating,
        service,
        userId: user?.id ?? null,
        sort,
      });
      await interaction.reply(payload);
      return;
    }

    if (sub === 'stats') {
      await interaction.deferReply({
        flags: toDisplayPayload(buildStatusCard('info', 'جاري التحميل', 'يرجى الانتظار'), {
          ephemeral: true,
        }).flags,
      });
      const payload = await reviewsViewService.buildStatsPayload(guild, config);
      await interaction.editReply(payload);
      return;
    }

    if (sub === 'top') {
      const mode =
        interaction.options.getString('type') === 'reviewers' ? 'reviewers' : 'staff';
      const payload = reviewsViewService.buildLeaderboardPayload(guild, config, mode);
      await interaction.reply(payload);
      return;
    }

    if (sub === 'view') {
      const code = interaction.options.getString('id', true);
      const record = feedbackRepo.findByCode(guild.id, code);
      if (!record || record.status === 'DELETED') {
        await interaction.reply(
          toDisplayPayload(reviewsViewService.buildNotFoundCard(code), { ephemeral: true })
        );
        return;
      }

      const member = resolveInteractionMember(interaction);

      if (
        record.status !== 'PUBLISHED' &&
        !isGuildAdmin(member, interaction.memberPermissions) &&
        record.userId !== interaction.user.id
      ) {
        await interaction.reply(
          toDisplayPayload(reviewsViewService.buildNotFoundCard(code), { ephemeral: true })
        );
        return;
      }

      const author = await guild.client.users.fetch(record.userId).catch(() => null);
      const avatarUrl =
        author?.displayAvatarURL({ extension: 'png', size: 128 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png';

      const jumpUrl =
        record.channelId && record.messageId
          ? `https://discord.com/channels/${guild.id}/${record.channelId}/${record.messageId}`
          : null;

      const canSelfEdit =
        isGuildAdmin(member, interaction.memberPermissions) ||
        (record.userId === interaction.user.id && config.allowSelfEdit);

      const card = buildFeedbackCard({
        record,
        avatarUrl,
        config,
        mode: 'detail',
        canSelfEdit,
        jumpUrl,
      });

      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
    }
  },
};
