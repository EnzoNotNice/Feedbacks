import {
  ActionRowBuilder,
  AttachmentBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SeparatorSpacingSize,
  SlashCommandBuilder,
} from 'discord.js';
import { THEME_COLORS } from '../../config/theme.js';
import { blacklistRepo } from '../../database/repositories/blacklistRepo.js';
import { feedbackRepo } from '../../database/repositories/feedbackRepo.js';
import { guildConfigRepo } from '../../database/repositories/guildConfigRepo.js';
import { emojiService } from '../../services/emojiService.js';
import { feedbackService } from '../../services/feedbackService.js';
import { logService } from '../../services/logService.js';
import { panelService } from '../../services/panelService.js';
import { SlashCommand } from '../../structures/Command.js';
import {
  buildStatusCard,
  createContainer,
  fileComponent,
  linkButton,
  separator,
  text,
  toDisplayPayload,
} from '../../utils/components.js';
import {
  isFeedbackStaff,
  isGuildAdmin,
  resolveInteractionMember,
} from '../../utils/permissions.js';

export const feedbackAdminCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('feedback-admin')
    .setDescription('إدارة وإعدادات نظام الفيدباك')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('لوحة الإعدادات التفاعلية')
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('تحديد روم الفيدباك التلقائي')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('روم نشر واستقبال الفيدباك')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('auto')
            .setDescription('تحويل رسائل الروم لكانفاس')
            .setRequired(false)
        )
        .addChannelOption((opt) =>
          opt
            .setName('logs')
            .setDescription('روم سجلات الفيدباك')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName('panel')
            .setDescription('نشر لوحة الفيدباك بالروم')
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('إرسال لوحة الفيدباك')
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('الروم المطلوب نشر اللوحة فيه')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('client')
        .setDescription('منح أو سحب رتبة العميل')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('الإجراء المطلوب')
            .setRequired(true)
            .addChoices(
              { name: 'منح الرتبة', value: 'add' },
              { name: 'سحب الرتبة', value: 'remove' }
            )
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('العضو المستهدف').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('request')
        .setDescription('إرسال دعوة فيدباك لعميل')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('العميل المطلوب').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('service')
            .setDescription('اسم الخدمة')
            .setAutocomplete(true)
            .setRequired(false)
        )
        .addUserOption((opt) =>
          opt.setName('staff').setDescription('المسؤول عن التنفيذ').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reply')
        .setDescription('إضافة رد رسمي على فيدباك')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('معرف الفيدباك')
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('message').setDescription('نص الرد').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('حذف فيدباك محدد')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('معرف الفيدباك')
            .setAutocomplete(true)
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('سبب الحذف').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('services')
        .setDescription('إدارة قائمة الخدمات')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('الإجراء المطلوب')
            .setRequired(true)
            .addChoices(
              { name: 'عرض الخدمات', value: 'list' },
              { name: 'إضافة خدمة', value: 'add' },
              { name: 'حذف خدمة', value: 'remove' },
              { name: 'استعادة الافتراضي', value: 'reset' },
              { name: 'حذف الكل', value: 'clear' }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('اسم الخدمة')
            .setAutocomplete(true)
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('blacklist')
        .setDescription('إدارة حظر الفيدباك')
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('الإجراء المطلوب')
            .setRequired(true)
            .addChoices(
              { name: 'حظر عضو', value: 'add' },
              { name: 'رفع الحظر', value: 'remove' },
              { name: 'عرض المحظورين', value: 'list' }
            )
        )
        .addUserOption((opt) =>
          opt.setName('user').setDescription('العضو المستهدف').setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('سبب الحظر').setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('تصدير بيانات التقييمات')
        .addStringOption((opt) =>
          opt
            .setName('format')
            .setDescription('صيغة الملف')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'CSV', value: 'csv' }
            )
        )
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    const q = focused.value.toLowerCase();

    if (focused.name === 'service' || focused.name === 'name') {
      const sub = interaction.options.getSubcommand(false);
      if (sub === 'services') {
        const action = interaction.options.getString('action');
        if (action && action !== 'remove') {
          await interaction.respond([]);
          return;
        }
      }
      const cfg = guildConfigRepo.getOrCreate(interaction.guildId);
      const list = cfg.services
        .filter((s) => s.toLowerCase().includes(q))
        .slice(0, 25)
        .map((s) => ({ name: s.slice(0, 100), value: s.slice(0, 100) }));
      await interaction.respond(list);
      return;
    }

    if (focused.name === 'id') {
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
    const member = resolveInteractionMember(interaction);
    const sub = interaction.options.getSubcommand();

    const staffAllowedSubs = new Set(['client', 'request', 'reply']);
    const hasAccess = staffAllowedSubs.has(sub)
      ? isFeedbackStaff(member, config, interaction.memberPermissions)
      : isGuildAdmin(member, interaction.memberPermissions);

    if (!hasAccess) {
      const card = buildStatusCard(
        'error',
        'صلاحية غير كافية',
        'لا تملك الصلاحية المطلوبة لاستخدام هذا الأمر'
      );
      await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      return;
    }

    if (sub === 'setup') {
      const setupContainer = panelService.buildAdminSetupContainer(guild, config, 'channels');
      await interaction.reply(toDisplayPayload(setupContainer, { ephemeral: true }));
      return;
    }

    if (sub === 'channel') {
      const chosen = interaction.options.getChannel('channel', true);
      const autoOpt = interaction.options.getBoolean('auto');
      const logsChannel = interaction.options.getChannel('logs');
      const panelOpt = interaction.options.getBoolean('panel');
      const shouldPublishPanel =
        panelOpt !== null
          ? panelOpt
          : !config.panelMessageId || config.panelChannelId !== chosen.id;

      await interaction.deferReply({
        flags: toDisplayPayload(buildStatusCard('info', 'جاري الحفظ', 'يرجى الانتظار'), {
          ephemeral: true,
        }).flags,
      });

      const updated = guildConfigRepo.update(guild.id, {
        feedbackChannelId: chosen.id,
        autoFeedback: autoOpt ?? true,
        useCanvasCard: true,
        ...(logsChannel ? { logChannelId: logsChannel.id } : {}),
      });

      if (shouldPublishPanel) {
        await panelService.publishPanel(guild, chosen.id);
      }

      const fields: { name: string; value: string }[] = [
        { name: 'روم الفيدباك', value: `<#${chosen.id}>` },
        {
          name: 'التحويل التلقائي للكانفاس',
          value: updated.autoFeedback ? 'مفعل' : 'معطل',
        },
      ];
      if (updated.logChannelId) {
        fields.push({ name: 'روم السجلات', value: `<#${updated.logChannelId}>` });
      }
      if (shouldPublishPanel) {
        fields.push({ name: 'اللوحة', value: 'تم نشرها في أعلى الروم مع sticky message' });
      }

      const card = buildStatusCard(
        'success',
        'تم تحديد روم الفيدباك',
        updated.autoFeedback
          ? `أي رسالة تقييم يكتبها العضو في <#${chosen.id}> ستتحول تلقائياً إلى بطاقة فيدباك بالكانفاس`
          : `تم اعتماد <#${chosen.id}> كروم لنشر الفيدباك`,
        fields
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    if (sub === 'panel') {
      const chosen = interaction.options.getChannel('channel');
      const targetChannelId = chosen?.id || config.feedbackChannelId || interaction.channelId;

      await interaction.deferReply({
        flags: toDisplayPayload(buildStatusCard('info', 'جاري النشر', 'يرجى الانتظار'), {
          ephemeral: true,
        }).flags,
      });

      const published = await panelService.publishPanel(guild, targetChannelId);
      const jump = `https://discord.com/channels/${guild.id}/${published.channelId}/${published.messageId}`;
      const card = buildStatusCard(
        'success',
        'تم نشر لوحة الفيدباك',
        `تم إرسال اللوحة في <#${published.channelId}> بنجاح`
      );
      card.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          linkButton({ url: jump, label: 'الانتقال للوحة', emoji: 'search' })
        )
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    if (sub === 'client') {
      const action = interaction.options.getString('action', true);
      const targetUser = interaction.options.getUser('user', true);
      if (!config.clientRoleId) {
        const card = buildStatusCard(
          'error',
          'الرتبة غير محددة',
          'يرجى تحديد رتبة العميل أولاً من `/feedback-admin setup`'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      const role = await guild.roles.fetch(config.clientRoleId).catch(() => null);
      if (!role) {
        const card = buildStatusCard(
          'error',
          'الرتبة غير موجودة',
          'تعذر العثور على رتبة العميل المحددة في السيرفر'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        const card = buildStatusCard(
          'error',
          'العضو غير موجود',
          'تعذر العثور على هذا العضو داخل السيرفر'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (action === 'add') {
        await targetMember.roles.add(role);
        await logService.sendActionLog({
          guild,
          config,
          type: 'CLIENT_ADDED',
          targetUserId: targetMember.id,
          actorId: interaction.user.id,
          avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
        });
        const card = buildStatusCard(
          'success',
          'تم منح رتبة العميل',
          `تم منح رتبة <@&${role.id}> للعضو <@${targetMember.id}> بنجاح`
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      } else {
        await targetMember.roles.remove(role);
        await logService.sendActionLog({
          guild,
          config,
          type: 'CLIENT_REMOVED',
          targetUserId: targetMember.id,
          actorId: interaction.user.id,
          avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
        });
        const card = buildStatusCard(
          'success',
          'تم سحب رتبة العميل',
          `تمت إزالة رتبة <@&${role.id}> من العضو <@${targetMember.id}>`
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      }
      return;
    }

    if (sub === 'request') {
      const targetUser = interaction.options.getUser('user', true);
      const service = interaction.options.getString('service') || undefined;
      const staff = interaction.options.getUser('staff');
      await feedbackService.sendFeedbackPrompt(interaction, targetUser, service, staff);
      return;
    }

    if (sub === 'reply') {
      const code = interaction.options.getString('id', true);
      const message = interaction.options.getString('message', true);
      const record = feedbackRepo.findByCode(guild.id, code);
      if (!record || record.status !== 'PUBLISHED') {
        const card = buildStatusCard(
          'error',
          'فيدباك غير موجود',
          `تعذر العثور على فيدباك منشور بالمعرف \`${code}\``
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      await interaction.deferReply({
        flags: toDisplayPayload(buildStatusCard('info', 'جاري النشر', 'يرجى الانتظار'), {
          ephemeral: true,
        }).flags,
      });

      const updated = await feedbackService.replyFeedback(
        guild,
        record,
        interaction.user.id,
        message
      );
      const card = buildStatusCard(
        'success',
        'تم نشر الرد الرسمي',
        `تمت إضافة رد الإدارة على الفيدباك \`${updated.code}\``
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    if (sub === 'delete') {
      const code = interaction.options.getString('id', true);
      const reason = interaction.options.getString('reason') || 'حذف إداري';
      const record = feedbackRepo.findByCode(guild.id, code);
      if (!record || record.status === 'DELETED') {
        const card = buildStatusCard(
          'error',
          'فيدباك غير موجود',
          `تعذر العثور على فيدباك بالمعرف \`${code}\``
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      await interaction.deferReply({
        flags: toDisplayPayload(buildStatusCard('info', 'جاري الحذف', 'يرجى الانتظار'), {
          ephemeral: true,
        }).flags,
      });

      await feedbackService.deleteFeedback(guild, record, interaction.user.id, reason);
      const card = buildStatusCard(
        'success',
        'تم حذف الفيدباك',
        `تم حذف الفيدباك \`${record.code}\` بنجاح`,
        [{ name: 'السبب', value: reason }]
      );
      await interaction.editReply(toDisplayPayload(card));
      return;
    }

    if (sub === 'services') {
      const action = interaction.options.getString('action', true);
      const name = interaction.options.getString('name') || '';

      if (action === 'list') {
        const lines =
          config.services.length > 0
            ? config.services.map((s, i) => `> \`${i + 1}\` ── **${s}**`).join('\n')
            : '> لا توجد خدمات مضافة حالياً';
        const card = buildStatusCard(
          'info',
          `الخدمات المعتمدة (${config.services.length}/20)`,
          lines
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (action === 'clear') {
        guildConfigRepo.update(guild.id, { services: [] });
        const card = buildStatusCard(
          'success',
          'تم تفريغ قائمة الخدمات',
          'تم حذف جميع الخدمات المحددة بنجاح'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (action === 'reset') {
        const restored = guildConfigRepo.resetDefaultServices(guild.id);
        const card = buildStatusCard(
          'success',
          'تمت استعادة الخدمات الافتراضية',
          restored.map((s, i) => `> \`${i + 1}\` ── **${s}**`).join('\n')
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (!name.trim()) {
        const card = buildStatusCard(
          'error',
          'اسم الخدمة مطلوب',
          'يرجى تحديد اسم الخدمة في خيار `name`'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (action === 'add') {
        const res = guildConfigRepo.addServices(guild.id, name);
        if (res.added.length === 0) {
          const title = res.limitReached
            ? 'تم الوصول للحد الأقصى'
            : res.skippedDuplicates > 0
              ? 'الخدمة موجودة مسبقاً'
              : 'اسم غير صالح';
          const desc = res.limitReached
            ? 'الحد الأقصى للخدمات هو 20 خدمة يرجى حذف خدمة أولاً'
            : res.skippedDuplicates > 0
              ? `الخدمة **${name.trim()}** مسجلة بالفعل`
              : 'يرجى كتابة اسم خدمة صالح';
          await interaction.reply(
            toDisplayPayload(buildStatusCard('warn', title, desc), { ephemeral: true })
          );
          return;
        }
        const card = buildStatusCard(
          'success',
          'تمت إضافة الخدمة',
          `تمت إضافة ${res.added.map((s) => `**${s}**`).join(' ◂ ')} (${res.services.length}/20)`
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      } else {
        const res = guildConfigRepo.removeServices(guild.id, [name]);
        const card =
          res.removedCount > 0
            ? buildStatusCard(
                'success',
                'تم حذف الخدمة',
                `تمت إزالة **${name.trim()}** من القائمة (${res.services.length}/20)`
              )
            : buildStatusCard(
                'warn',
                'غير موجودة',
                `لم يتم العثور على خدمة باسم **${name.trim()}**`
              );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      }
      return;
    }

    if (sub === 'blacklist') {
      const action = interaction.options.getString('action', true);
      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'مخالفة شروط الاستخدام';

      if (action === 'list') {
        const entries = blacklistRepo.list(guild.id);
        const desc =
          entries.length > 0
            ? entries
                .slice(0, 20)
                .map((e, i) => `> \`${i + 1}\` <@${e.userId}> ── ${e.reason}`)
                .join('\n')
            : 'لا يوجد أعضاء محظورون حالياً';
        const card = buildStatusCard('info', 'قائمة حظر الفيدباك', desc);
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (!targetUser) {
        const card = buildStatusCard(
          'error',
          'العضو مطلوب',
          'يرجى تحديد العضو المطلوب في خيار `user`'
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
        return;
      }

      if (action === 'add') {
        blacklistRepo.add(guild.id, targetUser.id, interaction.user.id, reason);
        await logService.sendActionLog({
          guild,
          config,
          type: 'BLACKLISTED',
          targetUserId: targetUser.id,
          actorId: interaction.user.id,
          reason,
          avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
        });
        const card = buildStatusCard(
          'success',
          'تم حظر العضو',
          `تم منع <@${targetUser.id}> من إرسال الفيدباك`,
          [{ name: 'السبب', value: reason }]
        );
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      } else {
        const removed = blacklistRepo.remove(guild.id, targetUser.id);
        if (removed) {
          await logService.sendActionLog({
            guild,
            config,
            type: 'UNBLACKLISTED',
            targetUserId: targetUser.id,
            actorId: interaction.user.id,
            avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 128 }),
          });
        }
        const card = removed
          ? buildStatusCard('success', 'تم رفع الحظر', `تم فك حظر الفيدباك عن <@${targetUser.id}>`)
          : buildStatusCard('warn', 'غير محظور', `العضو <@${targetUser.id}> غير مدرج في قائمة الحظر`);
        await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
      }
      return;
    }

    if (sub === 'export') {
      const format = interaction.options.getString('format') || 'json';
      const records = feedbackRepo.getAllForExport(guild.id);
      let fileBuffer: Buffer;
      let fileName: string;

      if (format === 'csv') {
        const header = 'code,userId,userTag,staffId,service,rating,status,helpfulCount,createdAt,comment,staffReply';
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        const rows = records.map((r) =>
          [
            esc(r.code),
            esc(r.userId),
            esc(r.userTag),
            esc(r.staffId ?? ''),
            esc(r.service),
            r.rating,
            esc(r.status),
            r.helpfulCount,
            new Date(r.createdAt).toISOString(),
            esc(r.comment),
            esc(r.staffReply ?? ''),
          ].join(',')
        );
        fileBuffer = Buffer.from(`\uFEFF${[header, ...rows].join('\n')}`, 'utf-8');
        fileName = `feedbacks-${guild.id}.csv`;
      } else {
        fileBuffer = Buffer.from(JSON.stringify(records, null, 2), 'utf-8');
        fileName = `feedbacks-${guild.id}.json`;
      }

      const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });
      const container = createContainer(THEME_COLORS.primary, [
        text(
          `# ${emojiService.get('export')} تصدير بيانات الفيدباك\n` +
            `> **عدد السجلات** ── \`${records.length}\` ◂ **الصيغة** ── \`${format.toUpperCase()}\``
        ),
        separator(SeparatorSpacingSize.Small, true),
        fileComponent(fileName),
      ]);

      await interaction.reply(
        toDisplayPayload(container, { ephemeral: true, files: [attachment] })
      );
    }
  },
};
