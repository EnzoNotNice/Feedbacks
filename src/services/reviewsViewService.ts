import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  Guild,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
} from 'discord.js';
import { THEME_COLORS } from '../config/theme.js';
import { GuildConfig } from '../database/repositories/guildConfigRepo.js';
import { feedbackRepo } from '../database/repositories/feedbackRepo.js';
import { CanvasService } from './canvasService.js';
import { emojiService } from './emojiService.js';
import {
  ContainerChild,
  DisplayPayload,
  buildStatusCard,
  createContainer,
  grayButton,
  mediaGallery,
  section,
  separator,
  text,
  toDisplayPayload,
} from '../utils/components.js';
import {
  buildProgressBar,
  relativeTimestamp,
  sanitizeDisplayText,
  truncateText,
} from '../utils/formatters.js';

export type ReviewSortMode = 'newest' | 'highest' | 'helpful';

export interface ReviewFilterState {
  page: number;
  rating: number | null;
  sort: ReviewSortMode;
  userId: string | null;
  service: string | null;
}

const serviceFilterCache = new Map<string, string>();

export function encodeServiceFilter(service: string | null): string {
  if (!service) return 'all';
  const key = Math.random().toString(36).slice(2, 8);
  serviceFilterCache.set(key, service);
  if (serviceFilterCache.size > 500) {
    const firstKey = serviceFilterCache.keys().next().value;
    if (firstKey) serviceFilterCache.delete(firstKey);
  }
  return key;
}

export function decodeServiceFilter(token: string): string | null {
  if (!token || token === 'all') return null;
  return serviceFilterCache.get(token) ?? null;
}

export const reviewsViewService = {
  buildBrowserPayload(
    guild: Guild,
    config: GuildConfig,
    state: ReviewFilterState
  ): DisplayPayload {
    const result = feedbackRepo.listPublished(guild.id, {
      page: state.page,
      pageSize: 4,
      rating: state.rating,
      sort: state.sort,
      userId: state.userId,
      service: state.service,
    });

    const stats = feedbackRepo.getStats(guild.id);
    const guildIcon = guild.iconURL({ extension: 'png', size: 128 });
    const svcToken = encodeServiceFilter(state.service);
    const ratingVal = state.rating ? String(state.rating) : 'all';
    const userVal = state.userId || 'all';

    const sortLabels: Record<ReviewSortMode, string> = {
      newest: 'الأحدث أولاً',
      highest: 'الأعلى تقييماً',
      helpful: 'الأكثر إفادة',
    };

    const filterMeta = [
      `**الترتيب** ── \`${sortLabels[state.sort]}\``,
      state.rating ? `**التقييم** ── \`${state.rating} نجوم\`` : null,
      state.service ? `**الخدمة** ── \`${state.service}\`` : null,
      state.userId ? `**العضو** ── <@${state.userId}>` : null,
    ]
      .filter(Boolean)
      .join(' ◂ ');

    const headerTitle = `# ${emojiService.get('chat')} سجل آراء العملاء ── ${guild.name}`;
    const headerSub = `-# الإجمالي \`${result.total}\` ── المتوسط \`${stats.average.toFixed(1)} / 5.0\`\n${filterMeta}`;

    const children: ContainerChild[] = [
      guildIcon
        ? section({
            texts: [headerTitle, headerSub],
            thumbnail: guildIcon,
            thumbnailDescription: guild.name,
          })
        : text(`${headerTitle}\n${headerSub}`),
      separator(SeparatorSpacingSize.Small, true),
    ];

    if (result.items.length === 0) {
      children.push(
        text(
          `${emojiService.get('info')} لا توجد تقييمات مطابقة للبحث الحالي\n` +
            `-# جرب تغيير الفلتر أو أرسل أول تقييم عبر \`/feedback\``
        )
      );
    } else {
      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        const stars = emojiService.stars(item.rating, 5);
        const snippet = sanitizeDisplayText(truncateText(item.comment, 180));
        const jumpUrl =
          item.channelId && item.messageId
            ? `https://discord.com/channels/${guild.id}/${item.channelId}/${item.messageId}`
            : null;
        const jumpText = jumpUrl ? ` ── [الرسالة](${jumpUrl})` : '';
        const staffText = item.staffId ? ` ◂ **المسؤول** <@${item.staffId}>` : '';
        const helpfulText = item.helpfulCount > 0 ? ` ◂ ${emojiService.get('heart')} \`${item.helpfulCount}\`` : '';

        children.push(
          text(
            `### ${stars} │ **${sanitizeDisplayText(item.service)}** ── \`${item.code}\`\n` +
              `> ${snippet.replace(/\r?\n/g, ' ')}\n` +
              `<@${item.userId}>${staffText}${helpfulText} ── ${relativeTimestamp(item.createdAt)}${jumpText}`
          )
        );

        if (i < result.items.length - 1) {
          children.push(separator(SeparatorSpacingSize.Small, false));
        }
      }
    }

    children.push(separator(SeparatorSpacingSize.Small, true));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`fb_rev_filter:${ratingVal}:${state.sort}:${userVal}:${svcToken}`)
      .setPlaceholder('تصفية وترتيب التقييمات')
      .addOptions(
        {
          label: 'الأحدث أولاً',
          value: 'sort:newest',
          emoji: emojiService.btn('clock'),
          default: state.sort === 'newest' && !state.rating,
        },
        {
          label: 'الأعلى تقييماً',
          value: 'sort:highest',
          emoji: emojiService.btn('star'),
          default: state.sort === 'highest' && !state.rating,
        },
        {
          label: 'الأكثر إفادة',
          value: 'sort:helpful',
          emoji: emojiService.btn('heart'),
          default: state.sort === 'helpful' && !state.rating,
        },
        {
          label: 'تقييم 5 نجوم فقط',
          value: 'rating:5',
          emoji: emojiService.btn('crown'),
          default: state.rating === 5,
        },
        {
          label: 'تقييم 4 نجوم فقط',
          value: 'rating:4',
          emoji: emojiService.btn('verified'),
          default: state.rating === 4,
        },
        {
          label: 'تقييم 3 نجوم أو أقل',
          value: 'rating:3',
          emoji: emojiService.btn('filter'),
          default: state.rating === 3,
        },
        {
          label: 'إعادة ضبط الفلاتر',
          value: 'reset:all',
          emoji: emojiService.btn('refresh'),
        }
      );

    children.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

    const prevPage = Math.max(1, result.page - 1);
    const nextPage = Math.min(result.totalPages, result.page + 1);

    children.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: `fb_rev_page:${prevPage}:${ratingVal}:${state.sort}:${userVal}:${svcToken}:p`,
          label: 'السابق',
          emoji: 'prev',
          disabled: result.page <= 1,
        }),
        grayButton({
          customId: `fb_rev_info:${result.page}`,
          label: `صفحة ${result.page} / ${result.totalPages}`,
          emoji: 'doc',
          disabled: true,
        }),
        grayButton({
          customId: `fb_rev_page:${nextPage}:${ratingVal}:${state.sort}:${userVal}:${svcToken}:n`,
          label: 'التالي',
          emoji: 'next',
          disabled: result.page >= result.totalPages,
        }),
        grayButton({
          customId: `fb_rev_page:${result.page}:${ratingVal}:${state.sort}:${userVal}:${svcToken}:r`,
          label: 'تحديث',
          emoji: 'refresh',
        })
      )
    );

    const container = createContainer(config.accentColor || THEME_COLORS.primary, children);
    return toDisplayPayload(container, { ephemeral: true });
  },

  async buildStatsPayload(guild: Guild, config: GuildConfig): Promise<DisplayPayload> {
    const stats = feedbackRepo.getStats(guild.id);
    const clientRole = config.clientRoleId ? guild.roles.cache.get(config.clientRoleId) : null;
    const verifiedClientsCount = clientRole ? clientRole.members.size : 0;

    const topServicesLines =
      stats.topServices.length > 0
        ? stats.topServices
            .map(
              (s, i) =>
                `> \`${i + 1}\` **${s.service}** ── \`${s.count} تقييم\` (${s.average.toFixed(1)} ${emojiService.get('star')})`
            )
            .join('\n')
        : `> لا توجد بيانات كافية حتى الآن`;

    const children: ContainerChild[] = [];
    const files: AttachmentBuilder[] = [];

    if (config.useCanvasStats) {
      const cardBuffer = await CanvasService.renderStatsCard({
        guildName: guild.name,
        guildIconUrl: guild.iconURL({ extension: 'png', size: 128 }),
        stats,
        verifiedClientsCount,
      });
      files.push(new AttachmentBuilder(cardBuffer, { name: 'stats.png' }));
      children.push(
        text(
          `# ${emojiService.get('chart')} إحصائيات الفيدباك ── ${guild.name}\n` +
            `-# نظرة شاملة على تقييمات العملاء ومؤشرات الرضا`
        )
      );
      children.push(mediaGallery([{ url: 'attachment://stats.png', description: guild.name }]));
      children.push(separator(SeparatorSpacingSize.Small, true));
      children.push(
        text(`### ${emojiService.get('tag')} **أكثر الخدمات تقييماً**\n${topServicesLines}`)
      );
    } else {
      const levels: (5 | 4 | 3 | 2 | 1)[] = [5, 4, 3, 2, 1];
      const distLines = levels
        .map((lvl) => {
          const cnt = stats.distribution[lvl] ?? 0;
          const ratio = stats.total > 0 ? cnt / stats.total : 0;
          const pct = Math.round(ratio * 100);
          return `> ${emojiService.get('star')} \`${lvl}\` ${buildProgressBar(ratio, 10)} \`${cnt} (${pct}%)\``;
        })
        .join('\n');

      children.push(
        text(
          `# ${emojiService.get('chart')} إحصائيات الفيدباك ── ${guild.name}\n` +
            `> **المتوسط العام** ── \`${stats.total > 0 ? stats.average.toFixed(2) : '5.00'} / 5.0\` ${emojiService.stars(stats.total > 0 ? Math.round(stats.average) : 5)}\n` +
            `> **إجمالي التقييمات** ── \`${stats.total}\` ◂ **نسبة الرضا** ── \`${stats.satisfactionRate}%\`\n` +
            `> **العملاء المقيمون** ── \`${stats.uniqueReviewers}\` ◂ **حاملو رتبة العميل** ── \`${verifiedClientsCount}\``
        )
      );
      children.push(separator(SeparatorSpacingSize.Small, true));
      children.push(text(`### ${emojiService.get('star')} **توزيع النجوم**\n${distLines}`));
      children.push(separator(SeparatorSpacingSize.Small, true));
      children.push(
        text(`### ${emojiService.get('tag')} **أكثر الخدمات تقييماً**\n${topServicesLines}`)
      );
    }

    children.push(separator(SeparatorSpacingSize.Small, true));
    children.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: 'fb_panel_browse',
          label: 'تصفح الآراء',
          emoji: 'search',
        }),
        grayButton({
          customId: 'fb_open_modal',
          label: 'كتابة فيدباك',
          emoji: 'edit',
        })
      )
    );

    const container = createContainer(config.accentColor || THEME_COLORS.primary, children);
    return toDisplayPayload(container, { ephemeral: true, files });
  },

  buildLeaderboardPayload(
    guild: Guild,
    config: GuildConfig,
    mode: 'staff' | 'reviewers' = 'staff'
  ): DisplayPayload {
    const guildIcon = guild.iconURL({ extension: 'png', size: 128 });
    const title =
      mode === 'staff'
        ? `# ${emojiService.get('crown')} أعلى الطاقم تقييماً ── ${guild.name}`
        : `# ${emojiService.get('trophy')} أكثر العملاء تفاعلاً ── ${guild.name}`;

    const children: ContainerChild[] = [
      guildIcon
        ? section({
            texts: [
              title,
              `-# ترتيب التقييمات المعتمدة في السيرفر`,
            ],
            thumbnail: guildIcon,
            thumbnailDescription: guild.name,
          })
        : text(title),
      separator(SeparatorSpacingSize.Small, true),
    ];

    if (mode === 'staff') {
      const top = feedbackRepo.getTopStaff(guild.id, 10);
      if (top.length === 0) {
        children.push(
          text(
            `${emojiService.get('info')} لا توجد تقييمات مرتبطة بموظفين حتى الآن\n` +
              `-# يمكن للأعضاء تحديد المسؤول عبر خيار \`staff\` في الأمر \`/feedback\``
          )
        );
      } else {
        const lines = top.map((entry, idx) => {
          const badge =
            idx === 0
              ? emojiService.get('trophy')
              : idx === 1
                ? emojiService.get('medal')
                : `\`#${idx + 1}\``;
          return `> ${badge} <@${entry.staffId}> ── \`${entry.average.toFixed(1)} / 5.0\` ${emojiService.get('star')} ◂ \`${entry.count} تقييم\` (\`${entry.fiveStars}\` خماسي)`;
        });
        children.push(text(lines.join('\n')));
      }
    } else {
      const top = feedbackRepo.getTopReviewers(guild.id, 10);
      if (top.length === 0) {
        children.push(text(`${emojiService.get('info')} لا توجد تقييمات مسجلة حتى الآن`));
      } else {
        const lines = top.map((entry, idx) => {
          const badge =
            idx === 0
              ? emojiService.get('trophy')
              : idx === 1
                ? emojiService.get('medal')
                : `\`#${idx + 1}\``;
          return `> ${badge} <@${entry.userId}> ── \`${entry.count} تقييم\` ◂ متوسط \`${entry.average.toFixed(1)}\` ${emojiService.get('star')}`;
        });
        children.push(text(lines.join('\n')));
      }
    }

    children.push(separator(SeparatorSpacingSize.Small, true));
    children.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: 'fb_top_mode:staff',
          label: 'ترتيب الطاقم',
          emoji: 'crown',
          disabled: mode === 'staff',
        }),
        grayButton({
          customId: 'fb_top_mode:reviewers',
          label: 'أكثر المقيّمين',
          emoji: 'users',
          disabled: mode === 'reviewers',
        })
      )
    );

    const container = createContainer(config.accentColor || THEME_COLORS.gold, children);
    return toDisplayPayload(container, { ephemeral: true });
  },

  buildHelpPayload(
    guild: Guild | null,
    category: 'all' | 'client' | 'browse' | 'admin' = 'all'
  ): DisplayPayload {
    const botAvatar = guild?.client.user?.displayAvatarURL({ extension: 'png', size: 128 });

    const clientSection =
      `### ${emojiService.get('edit')} **أوامر العملاء**\n` +
      `> \`/feedback\` ── إرسال فيدباك وتقييم جديد للخدمة\n` +
      `> زر **كتابة فيدباك** ── فتح نموذج التقييم من اللوحة`;

    const browseSection =
      `### ${emojiService.get('search')} **الاستعراض والإحصائيات**\n` +
      `> \`/reviews list\` ── تصفح التقييمات مع الترتيب والفلترة\n` +
      `> \`/reviews stats\` ── عرض إحصائيات السيرفر وتوزيع النجوم\n` +
      `> \`/reviews top\` ── لوحة متصدري الطاقم والعملاء\n` +
      `> \`/reviews view\` ── عرض تفاصيل وتعديل تقييم برقم المعرف`;

    const adminSection =
      `### ${emojiService.get('settings')} **إدارة النظام**\n` +
      `> \`/feedback-admin channel\` ── تحديد روم الفيدباك التلقائي\n` +
      `> \`/feedback-admin setup\` ── لوحة الإعدادات التفاعلية الكاملة\n` +
      `> \`/feedback-admin panel\` ── إرسال لوحة الفيدباك في روم\n` +
      `> \`/feedback-admin client\` ── منح أو سحب رتبة العميل\n` +
      `> \`/feedback-admin request\` ── إرسال دعوة فيدباك مباشرة لعضو\n` +
      `> \`/feedback-admin reply\` ── إضافة رد رسمي على فيدباك\n` +
      `> \`/feedback-admin delete\` ── حذف فيدباك محدد\n` +
      `> \`/feedback-admin services\` ── إدارة قائمة الخدمات\n` +
      `> \`/feedback-admin blacklist\` ── حظر أو رفع حظر عضو\n` +
      `> \`/feedback-admin export\` ── تصدير التقييمات كملف`;

    const bodyParts: string[] = [];
    if (category === 'all' || category === 'client') bodyParts.push(clientSection);
    if (category === 'all' || category === 'browse') bodyParts.push(browseSection);
    if (category === 'all' || category === 'admin') bodyParts.push(adminSection);

    const children: ContainerChild[] = [
      botAvatar
        ? section({
            texts: [
              `# ${emojiService.get('info')} دليل أوامر نظام الفيدباك`,
              `-# اختر القسم من القائمة لعرض الأوامر المختصة`,
            ],
            thumbnail: botAvatar,
            thumbnailDescription: 'Bot Avatar',
          })
        : text(
            `# ${emojiService.get('info')} دليل أوامر نظام الفيدباك\n-# اختر القسم من القائمة لعرض الأوامر المختصة`
          ),
      separator(SeparatorSpacingSize.Small, true),
      text(bodyParts.join('\n\n')),
      separator(SeparatorSpacingSize.Small, true),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('fb_help_category')
          .setPlaceholder('اختر قسم الأوامر')
          .addOptions(
            {
              label: 'جميع الأوامر',
              value: 'all',
              emoji: emojiService.btn('sparkles'),
              default: category === 'all',
            },
            {
              label: 'أوامر العملاء',
              value: 'client',
              emoji: emojiService.btn('edit'),
              default: category === 'client',
            },
            {
              label: 'الاستعراض والإحصائيات',
              value: 'browse',
              emoji: emojiService.btn('chart'),
              default: category === 'browse',
            },
            {
              label: 'إدارة النظام',
              value: 'admin',
              emoji: emojiService.btn('settings'),
              default: category === 'admin',
            }
          )
      ),
    ];

    const container = createContainer(THEME_COLORS.primary, children);
    return toDisplayPayload(container, { ephemeral: true });
  },

  buildNotFoundCard(code: string) {
    return buildStatusCard(
      'error',
      'لم يتم العثور على الفيدباك',
      `لا يوجد فيدباك بالمعرف \`${sanitizeDisplayText(code)}\``
    );
  },
};
