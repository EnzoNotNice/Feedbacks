import { Guild, SendableChannels, SeparatorSpacingSize } from 'discord.js';
import { EmojiKey } from '../config/emojis.js';
import { THEME_COLORS } from '../config/theme.js';
import { GuildConfig } from '../database/repositories/guildConfigRepo.js';
import { FeedbackRecord } from '../database/repositories/feedbackRepo.js';
import { emojiService } from './emojiService.js';
import {
  ContainerChild,
  createContainer,
  section,
  separator,
  text,
  toDisplayPayload,
} from '../utils/components.js';
import { formatQuoteBlock, relativeTimestamp, truncateText } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';

export type LogEventType =
  | 'PUBLISHED'
  | 'QUEUED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EDITED'
  | 'REPLIED'
  | 'DELETED'
  | 'CLIENT_ADDED'
  | 'CLIENT_REMOVED'
  | 'BLACKLISTED'
  | 'UNBLACKLISTED';

const LOG_META: Record<
  LogEventType,
  { title: string; icon: EmojiKey; color: number }
> = {
  PUBLISHED: { title: 'نشر فيدباك جديد', icon: 'verified', color: THEME_COLORS.success },
  QUEUED: { title: 'فيدباك بانتظار المراجعة', icon: 'clock', color: THEME_COLORS.warning },
  APPROVED: { title: 'اعتماد ونشر فيدباك', icon: 'check', color: THEME_COLORS.success },
  REJECTED: { title: 'رفض فيدباك', icon: 'cross', color: THEME_COLORS.danger },
  EDITED: { title: 'تعديل فيدباك', icon: 'edit', color: THEME_COLORS.primary },
  REPLIED: { title: 'رد رسمي على فيدباك', icon: 'reply', color: THEME_COLORS.indigo },
  DELETED: { title: 'حذف فيدباك', icon: 'trash', color: THEME_COLORS.danger },
  CLIENT_ADDED: { title: 'منح رتبة العميل', icon: 'client', color: THEME_COLORS.success },
  CLIENT_REMOVED: { title: 'سحب رتبة العميل', icon: 'user', color: THEME_COLORS.warning },
  BLACKLISTED: { title: 'حظر من نظام الفيدباك', icon: 'block', color: THEME_COLORS.danger },
  UNBLACKLISTED: { title: 'رفع الحظر من الفيدباك', icon: 'shield', color: THEME_COLORS.success },
};

async function resolveLogChannel(
  guild: Guild,
  channelId: string | null
): Promise<SendableChannels | null> {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached && cached.isTextBased() && cached.isSendable()) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  return fetched && fetched.isTextBased() && fetched.isSendable() ? fetched : null;
}

export const logService = {
  async sendFeedbackLog(options: {
    guild: Guild;
    config: GuildConfig;
    type: LogEventType;
    record: FeedbackRecord;
    actorId?: string;
    extraDetail?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const channel = await resolveLogChannel(options.guild, options.config.logChannelId);
    if (!channel) return;

    const meta = LOG_META[options.type];
    const icon = emojiService.get(meta.icon);
    const stars = emojiService.stars(options.record.rating, 5);
    const jumpUrl =
      options.record.channelId && options.record.messageId
        ? `https://discord.com/channels/${options.guild.id}/${options.record.channelId}/${options.record.messageId}`
        : null;

    const detailLines = [
      `> **المعرف** ── \`${options.record.code}\``,
      `> **العميل** ── <@${options.record.userId}> (\`${options.record.userId}\`)`,
      `> **الخدمة** ── \`${options.record.service}\``,
      `> **التقييم** ── ${stars} (\`${options.record.rating}/5\`)`,
    ];

    if (options.record.staffId) {
      detailLines.push(`> **المسؤول** ── <@${options.record.staffId}>`);
    }
    if (options.actorId) {
      detailLines.push(`> **بواسطة** ── <@${options.actorId}> (\`${options.actorId}\`)`);
    }
    if (options.extraDetail) {
      detailLines.push(`> **التفاصيل** ── ${truncateText(options.extraDetail, 300)}`);
    }
    if (jumpUrl && options.type !== 'DELETED') {
      detailLines.push(`> **الرسالة** ── [الانتقال للرسالة](${jumpUrl})`);
    }
    detailLines.push(`> ${relativeTimestamp(Date.now())}`);

    const children: ContainerChild[] = [
      options.avatarUrl
        ? section({
            texts: [
              `# ${icon} ${meta.title}`,
              `-# سجل التدقيق الإداري ── \`${options.record.code}\``,
            ],
            thumbnail: options.avatarUrl,
            thumbnailDescription: options.record.userTag,
          })
        : text(`# ${icon} ${meta.title}`),
      separator(SeparatorSpacingSize.Small, true),
      text(detailLines.join('\n')),
      separator(SeparatorSpacingSize.Small, false),
      text(formatQuoteBlock(options.record.comment, 500)),
    ];

    const container = createContainer(meta.color, children);
    await channel.send(toDisplayPayload(container)).catch((err) => {
      logger.warn('LOG', `Failed to send feedback log in guild ${options.guild.id}: ${err?.message}`);
    });
  },

  async sendActionLog(options: {
    guild: Guild;
    config: GuildConfig;
    type: 'CLIENT_ADDED' | 'CLIENT_REMOVED' | 'BLACKLISTED' | 'UNBLACKLISTED';
    targetUserId: string;
    actorId: string;
    reason?: string;
    avatarUrl?: string;
  }): Promise<void> {
    const channel = await resolveLogChannel(options.guild, options.config.logChannelId);
    if (!channel) return;

    const meta = LOG_META[options.type];
    const icon = emojiService.get(meta.icon);

    const lines = [
      `> **العضو** ── <@${options.targetUserId}> (\`${options.targetUserId}\`)`,
      `> **الإداري** ── <@${options.actorId}> (\`${options.actorId}\`)`,
      options.reason ? `> **السبب** ── ${truncateText(options.reason, 300)}` : null,
      `> ${relativeTimestamp(Date.now())}`,
    ].filter(Boolean);

    const children: ContainerChild[] = [
      options.avatarUrl
        ? section({
            texts: [`# ${icon} ${meta.title}`, `-# سجل التدقيق الإداري`],
            thumbnail: options.avatarUrl,
            thumbnailDescription: options.targetUserId,
          })
        : text(`# ${icon} ${meta.title}`),
      separator(SeparatorSpacingSize.Small, true),
      text(lines.join('\n')),
    ];

    const container = createContainer(meta.color, children);
    await channel.send(toDisplayPayload(container)).catch((err) => {
      logger.warn('LOG', `Failed to send action log in guild ${options.guild.id}: ${err?.message}`);
    });
  },
};
