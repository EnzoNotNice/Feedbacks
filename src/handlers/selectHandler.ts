import { AnySelectMenuInteraction } from 'discord.js';
import { guildConfigRepo } from '../database/repositories/guildConfigRepo.js';
import { panelService } from '../services/panelService.js';
import {
  ReviewSortMode,
  decodeServiceFilter,
  reviewsViewService,
} from '../services/reviewsViewService.js';
import { buildStatusCard, toDisplayPayload } from '../utils/components.js';
import { isGuildAdmin, resolveInteractionMember } from '../utils/permissions.js';

export async function handleSelectInteraction(
  interaction: AnySelectMenuInteraction
): Promise<void> {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const config = guildConfigRepo.getOrCreate(guild.id);
  const member = resolveInteractionMember(interaction);
  const id = interaction.customId;

  if (id === 'fb_help_category' && interaction.isStringSelectMenu()) {
    const val = interaction.values[0];
    const cat =
      val === 'client' || val === 'browse' || val === 'admin' ? val : 'all';
    await interaction.update(reviewsViewService.buildHelpPayload(guild, cat));
    return;
  }

  if (id.startsWith('fb_rev_filter:') && interaction.isStringSelectMenu()) {
    const [, ratingStr, sortStr, userStr, svcToken] = id.split(':');
    const selected = interaction.values[0] || '';
    const [kind, val] = selected.split(':');

    let nextRating = ratingStr === 'all' ? null : Number(ratingStr);
    let nextSort: ReviewSortMode = (sortStr as ReviewSortMode) || 'newest';
    let nextUser = userStr === 'all' ? null : userStr;
    let nextService = decodeServiceFilter(svcToken);

    if (kind === 'sort') {
      nextSort = (val as ReviewSortMode) || 'newest';
      nextRating = null;
    } else if (kind === 'rating') {
      nextRating = Number(val) || null;
    } else if (kind === 'reset') {
      nextRating = null;
      nextSort = 'newest';
      nextUser = null;
      nextService = null;
    }

    const payload = reviewsViewService.buildBrowserPayload(guild, config, {
      page: 1,
      rating: nextRating,
      sort: nextSort,
      userId: nextUser,
      service: nextService,
    });
    await interaction.update(payload);
    return;
  }

  if (!isGuildAdmin(member, interaction.memberPermissions)) {
    const card = buildStatusCard('error', 'صلاحية غير كافية', 'هذا الإجراء للمسؤولين فقط');
    await interaction.reply(toDisplayPayload(card, { ephemeral: true }));
    return;
  }

  if (id === 'fb_cfg_ch_feedback' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const updated = guildConfigRepo.update(guild.id, { feedbackChannelId: channelId });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'channels');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_ch_approval' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const updated = guildConfigRepo.update(guild.id, { approvalChannelId: channelId });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'channels');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_ch_log' && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const updated = guildConfigRepo.update(guild.id, { logChannelId: channelId });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'channels');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_role_client' && interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0];
    const updated = guildConfigRepo.update(guild.id, {
      clientRoleId: roleId,
      requireClientRole: true,
    });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'channels');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_role_staff' && interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0];
    const updated = guildConfigRepo.update(guild.id, { staffRoleId: roleId });
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'rules');
    await interaction.update(toDisplayPayload(setupContainer));
    return;
  }

  if (id === 'fb_cfg_service_remove' && interaction.isStringSelectMenu()) {
    guildConfigRepo.removeServices(guild.id, interaction.values);
    const updated = guildConfigRepo.getOrCreate(guild.id);
    const setupContainer = panelService.buildAdminSetupContainer(guild, updated, 'services');
    await interaction.update(toDisplayPayload(setupContainer));
  }
}
