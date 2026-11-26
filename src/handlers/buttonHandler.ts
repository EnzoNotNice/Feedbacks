import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { feedbackRepo } from '../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../database/repositories/guildConfigRepo.js';
import { feedbackService } from '../services/feedbackService.js';
import { panelService, SetupTab } from '../services/panelService.js';
import {
  ReviewSortMode,
  decodeServiceFilter,
  reviewsViewService,
} from '../services/reviewsViewService.js';
import {
  buildFeedbackCard,
  buildStatusCard,
  linkButton,
  toDisplayPayload,
  withDividerGallery,
} from '../utils/components.js';
import { isFeedbackStaff, isGuildAdmin, resolveInteractionMember } from '../utils/permissions.js';

type ToggleField =
  | 'autoFeedback'
  | 'useCanvasCard'
  | 'requireClientRole'
  | 'requireApproval'
  | 'stickyPanel'
  | 'strictChannel'
  | 'allowHelpful'
  | 'allowSelfEdit'
  | 'dmOnStatus'
  | 'useCanvasStats';

export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const config = guildConfigRepo.getOrCreate(guild.id);
  const member = resolveInteractionMember(interaction);
  const id = interaction.customId;

  if (id === 'fb_open_modal') {
    await feedbackService.openFeedbackModal(interaction);
    return;
  }

  if (id === 'fb_panel_browse') {
    const payload = reviewsViewService.buildBrowserPayload(guild, config, {
      page: 1,
      rating: null,
      sort: 'newest',
      userId: null,
      service: null,
    });
    await interaction.reply(payload);
    return;
  }

  if (id === 'fb_panel_stats') {
    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري التحميل', 'يتم تجهيز الإحصائيات'), {
        ephemeral: true,
      }).flags,
    });
    const payload = await reviewsViewService.buildStatsPayload(guild, config);
    await interaction.editReply(payload);
    return;
  }

  if (id.startsWith('fb_prompt:')) {
    const [, targetUserId, token] = id.split(':');
    if (targetUserId && interaction.user.id !== targetUserId) {
      const card = buildStatusCard(
        'error',
        'دعوة مخصصة لعضو آخر',
        `هذا الزر مخصص للعضو <@${targetUserId}> فقط\nيمكنك استخدام \`/feedback\` لإرسال تقييمك الخاص`
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const draft = feedbackService.consumeDraft(token);
    await feedbackService.openFeedbackModal(interaction, {
      defaultService: draft?.service,
      defaultRating: draft?.rating,
      staffId: draft?.staffId,
    });
    return;
  }

  if (id.startsWith('fb_helpful:')) {
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status !== 'PUBLISHED') {
      const card = buildStatusCard('error', 'تقييم غير متاح', 'هذا الفيدباك لم يعد متاحاً');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    if (record.userId === interaction.user.id) {
      const card = buildStatusCard(
        'warn',
        'إجراء غير مسموح',
        'لا يمكنك التصويت على تقييمك الشخصي'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    feedbackRepo.toggleHelpful(record.id, interaction.user.id);
    const updated = feedbackRepo.findById(record.id) ?? record;
    const author = await guild.client.users.fetch(updated.userId).catch(() => null);
    const avatarUrl =
      author?.displayAvatarURL({ extension: 'png', size: 128 }) ||
      'https://cdn.discordapp.com/embed/avatars/0.png';

    const hasCard = interaction.message.attachments.some((a) => a.name === 'feedback-card.png');
    const hasProof = interaction.message.attachments.some((a) => a.name === 'proof.png');
    const hasDivider = interaction.message.attachments.some((a) => a.name === 'divider.png');

    const card = buildFeedbackCard({
      record: updated,
      avatarUrl,
      config,
      mode: 'public',
      hasCardAttachment: hasCard,
      hasProofAttachment: hasProof,
      hasDividerAttachment: false,
    });

    const payload = toDisplayPayload(withDividerGallery(card, hasDivider));
    await interaction.update({
      components: payload.components,
      flags: payload.flags,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (id.startsWith('fb_approve:')) {
    if (!isFeedbackStaff(member, config, interaction.memberPermissions)) {
      const card = buildStatusCard(
        'error',
        'صلاحية غير كافية',
        'هذا الإجراء مخصص للإدارة فقط'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status !== 'PENDING') {
      const card = buildStatusCard(
        'warn',
        'تمت معالجة الطلب مسبقاً',
        'هذا الفيدباك لم يعد في قائمة الانتظار'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    await interaction.deferUpdate();
    await feedbackService.approveFeedback(guild, record, interaction.user.id);
    return;
  }

  if (id.startsWith('fb_reject:')) {
    if (!isFeedbackStaff(member, config, interaction.memberPermissions)) {
      const card = buildStatusCard(
        'error',
        'صلاحية غير كافية',
        'هذا الإجراء مخصص للإدارة فقط'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status !== 'PENDING') {
      const card = buildStatusCard(
        'warn',
        'تمت معالجة الطلب مسبقاً',
        'هذا الفيدباك لم يعد في قائمة الانتظار'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`fb_reject_modal:${record.id}`)
      .setTitle(`رفض الفيدباك ${record.code}`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('سبب الرفض')
          .setPlaceholder('اكتب سبب الرفض ليصل للعضو')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(400)
          .setRequired(false)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  if (id.startsWith('fb_edit_open:')) {
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status === 'DELETED') {
      const card = buildStatusCard('error', 'غير موجود', 'تعذر العثور على هذا الفيدباك');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const canEdit =
      isGuildAdmin(member, interaction.memberPermissions) ||
      (record.userId === interaction.user.id && config.allowSelfEdit);
    if (!canEdit) {
      const card = buildStatusCard(
        'error',
        'غير مسموح بالتعديل',
        'لا تملك صلاحية تعديل هذا الفيدباك'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`fb_edit_modal:${record.id}`)
      .setTitle(`تعديل الفيدباك ${record.code}`);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('service')
          .setLabel('الخدمة أو المنتج')
          .setValue(record.service.slice(0, 80))
          .setMaxLength(80)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('rating')
          .setLabel('التقييم من 1 إلى 5')
          .setValue(String(record.rating))
          .setMaxLength(1)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('نص الفيدباك')
          .setValue(record.comment.slice(0, 1200))
          .setMinLength(Math.max(1, Math.min(100, config.minCommentLength)))
          .setMaxLength(1200)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  if (id.startsWith('fb_rev_page:')) {
    const [, pageStr, ratingStr, sortStr, userStr, svcToken] = id.split(':');
    const payload = reviewsViewService.buildBrowserPayload(guild, config, {
      page: Number(pageStr) || 1,
      rating: ratingStr === 'all' ? null : Number(ratingStr),
      sort: (sortStr as ReviewSortMode) || 'newest',
      userId: userStr === 'all' ? null : userStr,
      service: decodeServiceFilter(svcToken),
    });
    await interaction.update(payload);
    return;
  }

  if (id.startsWith('fb_top_mode:')) {
    const mode = id.split(':')[1] === 'reviewers' ? 'reviewers' : 'staff';
    const payload = reviewsViewService.buildLeaderboardPayload(guild, config, mode);
    await interaction.update(payload);
    return;
  }

  if (id.startsWith('fb_setup_tab:')) {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const tab = (id.split(':')[1] as SetupTab) || 'channels';
    const setupContainer = panelService.buildAdminSetupContainer(guild, config, tab);
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id.startsWith('fb_toggle:')) {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const field = id.split(':')[1] as ToggleField;
    const current = Boolean(config[field]);
    const updated = guildConfigRepo.update(guild.id, { [field]: !current });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'rules');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_limits_modal') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId('fb_limits_modal')
      .setTitle('إعدادات الحدود والتهدئة');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('min_length')
          .setLabel('الحد الأدنى لأحرف الفيدباك')
          .setValue(String(config.minCommentLength))
          .setMaxLength(3)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('cooldown')
          .setLabel('فترة الانتظار بالدقائق (0 للإلغاء)')
          .setValue(String(config.cooldownMinutes))
          .setMaxLength(4)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  if (id === 'fb_cfg_service_add') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    if (config.services.length >= 20) {
      const card = buildStatusCard(
        'warn',
        'تم الوصول للحد الأقصى',
        'الحد الأقصى للخدمات هو 20 خدمة يرجى حذف خدمة قبل الإضافة'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId('fb_service_add_modal')
      .setTitle('إضافة خدمة جديدة');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('service_name')
          .setLabel('اسم الخدمة أو عدة خدمات مفصولة بفاصلة')
          .setPlaceholder('مثال برمجة بوت، تصميم هوية')
          .setMaxLength(300)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  if (id === 'fb_cfg_services_reset') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    guildConfigRepo.resetDefaultServices(guild.id);
    const updated = guildConfigRepo.getOrCreate(guild.id);
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'services');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_services_clear') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const updated = guildConfigRepo.update(guild.id, { services: [] });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'services');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_setup_publish_panel') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    if (!config.feedbackChannelId) {
      const card = buildStatusCard(
        'error',
        'لم يتم تحديد الروم',
        'يرجى اختيار روم نشر الفيدباك أولاً'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري النشر', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });

    const published = await panelService.publishPanel(guild, config.feedbackChannelId);
    const jump = `https://discord.com/channels/${guild.id}/${published.channelId}/${published.messageId}`;
    const card = buildStatusCard(
      'success',
      'تم نشر لوحة الفيدباك',
      `تم إرسال اللوحة في <#${published.channelId}> بنجاح`
    );
    card.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        linkButton({ url: jump, label: 'عرض اللوحة', emoji: 'search' })
      )
    );
    await interaction.editReply(toDisplayPayload(card));
  }
}
