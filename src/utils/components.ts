import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { EmojiKey } from '../config/emojis.js';
import { RATING_COLORS, THEME_COLORS } from '../config/theme.js';
import { GuildConfig } from '../database/repositories/guildConfigRepo.js';
import { FeedbackRecord } from '../database/repositories/feedbackRepo.js';
import { emojiService } from '../services/emojiService.js';
import {
  formatQuoteBlock,
  relativeTimestamp,
  sanitizeDisplayText,
  truncateText,
} from './formatters.js';

export type ContainerChild =
  | TextDisplayBuilder
  | SeparatorBuilder
  | SectionBuilder
  | ActionRowBuilder<ButtonBuilder>
  | ActionRowBuilder<StringSelectMenuBuilder>
  | ActionRowBuilder<ChannelSelectMenuBuilder>
  | ActionRowBuilder<RoleSelectMenuBuilder>
  | MediaGalleryBuilder
  | FileBuilder;

export type TopLevelComponent = ContainerBuilder | ContainerChild;

export interface DisplayPayload {
  components: TopLevelComponent[];
  files?: AttachmentBuilder[];
  flags: number;
  allowedMentions: { parse: ('users' | 'roles' | 'everyone')[] };
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(truncateText(content, 3900));
}

export function separator(
  spacing: SeparatorSpacingSize = SeparatorSpacingSize.Small,
  divider: boolean = true
): SeparatorBuilder {
  return new SeparatorBuilder().setSpacing(spacing).setDivider(divider);
}

export function section(options: {
  texts: (string | TextDisplayBuilder)[];
  thumbnail?: string;
  thumbnailDescription?: string;
  button?: ButtonBuilder;
}): SectionBuilder {
  const sec = new SectionBuilder();
  for (const item of options.texts.slice(0, 3)) {
    if (typeof item === 'string') {
      sec.addTextDisplayComponents(text(item));
    } else {
      sec.addTextDisplayComponents(item);
    }
  }
  if (options.button) {
    sec.setButtonAccessory(options.button);
  } else if (options.thumbnail) {
    sec.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(options.thumbnail)
        .setDescription(truncateText(options.thumbnailDescription || 'Avatar', 200))
    );
  }
  return sec;
}

export function mediaGallery(
  items: { url: string; description?: string; spoiler?: boolean }[]
): MediaGalleryBuilder {
  const gallery = new MediaGalleryBuilder();
  for (const item of items.slice(0, 10)) {
    const entry = new MediaGalleryItemBuilder().setURL(item.url);
    if (item.description) {
      entry.setDescription(truncateText(item.description, 200));
    }
    if (item.spoiler) {
      entry.setSpoiler(true);
    }
    gallery.addItems(entry);
  }
  return gallery;
}

export function fileComponent(attachmentName: string): FileBuilder {
  return new FileBuilder().setURL(`attachment://${attachmentName}`);
}

export function grayButton(options: {
  customId: string;
  label: string;
  emoji?: EmojiKey;
  disabled?: boolean;
}): ButtonBuilder {
  const btn = new ButtonBuilder()
    .setCustomId(options.customId)
    .setLabel(truncateText(options.label, 80))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(Boolean(options.disabled));

  if (options.emoji) {
    const emojiObj = emojiService.btn(options.emoji);
    if (emojiObj) {
      btn.setEmoji(emojiObj);
    }
  }
  return btn;
}

export function linkButton(options: {
  url: string;
  label: string;
  emoji?: EmojiKey;
}): ButtonBuilder {
  const btn = new ButtonBuilder()
    .setLabel(truncateText(options.label, 80))
    .setStyle(ButtonStyle.Link)
    .setURL(options.url);

  if (options.emoji) {
    const emojiObj = emojiService.btn(options.emoji);
    if (emojiObj) {
      btn.setEmoji(emojiObj);
    }
  }
  return btn;
}

export function createContainer(
  accentColor: number | null | undefined,
  children: (ContainerChild | null | undefined)[]
): ContainerBuilder {
  const container = new ContainerBuilder();
  if (accentColor !== null && accentColor !== undefined) {
    container.setAccentColor(accentColor);
  }
  for (const child of children) {
    if (!child) continue;
    if (child instanceof TextDisplayBuilder) {
      container.addTextDisplayComponents(child);
    } else if (child instanceof SeparatorBuilder) {
      container.addSeparatorComponents(child);
    } else if (child instanceof SectionBuilder) {
      container.addSectionComponents(child);
    } else if (child instanceof ActionRowBuilder) {
      container.addActionRowComponents(
        child as ActionRowBuilder<MessageActionRowComponentBuilder>
      );
    } else if (child instanceof MediaGalleryBuilder) {
      container.addMediaGalleryComponents(child);
    } else if (child instanceof FileBuilder) {
      container.addFileComponents(child);
    }
  }
  return container;
}

export function withDividerGallery(
  card: ContainerBuilder,
  includeDivider: boolean
): TopLevelComponent[] {
  if (!includeDivider) return [card];
  return [
    card,
    mediaGallery([{ url: 'attachment://divider.png', description: 'Divider' }]),
  ];
}

export function toDisplayPayload(
  containers: TopLevelComponent | TopLevelComponent[],
  options: { ephemeral?: boolean; files?: AttachmentBuilder[]; allowUserMentions?: boolean } = {}
): DisplayPayload {
  const list = Array.isArray(containers) ? containers : [containers];
  let flags = MessageFlags.IsComponentsV2;
  if (options.ephemeral) {
    flags |= MessageFlags.Ephemeral;
  }

  const payload: DisplayPayload = {
    components: list,
    flags,
    allowedMentions: {
      parse: options.allowUserMentions ? ['users'] : [],
    },
  };

  if (options.files && options.files.length > 0) {
    payload.files = options.files;
  }

  return payload;
}

export function buildStatusCard(
  kind: 'success' | 'error' | 'warn' | 'info',
  title: string,
  description: string,
  fields: { name: string; value: string }[] = []
): ContainerBuilder {
  const map: Record<typeof kind, { color: number; icon: EmojiKey }> = {
    success: { color: THEME_COLORS.success, icon: 'check' },
    error: { color: THEME_COLORS.danger, icon: 'cross' },
    warn: { color: THEME_COLORS.warning, icon: 'warn' },
    info: { color: THEME_COLORS.primary, icon: 'info' },
  };
  const cfg = map[kind];
  const icon = emojiService.get(cfg.icon);
  const header = icon ? `### ${icon} ${title}` : `### ${title}`;

  const items: ContainerChild[] = [
    text(`${header}\n${description}`),
  ];

  if (fields.length > 0) {
    items.push(separator(SeparatorSpacingSize.Small, true));
    items.push(
      text(fields.map((f) => `> **${f.name}** ── ${f.value}`).join('\n'))
    );
  }

  return createContainer(cfg.color, items);
}

export function buildFeedbackCard(options: {
  record: FeedbackRecord;
  avatarUrl: string;
  config: GuildConfig;
  mode: 'public' | 'queue' | 'detail';
  hasCardAttachment?: boolean;
  hasProofAttachment?: boolean;
  hasDividerAttachment?: boolean;
  canSelfEdit?: boolean;
  jumpUrl?: string | null;
}): ContainerBuilder {
  const { record, avatarUrl, config, mode } = options;
  const items: ContainerChild[] = [];

  if (options.hasCardAttachment) {
    const galleryItems: { url: string; description?: string }[] = [
      { url: 'attachment://feedback-card.png', description: `فيدباك ${record.code}` },
    ];
    if (options.hasProofAttachment) {
      galleryItems.push({ url: 'attachment://proof.png', description: `مرفق ${record.code}` });
    }
    items.push(mediaGallery(galleryItems));

    const metaParts: string[] = [
      `${emojiService.get('client')} <@${record.userId}>`,
      record.staffId ? `${emojiService.get('verified')} <@${record.staffId}>` : '',
      relativeTimestamp(record.createdAt),
      `\`${record.code}\``,
      record.editedAt ? '`معدّل`' : '',
    ].filter(Boolean);

    items.push(text(`-# ${metaParts.join(' ── ')}`));
  } else {
    const stars = emojiService.stars(record.rating, 5);
    const safeService = sanitizeDisplayText(record.service);

    const metaLines: string[] = [
      `**العميل** ── <@${record.userId}>`,
    ];
    if (record.staffId) {
      metaLines.push(`**المسؤول** ── <@${record.staffId}>`);
    }

    const timeLine = [
      relativeTimestamp(record.createdAt),
      `\`${record.code}\``,
      record.editedAt ? '`معدّل`' : null,
    ]
      .filter(Boolean)
      .join(' ── ');

    const headerTexts = [
      `# ${stars} │ **${safeService}**`,
      metaLines.join('\n'),
      `-# ${timeLine}`,
    ];

    items.push(
      section({
        texts: headerTexts,
        thumbnail: avatarUrl,
        thumbnailDescription: record.userTag,
      }),
      separator(SeparatorSpacingSize.Small, true),
      text(formatQuoteBlock(record.comment))
    );

    if (record.staffReply && record.staffReplyBy) {
      items.push(separator(SeparatorSpacingSize.Small, false));
      items.push(
        text(
          `### ${emojiService.get('reply')} **رد الإدارة** ── <@${record.staffReplyBy}>\n` +
            formatQuoteBlock(record.staffReply, 700)
        )
      );
    }

    if (options.hasProofAttachment) {
      items.push(separator(SeparatorSpacingSize.Small, false));
      items.push(
        mediaGallery([{ url: 'attachment://proof.png', description: `مرفق ${record.code}` }])
      );
    } else if (record.imageUrl && mode === 'detail') {
      items.push(separator(SeparatorSpacingSize.Small, false));
      items.push(
        mediaGallery([{ url: record.imageUrl, description: `مرفق ${record.code}` }])
      );
    }

    if (options.hasDividerAttachment) {
      items.push(separator(SeparatorSpacingSize.Small, false));
      items.push(mediaGallery([{ url: 'attachment://divider.png', description: 'Divider' }]));
    }
  }

  if (mode === 'queue') {
    items.push(separator(SeparatorSpacingSize.Small, true));
    items.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: `fb_approve:${record.id}`,
          label: 'قبول ونشر',
          emoji: 'check',
        }),
        grayButton({
          customId: `fb_reject:${record.id}`,
          label: 'رفض',
          emoji: 'cross',
        })
      )
    );
  } else if (mode === 'public' && config.allowHelpful) {
    items.push(separator(SeparatorSpacingSize.Small, false));
    const countSuffix = record.helpfulCount > 0 ? ` (${record.helpfulCount})` : '';
    items.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: `fb_helpful:${record.id}`,
          label: `مفيد${countSuffix}`,
          emoji: 'heart',
        })
      )
    );
  } else if (mode === 'detail') {
    const rowButtons: ButtonBuilder[] = [];
    if (options.canSelfEdit) {
      rowButtons.push(
        grayButton({
          customId: `fb_edit_open:${record.id}`,
          label: 'تعديل الفيدباك',
          emoji: 'edit',
        })
      );
    }
    if (options.jumpUrl) {
      rowButtons.push(
        linkButton({
          url: options.jumpUrl,
          label: 'الانتقال للرسالة',
          emoji: 'search',
        })
      );
    }
    if (rowButtons.length > 0) {
      items.push(separator(SeparatorSpacingSize.Small, true));
      items.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...rowButtons));
    }
  }

  const accent =
    mode === 'queue'
      ? THEME_COLORS.warning
      : RATING_COLORS[record.rating] ?? config.accentColor ?? THEME_COLORS.gold;

  return createContainer(accent, items);
}
