import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  Guild,
  RoleSelectMenuBuilder,
  SendableChannels,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_COLORS } from '../config/theme.js';
import { GuildConfig, guildConfigRepo } from '../database/repositories/guildConfigRepo.js';
import { feedbackRepo } from '../database/repositories/feedbackRepo.js';
import { emojiService } from './emojiService.js';
import {
  ContainerChild,
  DisplayPayload,
  createContainer,
  grayButton,
  linkButton,
  mediaGallery,
  section,
  separator,
  text,
  toDisplayPayload,
} from '../utils/components.js';
import { logger } from '../utils/logger.js';

export type SetupTab = 'channels' | 'rules' | 'services';

const stickyLocks = new Map<string, Promise<void>>();

export const panelService = {
  buildPublicPanelPayload(guild: Guild, config: GuildConfig): DisplayPayload {
    const stats = feedbackRepo.getStats(guild.id);
    const bannerPath = path.resolve(process.cwd(), 'assets', 'banner.png');
    const dividerPath = path.resolve(process.cwd(), 'assets', 'divider.png');
    const files: AttachmentBuilder[] = [];

    const hasBanner = fs.existsSync(bannerPath);
    const hasDivider = fs.existsSync(dividerPath);

    if (hasBanner) {
      files.push(new AttachmentBuilder(bannerPath, { name: 'banner.png' }));
    }
    if (hasDivider) {
      files.push(new AttachmentBuilder(dividerPath, { name: 'divider.png' }));
    }

    const avgDisplay = stats.total > 0 ? `${stats.average.toFixed(1)} / 5.0` : '5.0 / 5.0';
    const starDisplay = emojiService.stars(stats.total > 0 ? Math.round(stats.average) : 5, 5);

    const bodyLines = [
      `# ${emojiService.get('star')} **آراء وفيدباك العملاء ── ${guild.name}**`,
      `شاركنا تجربتك بعد استلام خدمتك لنساهم معا في رفع جودة العمل`,
      ``,
      `> ${emojiService.get('chart')} **متوسط التقييم** ── \`${avgDisplay}\` ${starDisplay}`,
      `> ${emojiService.get('chat')} **عدد التقييمات** ── \`${stats.total} تقييم\``,
      `> ${emojiService.get('verified')} **نسبة الرضا** ── \`${stats.satisfactionRate}%\``,
      ``,
      `◂ اضغط على **كتابة فيدباك** بالأسفل أو استخدم الأمر \`/feedback\``,
      `◂ لتصفح جميع الآراء والإحصائيات استخدم الأمر \`/reviews\``,
      config.requireClientRole && config.clientRoleId
        ? `-# ${emojiService.get('shield')} كتابة الفيدباك مقتصرة على أصحاب رتبة <@&${config.clientRoleId}>`
        : null,
    ].filter((line): line is string => line !== null);

    const items: ContainerChild[] = [];
    if (hasBanner) {
      items.push(mediaGallery([{ url: 'attachment://banner.png', description: guild.name }]));
      items.push(separator(SeparatorSpacingSize.Small, true));
    }

    items.push(text(bodyLines.join('\n')));
    items.push(separator(SeparatorSpacingSize.Small, true));
    items.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: 'fb_open_modal',
          label: 'كتابة فيدباك',
          emoji: 'edit',
        }),
        grayButton({
          customId: 'fb_panel_browse',
          label: 'تصفح الآراء',
          emoji: 'search',
        }),
        grayButton({
          customId: 'fb_panel_stats',
          label: 'الإحصائيات',
          emoji: 'chart',
        })
      )
    );

    if (hasDivider) {
      items.push(separator(SeparatorSpacingSize.Small, false));
      items.push(mediaGallery([{ url: 'attachment://divider.png', description: 'Divider' }]));
    }

    const container = createContainer(config.accentColor || THEME_COLORS.primary, items);
    return toDisplayPayload(container, { files });
  },

  buildStickyMessagePayload(guild: Guild, config: GuildConfig): DisplayPayload {
    const stats = feedbackRepo.getStats(guild.id);
    const avgDisplay = stats.total > 0 ? `${stats.average.toFixed(1)} / 5.0` : '5.0 / 5.0';
    const jumpUrl =
      config.panelChannelId && config.panelMessageId
        ? `https://discord.com/channels/${guild.id}/${config.panelChannelId}/${config.panelMessageId}`
        : null;

    const lines = [
      `### ${emojiService.get('edit')} **شاركنا تقييمك وتجربتك**`,
      config.autoFeedback
        ? `> اكتب رأيك مباشرة هنا ليتحول تلقائياً إلى بطاقة فيدباك`
        : `> اضغط على الزر بالأسفل لكتابة تقييمك للخدمة`,
      `-# ${emojiService.get('star')} \`${avgDisplay}\` ── \`${stats.total} تقييم\` ── نسبة الرضا \`${stats.satisfactionRate}%\``,
    ];

    const buttons: ButtonBuilder[] = [];
    if (jumpUrl) {
      buttons.push(
        linkButton({
          url: jumpUrl,
          label: 'الانتقال للوحة',
          emoji: 'pin',
        })
      );
    }
    buttons.push(
      grayButton({
        customId: 'fb_open_modal',
        label: 'كتابة فيدباك',
        emoji: 'edit',
      })
    );

    const container = createContainer(config.accentColor || THEME_COLORS.primary, [
      text(lines.join('\n')),
      separator(SeparatorSpacingSize.Small, true),
      new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
    ]);

    return toDisplayPayload(container);
  },

  async updatePanelStatsInPlace(guild: Guild, config: GuildConfig): Promise<void> {
    if (!config.panelChannelId || !config.panelMessageId) return;
    const panelCh = await guild.channels.fetch(config.panelChannelId).catch(() => null);
    if (!panelCh || !panelCh.isTextBased()) return;
    const panelMsg = await panelCh.messages.fetch(config.panelMessageId).catch(() => null);
    if (!panelMsg) return;

    const updatedPanel = this.buildPublicPanelPayload(guild, config);
    await panelMsg
      .edit({
        components: updatedPanel.components,
        flags: updatedPanel.flags,
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
  },

  async publishPanel(
    guild: Guild,
    targetChannelId: string
  ): Promise<{ channelId: string; messageId: string }> {
    const config = guildConfigRepo.getOrCreate(guild.id);
    const fetched = await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!fetched || !fetched.isTextBased() || !fetched.isSendable()) {
      throw new Error('Selected panel channel is not text-based or inaccessible');
    }
    const textChannel = fetched as SendableChannels;

    if (config.stickyMessageId) {
      const oldStickyChId = config.feedbackChannelId || config.panelChannelId || targetChannelId;
      const oldStickyCh = await guild.channels.fetch(oldStickyChId).catch(() => null);
      if (oldStickyCh && oldStickyCh.isTextBased()) {
        const oldSticky = await oldStickyCh.messages.fetch(config.stickyMessageId).catch(() => null);
        if (oldSticky) {
          await oldSticky.delete().catch(() => undefined);
        }
      }
    }

    if (config.panelChannelId === targetChannelId && config.panelMessageId) {
      const oldMsg = await textChannel.messages.fetch(config.panelMessageId).catch(() => null);
      if (oldMsg) {
        await oldMsg.delete().catch(() => undefined);
      }
    }

    const payload = this.buildPublicPanelPayload(guild, config);
    const sent = await textChannel.send(payload);

    const updated = guildConfigRepo.update(guild.id, {
      panelChannelId: targetChannelId,
      panelMessageId: sent.id,
      stickyMessageId: null,
      ...(!config.feedbackChannelId ? { feedbackChannelId: targetChannelId } : {}),
    });

    if (updated.stickyPanel) {
      await this.refreshStickyPanel(guild);
    }

    return { channelId: targetChannelId, messageId: sent.id };
  },

  async syncTopPanel(guild: Guild): Promise<void> {
    const config = guildConfigRepo.getOrCreate(guild.id);
    await this.updatePanelStatsInPlace(guild, config);

    if (config.stickyPanel && config.stickyMessageId) {
      const stickyChId = config.feedbackChannelId || config.panelChannelId;
      if (!stickyChId) return;
      const stickyCh = await guild.channels.fetch(stickyChId).catch(() => null);
      if (!stickyCh || !stickyCh.isTextBased()) return;
      const stickyMsg = await stickyCh.messages.fetch(config.stickyMessageId).catch(() => null);
      if (!stickyMsg) return;

      const updatedSticky = this.buildStickyMessagePayload(guild, config);
      await stickyMsg
        .edit({
          components: updatedSticky.components,
          flags: updatedSticky.flags,
          allowedMentions: { parse: [] },
        })
        .catch(() => undefined);
    }
  },

  async refreshStickyPanel(guild: Guild): Promise<void> {
    const previous = stickyLocks.get(guild.id) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const config = guildConfigRepo.getOrCreate(guild.id);
        await this.updatePanelStatsInPlace(guild, config);

        const targetChannelId = config.feedbackChannelId || config.panelChannelId;
        if (!targetChannelId) return;

        const ch = await guild.channels.fetch(targetChannelId).catch(() => null);
        if (!ch || !ch.isTextBased() || !ch.isSendable()) return;

        if (config.stickyMessageId && config.stickyMessageId !== config.panelMessageId) {
          const oldSticky = await ch.messages.fetch(config.stickyMessageId).catch(() => null);
          if (oldSticky) {
            await oldSticky.delete().catch(() => undefined);
          }
        }

        if (!config.stickyPanel) {
          if (config.stickyMessageId) {
            guildConfigRepo.update(guild.id, { stickyMessageId: null });
          }
          return;
        }

        const stickyPayload = this.buildStickyMessagePayload(guild, config);
        const sentSticky = await (ch as SendableChannels).send(stickyPayload).catch(() => null);
        if (sentSticky) {
          guildConfigRepo.update(guild.id, { stickyMessageId: sentSticky.id });
        }
      });

    stickyLocks.set(guild.id, next);
    await next;
  },

  buildAdminSetupContainer(
    guild: Guild,
    config: GuildConfig,
    tab: SetupTab = 'channels'
  ): ContainerBuilder {
    const guildIcon = guild.iconURL({ extension: 'png', size: 128 });
    const flagText = (enabled: boolean) =>
      enabled ? `${emojiService.get('check')} مفعل` : `${emojiService.get('cross')} معطل`;

    const children: ContainerChild[] = [
      guildIcon
        ? section({
            texts: [
              `# ${emojiService.get('settings')} لوحة إعدادات الفيدباك ── ${guild.name}`,
              `-# تحكم كامل بالقنوات والرتب والقيود والخدمات`,
            ],
            thumbnail: guildIcon,
            thumbnailDescription: guild.name,
          })
        : text(
            `# ${emojiService.get('settings')} لوحة إعدادات الفيدباك ── ${guild.name}\n-# تحكم كامل بالقنوات والرتب والقيود والخدمات`
          ),
      separator(SeparatorSpacingSize.Small, true),
    ];

    if (tab === 'channels') {
      const summary = [
        `### ${emojiService.get('pin')} **القنوات والرتب الحالية**`,
        `> ${emojiService.get('chat')} **روم الفيدباك التلقائي** ── ${config.feedbackChannelId ? `<#${config.feedbackChannelId}>` : '`غير محدد`'}`,
        `> ${emojiService.get('clock')} **روم المراجعة** ── ${config.approvalChannelId ? `<#${config.approvalChannelId}>` : '`غير محدد`'}`,
        `> ${emojiService.get('doc')} **روم السجلات** ── ${config.logChannelId ? `<#${config.logChannelId}>` : '`غير محدد`'}`,
        `> ${emojiService.get('client')} **رتبة العميل** ── ${config.clientRoleId ? `<@&${config.clientRoleId}>` : '`غير محددة`'}`,
        `> ${emojiService.get('crown')} **رتبة الإدارة** ── ${config.staffRoleId ? `<@&${config.staffRoleId}>` : '`صلاحية ManageGuild فقط`'}`,
      ].join('\n');

      children.push(text(summary));
      children.push(separator(SeparatorSpacingSize.Small, false));

      children.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('fb_cfg_ch_feedback')
            .setPlaceholder('اختر روم الفيدباك التلقائي والنشر')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
      );
      children.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('fb_cfg_ch_approval')
            .setPlaceholder('اختر روم مراجعة الطلبات قبل النشر')
            .setChannelTypes(ChannelType.GuildText)
        )
      );
      children.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('fb_cfg_ch_log')
            .setPlaceholder('اختر روم سجلات الفيدباك')
            .setChannelTypes(ChannelType.GuildText)
        )
      );
      children.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('fb_cfg_role_client')
            .setPlaceholder('اختر رتبة العميل المعتمد')
        )
      );
    } else if (tab === 'rules') {
      const summary = [
        `### ${emojiService.get('shield')} **القيود والمزايا النشطة**`,
        `> **التحويل التلقائي بالروم** ── ${flagText(config.autoFeedback)}`,
        `> **بطاقات الفيدباك كانفاس** ── ${flagText(config.useCanvasCard)}`,
        `> **اشتراط رتبة العميل** ── ${flagText(config.requireClientRole)}`,
        `> **المراجعة قبل النشر** ── ${flagText(config.requireApproval)}`,
        `> **رسالة Sticky برابط اللوحة** ── ${flagText(config.stickyPanel)}`,
        `> **منع الشات عند إيقاف التلقائي** ── ${flagText(config.strictChannel)}`,
        `> **زر مفيد على البطاقات** ── ${flagText(config.allowHelpful)}`,
        `> **السماح بتعديل الفيدباك** ── ${flagText(config.allowSelfEdit)}`,
        `> **إشعار العميل بالخاص** ── ${flagText(config.dmOnStatus)}`,
        `> **بطاقة إحصائيات كانفاس** ── ${flagText(config.useCanvasStats)}`,
        `> **الحد الأدنى للأحرف** ── \`${config.minCommentLength}\` ◂ **فترة التهدئة** ── \`${config.cooldownMinutes} دقيقة\``,
      ].join('\n');

      children.push(text(summary));
      children.push(separator(SeparatorSpacingSize.Small, false));

      children.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          grayButton({
            customId: 'fb_toggle:autoFeedback',
            label: 'تحويل تلقائي',
            emoji: config.autoFeedback ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:useCanvasCard',
            label: 'بطاقة كانفاس',
            emoji: config.useCanvasCard ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:requireClientRole',
            label: 'رتبة العميل',
            emoji: config.requireClientRole ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:requireApproval',
            label: 'مراجعة قبل النشر',
            emoji: config.requireApproval ? 'check' : 'cross',
          })
        )
      );

      children.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          grayButton({
            customId: 'fb_toggle:stickyPanel',
            label: 'رسالة Sticky',
            emoji: config.stickyPanel ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:strictChannel',
            label: 'منع الشات',
            emoji: config.strictChannel ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:allowHelpful',
            label: 'زر مفيد',
            emoji: config.allowHelpful ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:allowSelfEdit',
            label: 'تعديل العميل',
            emoji: config.allowSelfEdit ? 'check' : 'cross',
          })
        )
      );

      children.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          grayButton({
            customId: 'fb_toggle:useCanvasStats',
            label: 'إحصائيات كانفاس',
            emoji: config.useCanvasStats ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_toggle:dmOnStatus',
            label: 'إشعار الخاص',
            emoji: config.dmOnStatus ? 'check' : 'cross',
          }),
          grayButton({
            customId: 'fb_cfg_limits_modal',
            label: 'الحدود والتهدئة',
            emoji: 'clock',
          })
        )
      );

      children.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('fb_cfg_role_staff')
            .setPlaceholder('تحديد رتبة الإدارة وطاقم العمل')
        )
      );
    } else {
      const list =
        config.services.length > 0
          ? config.services.map((s, i) => `> \`${i + 1}\` ── **${s}**`).join('\n')
          : `> لا توجد خدمات مضافة حالياً`;
      children.push(
        text(
          `### ${emojiService.get('tag')} **قائمة الخدمات المتاحة (${config.services.length}/20)**\n` +
            list
        )
      );
      children.push(separator(SeparatorSpacingSize.Small, false));

      if (config.services.length > 0) {
        const seenValues = new Set<string>();
        const options = config.services
          .slice(0, 20)
          .map((s) => {
            const label = s.trim().slice(0, 100);
            const valKey = label.toLowerCase();
            if (!label || seenValues.has(valKey)) return null;
            seenValues.add(valKey);
            return {
              label,
              value: label,
              emoji: emojiService.btn('trash'),
            };
          })
          .filter((o): o is NonNullable<typeof o> => o !== null);

        if (options.length > 0) {
          children.push(
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('fb_cfg_service_remove')
                .setPlaceholder('اختر خدمة أو أكثر لحذفها من القائمة')
                .setMinValues(1)
                .setMaxValues(options.length)
                .addOptions(options)
            )
          );
        }
      }

      children.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          grayButton({
            customId: 'fb_cfg_service_add',
            label: 'إضافة خدمة',
            emoji: 'send',
            disabled: config.services.length >= 20,
          }),
          grayButton({
            customId: 'fb_cfg_services_reset',
            label: 'الافتراضي',
            emoji: 'refresh',
          }),
          grayButton({
            customId: 'fb_cfg_services_clear',
            label: 'حذف الكل',
            emoji: 'trash',
            disabled: config.services.length === 0,
          })
        )
      );
    }

    children.push(separator(SeparatorSpacingSize.Small, true));
    children.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        grayButton({
          customId: 'fb_setup_tab:channels',
          label: 'القنوات والرتب',
          emoji: 'pin',
          disabled: tab === 'channels',
        }),
        grayButton({
          customId: 'fb_setup_tab:rules',
          label: 'القيود والمزايا',
          emoji: 'shield',
          disabled: tab === 'rules',
        }),
        grayButton({
          customId: 'fb_setup_tab:services',
          label: 'الخدمات',
          emoji: 'tag',
          disabled: tab === 'services',
        }),
        grayButton({
          customId: 'fb_setup_publish_panel',
          label: 'نشر اللوحة الآن',
          emoji: 'sparkles',
          disabled: !config.feedbackChannelId,
        })
      )
    );

    return createContainer(config.accentColor || THEME_COLORS.primary, children);
  },
};
