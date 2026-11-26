import { ModalSubmitInteraction } from 'discord.js';
import { feedbackRepo } from '../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../database/repositories/guildConfigRepo.js';
import { feedbackService } from '../services/feedbackService.js';
import { panelService } from '../services/panelService.js';
import { buildStatusCard, toDisplayPayload } from '../utils/components.js';
import { sanitizeDisplayText } from '../utils/formatters.js';
import { isFeedbackStaff, isGuildAdmin, resolveInteractionMember } from '../utils/permissions.js';

export async function handleModalInteraction(
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const config = guildConfigRepo.getOrCreate(guild.id);
  const member = resolveInteractionMember(interaction);
  const id = interaction.customId;

  if (id.startsWith('fb_submit:')) {
    const token = id.slice('fb_submit:'.length);
    await feedbackService.handleSubmitModal(interaction, token);
    return;
  }

  if (id.startsWith('fb_edit_modal:')) {
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
      const card = buildStatusCard('error', 'غير مسموح', 'لا تملك صلاحية تعديل هذا الفيدباك');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const service = sanitizeDisplayText(interaction.fields.getTextInputValue('service')).slice(0, 80);
    const rating = Number.parseInt(interaction.fields.getTextInputValue('rating'), 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const card = buildStatusCard(
        'error',
        'تقييم غير صالح',
        'يرجى إدخال رقم صحيح بين 1 و 5'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const comment = sanitizeDisplayText(interaction.fields.getTextInputValue('comment'));
    if (comment.length < config.minCommentLength) {
      const card = buildStatusCard(
        'error',
        'النص قصير جداً',
        `يجب أن يكون نص الفيدباك \`${config.minCommentLength}\` أحرف على الأقل`
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري التحديث', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });

    const updated = await feedbackService.editFeedback(guild, record, interaction.user.id, {
      service,
      rating,
      comment,
    });

    const okCard = buildStatusCard(
      'success',
      'تم تحديث الفيدباك',
      `تم حفظ تعديلات الفيدباك \`${updated.code}\` بنجاح`
    );
    await interaction.editReply(toDisplayPayload(okCard));
    return;
  }

  if (id.startsWith('fb_reject_modal:')) {
    if (!isFeedbackStaff(member, config, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للإدارة فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status !== 'PENDING') {
      const card = buildStatusCard(
        'warn',
        'تمت المعالجة مسبقاً',
        'هذا الفيدباك لم يعد في قائمة الانتظار'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const reason = interaction.fields.getTextInputValue('reason') || 'لم يتم استيفاء الشروط';
    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري التنفيذ', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });
    await feedbackService.rejectFeedback(guild, record, interaction.user.id, reason);
    const doneCard = buildStatusCard(
      'success',
      'تم رفض الفيدباك',
      `تم رفض الفيدباك \`${record.code}\` وتسجيل الإجراء`
    );
    await interaction.editReply(toDisplayPayload(doneCard));
    return;
  }

  if (id.startsWith('fb_reply_modal:')) {
    if (!isFeedbackStaff(member, config, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للإدارة فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }
    const feedbackId = Number(id.split(':')[1]);
    const record = feedbackRepo.findById(feedbackId);
    if (!record || record.status !== 'PUBLISHED') {
      const card = buildStatusCard('error', 'غير متاح', 'لا يمكن الرد على هذا الفيدباك');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const replyText = interaction.fields.getTextInputValue('reply_text');
    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري النشر', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });

    await feedbackService.replyFeedback(guild, record, interaction.user.id, replyText);
    const doneCard = buildStatusCard(
      'success',
      'تم إضافة الرد',
      `تم نشر رد الإدارة على الفيدباك \`${record.code}\``
    );
    await interaction.editReply(toDisplayPayload(doneCard));
    return;
  }

  if (id === 'fb_limits_modal') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const minLengthRaw = Number.parseInt(interaction.fields.getTextInputValue('min_length'), 10);
    const cooldownRaw = Number.parseInt(interaction.fields.getTextInputValue('cooldown'), 10);

    const minCommentLength = Number.isInteger(minLengthRaw)
      ? Math.max(1, Math.min(500, minLengthRaw))
      : config.minCommentLength;
    const cooldownMinutes = Number.isInteger(cooldownRaw)
      ? Math.max(0, Math.min(1440, cooldownRaw))
      : config.cooldownMinutes;

    const updated = guildConfigRepo.update(guild.id, {
      minCommentLength,
      cooldownMinutes,
    });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'rules');

    if (interaction.isFromMessage()) {
      await interaction.update(toDisplayPayload(setupContainer));
    } else {
      await interaction.reply(toDisplayPayload(setupContainer, { ephemeral: true }));
    }
    return;
  }

  if (id === 'fb_service_add_modal') {
    if (!isGuildAdmin(member, interaction.memberPermissions)) {
      const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const rawInput = sanitizeDisplayText(interaction.fields.getTextInputValue('service_name'));
    const result = guildConfigRepo.addServices(guild.id, rawInput);

    if (result.added.length === 0) {
      const errTitle = result.limitReached
        ? 'تم الوصول للحد الأقصى'
        : result.skippedDuplicates > 0
          ? 'الخدمة موجودة مسبقاً'
          : 'اسم غير صالح';
      const errDesc = result.limitReached
        ? 'الحد الأقصى للخدمات المتاحة هو 20 خدمة'
        : result.skippedDuplicates > 0
          ? 'الخدمة المدخلة مسجلة بالفعل في القائمة'
          : 'يرجى كتابة اسم خدمة صالح';
      await interaction.reply(toDisplayPayload(buildStatusCard('warn', errTitle, errDesc), { ephemeral: true }));
      return;
    }

    const updated = guildConfigRepo.getOrCreate(guild.id);
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'services');

    if (interaction.isFromMessage()) {
      await interaction.update(toDisplayPayload(setupContainer));
    } else {
      await interaction.reply(toDisplayPayload(setupContainer, { ephemeral: true }));
    }

    if (result.limitReached || result.skippedDuplicates > 0) {
      const notes: string[] = [];
      if (result.skippedDuplicates > 0) {
        notes.push(`تم تجاوز ${result.skippedDuplicates} خدمة مكررة`);
      }
      if (result.limitReached) {
        notes.push('تم التوقف عند الحد الأقصى 20 خدمة');
      }
      await interaction.followUp(
        toDisplayPayload(buildStatusCard('info', 'تمت الإضافة مع ملاحظة', notes.join('\n')), {
          ephemeral: true,
        })
      );
    }
  }
}
