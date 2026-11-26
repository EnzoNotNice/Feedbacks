import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Guild,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  RepliableInteraction,
  SendableChannels,
  TextInputBuilder,
  TextInputStyle,
  User,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { blacklistRepo } from '../database/repositories/blacklistRepo.js';
import { FeedbackRecord, feedbackRepo } from '../database/repositories/feedbackRepo.js';
import { GuildConfig, guildConfigRepo } from '../database/repositories/guildConfigRepo.js';
import { CanvasService } from './canvasService.js';
import { emojiService } from './emojiService.js';
import { logService } from './logService.js';
import { panelService } from './panelService.js';
import {
  DisplayPayload,
  buildFeedbackCard,
  buildStatusCard,
  grayButton,
  linkButton,
  toDisplayPayload,
  withDividerGallery,
} from '../utils/components.js';
import { clampRating, sanitizeDisplayText } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';
import {
  MemberLike,
  hasClientRole,
  isGuildAdmin,
  resolveInteractionMember,
} from '../utils/permissions.js';

export interface PendingFeedbackDraft {
  guildId: string;
  userId: string;
  service?: string;
  rating?: number;
  staffId?: string | null;
  imageUrl?: string | null;
  createdAt: number;
}

const pendingDrafts = new Map<string, PendingFeedbackDraft>();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, draft] of pendingDrafts.entries()) {
    if (draft.createdAt < cutoff) {
      pendingDrafts.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > 8 * 1024 * 1024) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength > 8 * 1024 * 1024) return null;
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function resolveTextChannel(
  guild: Guild,
  channelId: string | null
): Promise<SendableChannels | null> {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached && cached.isTextBased() && cached.isSendable()) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  return fetched && fetched.isTextBased() && fetched.isSendable() ? fetched : null;
}

async function sendTempNotice(channel: SendableChannels, payload: DisplayPayload): Promise<void> {
  const sent = await channel.send(payload).catch(() => null);
  if (sent) {
    setTimeout(() => {
      sent.delete().catch(() => undefined);
    }, 8000).unref();
  }
}

function resolveAutoFeedbackContent(
  message: Message,
  config: GuildConfig
): { rating: number; service: string; comment: string; staffId: string | null } {
  const guild = message.guild!;
  const mentionedUsers = message.mentions.users.filter(
    (u) => !u.bot && u.id !== message.author.id
  );
  const staffId = config.allowStaffTag ? mentionedUsers.first()?.id ?? null : null;

  let text = message.content || '';
  text = text.replace(/<@!?(\d+)>/g, (_m, id: string) => {
    const m = guild.members.cache.get(id);
    if (m) return `@${m.displayName}`;
    const u = message.mentions.users.get(id);
    return u ? `@${u.globalName || u.username}` : '';
  });
  text = text.replace(/<@&(\d+)>/g, (_m, id: string) => {
    const role = guild.roles.cache.get(id);
    return role ? `@${role.name}` : '';
  });
  text = text.replace(/<#(\d+)>/g, (_m, id: string) => {
    const ch = guild.channels.cache.get(id);
    return ch ? `#${ch.name}` : '';
  });
  text = text.replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '');

  let rating = 5;
  const slashMatch = text.match(/\b([1-5])\s*\/\s*5\b/);
  const arabicRateMatch = text.match(/(?:تقييم|التقييم)\s*[:\-]?\s*([1-5])\b/);
  const starsWordMatch = text.match(/\b([1-5])\s*(?:نجوم|نجمة|stars?)\b/i);
  const unicodeStars = text.match(/[⭐🌟]/g);

  if (slashMatch) {
    rating = Number(slashMatch[1]);
    text = text.replace(slashMatch[0], '');
  } else if (arabicRateMatch) {
    rating = Number(arabicRateMatch[1]);
    text = text.replace(arabicRateMatch[0], '');
  } else if (starsWordMatch) {
    rating = Number(starsWordMatch[1]);
    text = text.replace(starsWordMatch[0], '');
  } else if (unicodeStars && unicodeStars.length > 0) {
    rating = Math.min(5, unicodeStars.length);
  }

  text = text
    .replace(/[⭐🌟]/g, '')
    .replace(/^[\s\-:|─│]+|[\s\-:|─│]+$/g, '')
    .trim();

  const lower = text.toLowerCase();
  const matchedService = config.services.find((s) => lower.includes(s.toLowerCase()));
  const service = matchedService || 'تقييم عام';

  return {
    rating: clampRating(rating),
    service,
    comment: sanitizeDisplayText(text).slice(0, 1200),
    staffId,
  };
}

async function resolveMemberDisplay(
  guild: Guild,
  userId: string,
  fallbackUser?: User | null
): Promise<{ displayName: string; handle: string; avatarUrl: string }> {
  const member = await guild.members.fetch(userId).catch(() => null);
  const user =
    fallbackUser ??
    member?.user ??
    (await guild.client.users.fetch(userId).catch(() => null));

  const displayName = member?.displayName || user?.globalName || user?.username || 'عميل';
  const handle = user?.username || 'client';
  const avatarUrl =
    user?.displayAvatarURL({ extension: 'png', size: 256 }) ||
    'https://cdn.discordapp.com/embed/avatars/0.png';

  return { displayName, handle, avatarUrl };
}

async function resolveOptionalName(guild: Guild, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const info = await resolveMemberDisplay(guild, userId);
  return info.displayName;
}

async function buildPublishedCardPayload(
  guild: Guild,
  config: GuildConfig,
  record: FeedbackRecord,
  author: User | null,
  proofBuffer: Buffer | null
): Promise<DisplayPayload> {
  const authorInfo = await resolveMemberDisplay(guild, record.userId, author);
  const files: AttachmentBuilder[] = [];

  if (config.useCanvasCard) {
    const [staffName, replyAuthorName] = await Promise.all([
      resolveOptionalName(guild, record.staffId),
      resolveOptionalName(guild, record.staffReplyBy),
    ]);
    const cardPng = await CanvasService.renderFeedbackCard({
      record,
      authorName: authorInfo.displayName,
      authorHandle: authorInfo.handle,
      avatarUrl: authorInfo.avatarUrl,
      guildName: guild.name,
      guildIconUrl: guild.iconURL({ extension: 'png', size: 128 }),
      staffName,
      replyAuthorName,
    });
    files.push(new AttachmentBuilder(cardPng, { name: 'feedback-card.png' }));
  }

  if (proofBuffer) {
    files.push(new AttachmentBuilder(proofBuffer, { name: 'proof.png' }));
  }

  const dividerPath = path.resolve(process.cwd(), 'assets', 'divider.png');
  const hasDivider = fs.existsSync(dividerPath);
  if (hasDivider) {
    files.push(new AttachmentBuilder(dividerPath, { name: 'divider.png' }));
  }

  const card = buildFeedbackCard({
    record,
    avatarUrl: authorInfo.avatarUrl,
    config,
    mode: 'public',
    hasCardAttachment: config.useCanvasCard,
    hasProofAttachment: Boolean(proofBuffer),
    hasDividerAttachment: false,
  });

  return toDisplayPayload(withDividerGallery(card, hasDivider), { files });
}

export const feedbackService = {
  createDraft(draft: Omit<PendingFeedbackDraft, 'createdAt'>): string {
    const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    pendingDrafts.set(token, { ...draft, createdAt: Date.now() });
    return token;
  },

  consumeDraft(token: string): PendingFeedbackDraft | null {
    const draft = pendingDrafts.get(token) ?? null;
    if (draft) pendingDrafts.delete(token);
    return draft;
  },

  validateEligibility(
    guild: Guild,
    member: MemberLike,
    config: GuildConfig,
    memberPermissions?: PermissionsBitField | null
  ): { ok: true } | { ok: false; title: string; reason: string } {
    if (!member) {
      return {
        ok: false,
        title: 'تعذر التحقق من العضوية',
        reason: 'يجب تنفيذ هذا الإجراء داخل السيرفر',
      };
    }

    const blocked = blacklistRepo.get(guild.id, member.user.id);
    if (blocked) {
      return {
        ok: false,
        title: 'حسابك محظور من الفيدباك',
        reason: `لا يمكنك إرسال فيدباك حالياً\n> **السبب** ── ${blocked.reason}`,
      };
    }

    if (!hasClientRole(member, config)) {
      return {
        ok: false,
        title: 'مخصص للعملاء فقط',
        reason: `إرسال الفيدباك متاح فقط لحاملي رتبة <@&${config.clientRoleId}>\nتواصل مع الإدارة للحصول على الرتبة بعد استلام خدمتك`,
      };
    }

    if (!isGuildAdmin(member, memberPermissions) && config.cooldownMinutes > 0) {
      const latest = feedbackRepo.getLatestByUser(guild.id, member.user.id);
      if (latest) {
        const waitMs = config.cooldownMinutes * 60 * 1000;
        const nextAllowedAt = latest.createdAt + waitMs;
        if (Date.now() < nextAllowedAt) {
          return {
            ok: false,
            title: 'يرجى الانتظار قليلاً',
            reason: `يمكنك إرسال فيدباك جديد <t:${Math.floor(nextAllowedAt / 1000)}:R>`,
          };
        }
      }
    }

    return { ok: true };
  },

  async openFeedbackModal(
    interaction: RepliableInteraction & {
      showModal: (modal: ModalBuilder) => Promise<void>;
    },
    options: {
      defaultService?: string;
      defaultRating?: number;
      staffId?: string | null;
      imageUrl?: string | null;
    } = {}
  ): Promise<void> {
    if (!interaction.guild) return;
    const config = guildConfigRepo.getOrCreate(interaction.guild.id);
    const member = resolveInteractionMember(interaction);

    const check = this.validateEligibility(
      interaction.guild,
      member,
      config,
      interaction.memberPermissions
    );
    if (!check.ok) {
      const card = buildStatusCard('error', check.title, check.reason);
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    if (options.staffId && options.staffId === interaction.user.id) {
      const card = buildStatusCard('error', 'اختيار غير مسموح', 'لا يمكنك كتابة فيدباك لنفسك');
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    const token = this.createDraft({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      service: options.defaultService,
      rating: options.defaultRating,
      staffId: options.staffId ?? null,
      imageUrl: options.imageUrl ?? null,
    });

    const defaultSvc = options.defaultService || config.services[0] || 'خدمة عامة';
    const defaultRating = String(clampRating(options.defaultRating ?? 5));

    const modal = new ModalBuilder()
      .setCustomId(`fb_submit:${token}`)
      .setTitle('نموذج كتابة فيدباك');

    const serviceInput = new TextInputBuilder()
      .setCustomId('service')
      .setLabel('الخدمة أو المنتج')
      .setValue(defaultSvc.slice(0, 80))
      .setMaxLength(80)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const ratingInput = new TextInputBuilder()
      .setCustomId('rating')
      .setLabel('التقييم من 1 إلى 5')
      .setPlaceholder('اكتب رقم من 1 إلى 5')
      .setValue(defaultRating)
      .setMaxLength(1)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const commentInput = new TextInputBuilder()
      .setCustomId('comment')
      .setLabel('رأيك وتجربتك')
      .setPlaceholder('اكتب رأيك بكل وضوح حول جودة الخدمة والتعامل وسرعة التسليم')
      .setMinLength(Math.max(1, Math.min(100, config.minCommentLength)))
      .setMaxLength(1200)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(serviceInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ratingInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(commentInput)
    );

    await interaction.showModal(modal);
  },

  async handleSubmitModal(
    interaction: ModalSubmitInteraction,
    draftToken: string
  ): Promise<void> {
    if (!interaction.guild) return;
    await interaction.deferReply({
      flags: toDisplayPayload(buildStatusCard('info', 'جاري الحفظ', 'يرجى الانتظار'), {
        ephemeral: true,
      }).flags,
    });

    const guild = interaction.guild;
    const config = guildConfigRepo.getOrCreate(guild.id);
    const member = resolveInteractionMember(interaction);

    const check = this.validateEligibility(
      guild,
      member,
      config,
      interaction.memberPermissions
    );
    if (!check.ok) {
      const card = buildStatusCard('error', check.title, check.reason);
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    const draft = this.consumeDraft(draftToken);
    const service = sanitizeDisplayText(
      interaction.fields.getTextInputValue('service') || draft?.service || 'خدمة عامة'
    ).slice(0, 80);

    const rawRating = Number.parseInt(interaction.fields.getTextInputValue('rating'), 10);
    if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
      const card = buildStatusCard(
        'error',
        'تقييم غير صالح',
        'يرجى إدخال رقم صحيح بين 1 و 5 في خانة التقييم'
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    const comment = sanitizeDisplayText(interaction.fields.getTextInputValue('comment'));
    if (comment.length < config.minCommentLength) {
      const card = buildStatusCard(
        'error',
        'النص قصير جداً',
        `يجب أن يكون نص الفيدباك \`${config.minCommentLength}\` أحرف على الأقل`
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    const targetChannelId = config.feedbackChannelId || interaction.channelId;
    const proofBuffer = draft?.imageUrl ? await fetchImageBuffer(draft.imageUrl) : null;
    const useQueue = config.requireApproval && Boolean(config.approvalChannelId);

    const record = feedbackRepo.create({
      guildId: guild.id,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      staffId: config.allowStaffTag ? draft?.staffId ?? null : null,
      service,
      rating: rawRating,
      comment,
      imageUrl: draft?.imageUrl ?? null,
      status: useQueue ? 'PENDING' : 'PUBLISHED',
    });

    const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

    if (useQueue && config.approvalChannelId) {
      const queueCh = await resolveTextChannel(guild, config.approvalChannelId);
      if (queueCh) {
        const files: AttachmentBuilder[] = [];
        if (proofBuffer) {
          files.push(new AttachmentBuilder(proofBuffer, { name: 'proof.png' }));
        }
        const queueCard = buildFeedbackCard({
          record,
          avatarUrl,
          config,
          mode: 'queue',
          hasProofAttachment: Boolean(proofBuffer),
        });
        const sentQueue = await queueCh.send(toDisplayPayload(queueCard, { files }));
        feedbackRepo.update(record.id, {
          queueChannelId: queueCh.id,
          queueMessageId: sentQueue.id,
        });
      }

      await logService.sendFeedbackLog({
        guild,
        config,
        type: 'QUEUED',
        record,
        avatarUrl,
      });

      const confirm = buildStatusCard(
        'info',
        'تم استلام الفيدباك للمراجعة',
        `تم إرسال تقييمك لفريق الإدارة للمراجعة قبل النشر`,
        [
          { name: 'المعرف', value: `\`${record.code}\`` },
          { name: 'الخدمة', value: record.service },
          { name: 'التقييم', value: `${emojiService.stars(record.rating)} (\`${record.rating}/5\`)` },
        ]
      );
      await interaction.editReply(toDisplayPayload(confirm));
      return;
    }

    const published = await this.publishRecordToChannel(
      guild,
      config,
      record,
      interaction.user,
      targetChannelId,
      proofBuffer
    );

    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'PUBLISHED',
      record: published,
      avatarUrl,
    });

    const jumpUrl =
      published.channelId && published.messageId
        ? `https://discord.com/channels/${guild.id}/${published.channelId}/${published.messageId}`
        : null;

    const confirmCard = buildStatusCard(
      'success',
      'شكراً لك على الفيدباك',
      `تم نشر رأيك بنجاح في <#${published.channelId}>`,
      [
        { name: 'المعرف', value: `\`${published.code}\`` },
        { name: 'الخدمة', value: published.service },
        { name: 'التقييم', value: `${emojiService.stars(published.rating)} (\`${published.rating}/5\`)` },
      ]
    );

    if (jumpUrl || config.allowSelfEdit) {
      const actionRow = new ActionRowBuilder<ButtonBuilder>();
      if (config.allowSelfEdit) {
        actionRow.addComponents(
          grayButton({
            customId: `fb_edit_open:${published.id}`,
            label: 'تعديل الفيدباك',
            emoji: 'edit',
          })
        );
      }
      if (jumpUrl) {
        actionRow.addComponents(
          linkButton({
            url: jumpUrl,
            label: 'الانتقال للرسالة',
            emoji: 'search',
          })
        );
      }
      confirmCard.addActionRowComponents(actionRow);
    }

    await interaction.editReply(toDisplayPayload(confirmCard));
  },

  async publishRecordToChannel(
    guild: Guild,
    config: GuildConfig,
    record: FeedbackRecord,
    author: User | null,
    channelId: string | null,
    proofBuffer?: Buffer | null
  ): Promise<FeedbackRecord> {
    const ch = await resolveTextChannel(guild, channelId || config.feedbackChannelId);
    if (!ch) {
      return record;
    }

    let resolvedProof = proofBuffer ?? null;
    if (!resolvedProof && record.imageUrl) {
      resolvedProof = await fetchImageBuffer(record.imageUrl);
    }

    const payload = await buildPublishedCardPayload(guild, config, record, author, resolvedProof);
    const sent = await ch.send(payload);
    const attachmentImg = sent.attachments.find((a) => a.name === 'proof.png');

    const updated =
      feedbackRepo.update(record.id, {
        status: 'PUBLISHED',
        channelId: ch.id,
        messageId: sent.id,
        imageUrl: attachmentImg ? attachmentImg.url : record.imageUrl,
      }) ?? record;

    await panelService.refreshStickyPanel(guild);
    return updated;
  },

  async syncPublishedMessage(guild: Guild, record: FeedbackRecord): Promise<void> {
    if (!record.channelId || !record.messageId) return;
    const ch = await resolveTextChannel(guild, record.channelId);
    if (!ch) return;
    const msg = await ch.messages.fetch(record.messageId).catch(() => null);
    if (!msg) return;

    const config = guildConfigRepo.getOrCreate(guild.id);
    const existingProof = msg.attachments.find((a) => a.name === 'proof.png');

    if (config.useCanvasCard) {
      const proofBuf = existingProof ? await fetchImageBuffer(existingProof.url) : null;
      const payload = await buildPublishedCardPayload(guild, config, record, null, proofBuf);
      await msg.edit({
        components: payload.components,
        files: payload.files ?? [],
        attachments: [],
        flags: payload.flags,
        allowedMentions: { parse: [] },
      }).catch((err) => {
        logger.warn('FEEDBACK', `Failed to sync Canvas message ${record.messageId}: ${err?.message}`);
      });
      return;
    }

    const authorInfo = await resolveMemberDisplay(guild, record.userId);
    const existingDivider = msg.attachments.find((a) => a.name === 'divider.png');

    const card = buildFeedbackCard({
      record,
      avatarUrl: authorInfo.avatarUrl,
      config,
      mode: 'public',
      hasCardAttachment: false,
      hasProofAttachment: Boolean(existingProof),
      hasDividerAttachment: false,
    });

    const payload = toDisplayPayload(withDividerGallery(card, Boolean(existingDivider)));
    await msg.edit({
      components: payload.components,
      flags: payload.flags,
      allowedMentions: { parse: [] },
    }).catch((err) => {
      logger.warn('FEEDBACK', `Failed to sync published message ${record.messageId}: ${err?.message}`);
    });
  },

  async handleChannelMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot || message.system || message.webhookId) return;
    const guild = message.guild;
    const config = guildConfigRepo.getOrCreate(guild.id);
    if (!config.feedbackChannelId || message.channelId !== config.feedbackChannelId) return;

    const member =
      message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));

    if (!config.autoFeedback) {
      if (config.strictChannel && !isGuildAdmin(member)) {
        await message.delete().catch(() => undefined);
      }
      return;
    }

    if (!message.channel.isTextBased() || !message.channel.isSendable()) return;
    const channel = message.channel as SendableChannels;

    const check = this.validateEligibility(guild, member, config);
    if (!check.ok) {
      await message.delete().catch(() => undefined);
      const card = buildStatusCard('error', check.title, check.reason);
      await sendTempNotice(channel, toDisplayPayload(card));
      return;
    }

    const imageAtt = message.attachments.find(
      (att) =>
        att.contentType?.startsWith('image/') ||
        /\.(png|jpe?g|webp|gif)$/i.test(att.name || '')
    );
    const proofBuffer = imageAtt ? await fetchImageBuffer(imageAtt.url) : null;

    const parsed = resolveAutoFeedbackContent(message, config);
    const comment =
      parsed.comment.length === 0 && proofBuffer
        ? 'تجربة مميزة مع الخدمة'
        : parsed.comment;

    if (!comment || comment.length < config.minCommentLength) {
      await message.delete().catch(() => undefined);
      const card = buildStatusCard(
        'error',
        'النص قصير جداً',
        `يرجى كتابة تقييم واضح لا يقل عن \`${config.minCommentLength}\` أحرف`
      );
      await sendTempNotice(channel, toDisplayPayload(card));
      return;
    }

    await message.delete().catch(() => undefined);

    const useQueue = config.requireApproval && Boolean(config.approvalChannelId);
    const record = feedbackRepo.create({
      guildId: guild.id,
      userId: message.author.id,
      userTag: message.author.tag,
      staffId: parsed.staffId,
      service: parsed.service,
      rating: parsed.rating,
      comment,
      imageUrl: imageAtt?.url ?? null,
      status: useQueue ? 'PENDING' : 'PUBLISHED',
    });

    const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

    if (useQueue && config.approvalChannelId) {
      const queueCh = await resolveTextChannel(guild, config.approvalChannelId);
      if (queueCh) {
        const files: AttachmentBuilder[] = [];
        if (proofBuffer) {
          files.push(new AttachmentBuilder(proofBuffer, { name: 'proof.png' }));
        }
        const queueCard = buildFeedbackCard({
          record,
          avatarUrl,
          config,
          mode: 'queue',
          hasProofAttachment: Boolean(proofBuffer),
        });
        const sentQueue = await queueCh.send(toDisplayPayload(queueCard, { files }));
        feedbackRepo.update(record.id, {
          queueChannelId: queueCh.id,
          queueMessageId: sentQueue.id,
        });
      }

      await logService.sendFeedbackLog({
        guild,
        config,
        type: 'QUEUED',
        record,
        avatarUrl,
      });

      const confirm = buildStatusCard(
        'info',
        'تم استلام الفيدباك للمراجعة',
        `تم إرسال تقييم <@${message.author.id}> لفريق الإدارة للمراجعة قبل النشر`,
        [
          { name: 'المعرف', value: `\`${record.code}\`` },
          { name: 'التقييم', value: `${emojiService.stars(record.rating)} (\`${record.rating}/5\`)` },
        ]
      );
      await sendTempNotice(channel, toDisplayPayload(confirm));
      return;
    }

    const published = await this.publishRecordToChannel(
      guild,
      config,
      record,
      message.author,
      channel.id,
      proofBuffer
    );

    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'PUBLISHED',
      record: published,
      avatarUrl,
    });
  },

  async approveFeedback(
    guild: Guild,
    record: FeedbackRecord,
    moderatorId: string
  ): Promise<FeedbackRecord> {
    const config = guildConfigRepo.getOrCreate(guild.id);
    const targetChId = config.feedbackChannelId || record.queueChannelId;
    const approved =
      feedbackRepo.update(record.id, {
        status: 'PUBLISHED',
        moderatorId,
      }) ?? record;

    const published = await this.publishRecordToChannel(
      guild,
      config,
      approved,
      null,
      targetChId
    );

    if (record.queueChannelId && record.queueMessageId) {
      const qCh = await resolveTextChannel(guild, record.queueChannelId);
      const qMsg = qCh ? await qCh.messages.fetch(record.queueMessageId).catch(() => null) : null;
      if (qMsg) {
        const jump =
          published.channelId && published.messageId
            ? `https://discord.com/channels/${guild.id}/${published.channelId}/${published.messageId}`
            : null;
        const doneCard = buildStatusCard(
          'success',
          `تم قبول ونشر الفيدباك ── ${published.code}`,
          `تم اعتماد تقييم العضو <@${record.userId}> ونشره بنجاح`,
          [
            { name: 'بواسطة', value: `<@${moderatorId}>` },
            { name: 'الخدمة', value: published.service },
          ]
        );
        if (jump) {
          doneCard.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              linkButton({ url: jump, label: 'الانتقال للرسالة', emoji: 'search' })
            )
          );
        }
        await qMsg.edit(toDisplayPayload(doneCard)).catch(() => undefined);
      }
    }

    if (config.dmOnStatus) {
      const user = await guild.client.users.fetch(record.userId).catch(() => null);
      if (user) {
        const jump =
          published.channelId && published.messageId
            ? `https://discord.com/channels/${guild.id}/${published.channelId}/${published.messageId}`
            : null;
        const dmCard = buildStatusCard(
          'success',
          `تم قبول ونشر تقييمك في ${guild.name}`,
          `تم اعتماد الفيدباك \`${published.code}\` ونشره بنجاح`
        );
        if (jump) {
          dmCard.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              linkButton({ url: jump, label: 'عرض التقييم', emoji: 'search' })
            )
          );
        }
        await user.send(toDisplayPayload(dmCard)).catch(() => undefined);
      }
    }

    const userAvatar = (await guild.client.users.fetch(record.userId).catch(() => null))
      ?.displayAvatarURL({ extension: 'png', size: 128 });
    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'APPROVED',
      record: published,
      actorId: moderatorId,
      avatarUrl: userAvatar,
    });

    return published;
  },

  async rejectFeedback(
    guild: Guild,
    record: FeedbackRecord,
    moderatorId: string,
    reason: string
  ): Promise<FeedbackRecord> {
    const config = guildConfigRepo.getOrCreate(guild.id);
    const cleanReason = sanitizeDisplayText(reason) || 'لم يتم تحديد سبب';

    const rejected =
      feedbackRepo.update(record.id, {
        status: 'REJECTED',
        moderatorId,
        rejectReason: cleanReason,
      }) ?? record;

    if (record.queueChannelId && record.queueMessageId) {
      const qCh = await resolveTextChannel(guild, record.queueChannelId);
      const qMsg = qCh ? await qCh.messages.fetch(record.queueMessageId).catch(() => null) : null;
      if (qMsg) {
        const card = buildStatusCard(
          'error',
          `تم رفض الفيدباك ── ${record.code}`,
          `تم رفض طلب الفيدباك الخاص بالعضو <@${record.userId}>`,
          [
            { name: 'بواسطة', value: `<@${moderatorId}>` },
            { name: 'السبب', value: cleanReason },
          ]
        );
        await qMsg.edit(toDisplayPayload(card)).catch(() => undefined);
      }
    }

    if (config.dmOnStatus) {
      const user = await guild.client.users.fetch(record.userId).catch(() => null);
      if (user) {
        const dmCard = buildStatusCard(
          'error',
          `تعذر نشر تقييمك في ${guild.name}`,
          `تمت مراجعة الفيدباك \`${record.code}\` ورفضه`,
          [{ name: 'السبب', value: cleanReason }]
        );
        await user.send(toDisplayPayload(dmCard)).catch(() => undefined);
      }
    }

    const userAvatar = (await guild.client.users.fetch(record.userId).catch(() => null))
      ?.displayAvatarURL({ extension: 'png', size: 128 });
    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'REJECTED',
      record: rejected,
      actorId: moderatorId,
      extraDetail: cleanReason,
      avatarUrl: userAvatar,
    });

    return rejected;
  },

  async deleteFeedback(
    guild: Guild,
    record: FeedbackRecord,
    moderatorId: string,
    reason: string
  ): Promise<void> {
    const config = guildConfigRepo.getOrCreate(guild.id);
    const cleanReason = sanitizeDisplayText(reason) || 'إجراء إداري';

    if (record.channelId && record.messageId) {
      const ch = await resolveTextChannel(guild, record.channelId);
      const msg = ch ? await ch.messages.fetch(record.messageId).catch(() => null) : null;
      if (msg) {
        await msg.delete().catch(() => undefined);
      }
    }

    if (record.queueChannelId && record.queueMessageId) {
      const qCh = await resolveTextChannel(guild, record.queueChannelId);
      const qMsg = qCh ? await qCh.messages.fetch(record.queueMessageId).catch(() => null) : null;
      if (qMsg) {
        await qMsg.delete().catch(() => undefined);
      }
    }

    const updated =
      feedbackRepo.update(record.id, {
        status: 'DELETED',
        moderatorId,
        rejectReason: cleanReason,
      }) ?? record;

    await panelService.syncTopPanel(guild);

    const userAvatar = (await guild.client.users.fetch(record.userId).catch(() => null))
      ?.displayAvatarURL({ extension: 'png', size: 128 });
    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'DELETED',
      record: updated,
      actorId: moderatorId,
      extraDetail: cleanReason,
      avatarUrl: userAvatar,
    });
  },

  async replyFeedback(
    guild: Guild,
    record: FeedbackRecord,
    staffId: string,
    replyText: string
  ): Promise<FeedbackRecord> {
    const cleanReply = sanitizeDisplayText(replyText).slice(0, 800);
    const updated =
      feedbackRepo.update(record.id, {
        staffReply: cleanReply,
        staffReplyBy: staffId,
        staffReplyAt: Date.now(),
      }) ?? record;

    await this.syncPublishedMessage(guild, updated);

    const config = guildConfigRepo.getOrCreate(guild.id);
    const userAvatar = (await guild.client.users.fetch(record.userId).catch(() => null))
      ?.displayAvatarURL({ extension: 'png', size: 128 });

    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'REPLIED',
      record: updated,
      actorId: staffId,
      extraDetail: cleanReply,
      avatarUrl: userAvatar,
    });

    if (config.dmOnStatus) {
      const user = await guild.client.users.fetch(record.userId).catch(() => null);
      if (user) {
        const jump =
          updated.channelId && updated.messageId
            ? `https://discord.com/channels/${guild.id}/${updated.channelId}/${updated.messageId}`
            : null;
        const dmCard = buildStatusCard(
          'info',
          `رد جديد على تقييمك في ${guild.name}`,
          `قام <@${staffId}> بالرد على الفيدباك \`${updated.code}\``,
          [{ name: 'الرد', value: cleanReply }]
        );
        if (jump) {
          dmCard.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              linkButton({ url: jump, label: 'عرض الرد', emoji: 'search' })
            )
          );
        }
        await user.send(toDisplayPayload(dmCard)).catch(() => undefined);
      }
    }

    return updated;
  },

  async editFeedback(
    guild: Guild,
    record: FeedbackRecord,
    editorId: string,
    patch: { service: string; rating: number; comment: string }
  ): Promise<FeedbackRecord> {
    const updated =
      feedbackRepo.update(record.id, {
        service: sanitizeDisplayText(patch.service).slice(0, 80),
        rating: clampRating(patch.rating),
        comment: sanitizeDisplayText(patch.comment).slice(0, 1200),
        editedAt: Date.now(),
      }) ?? record;

    await this.syncPublishedMessage(guild, updated);
    await panelService.syncTopPanel(guild);

    const config = guildConfigRepo.getOrCreate(guild.id);
    const userAvatar = (await guild.client.users.fetch(record.userId).catch(() => null))
      ?.displayAvatarURL({ extension: 'png', size: 128 });
    await logService.sendFeedbackLog({
      guild,
      config,
      type: 'EDITED',
      record: updated,
      actorId: editorId,
      avatarUrl: userAvatar,
    });

    return updated;
  },

  async sendFeedbackPrompt(
    interaction: ChatInputCommandInteraction,
    targetUser: User,
    service?: string,
    staff?: User | null
  ): Promise<void> {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const config = guildConfigRepo.getOrCreate(guild.id);

    const svcName = service || config.services[0] || 'الخدمة المقدمة';
    const token = this.createDraft({
      guildId: guild.id,
      userId: targetUser.id,
      service: svcName,
      rating: 5,
      staffId: staff?.id ?? null,
    });

    const promptCard = buildStatusCard(
      'info',
      `دعوة لتقييم تجربتك`,
      `أهلاً <@${targetUser.id}> يهمنا رأيك حول **${svcName}**\nاضغط على الزر بالأسفل لكتابة تقييمك خلال ثوان`,
      staff ? [{ name: 'المسؤول عن الطلب', value: `<@${staff.id}>` }] : []
    );

    promptCard.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: `fb_prompt:${targetUser.id}:${token}`,
          label: 'كتابة فيدباك الآن',
          emoji: 'edit',
        })
      )
    );

    await interaction.reply(
      toDisplayPayload(promptCard, { allowUserMentions: true })
    );
  },
};
