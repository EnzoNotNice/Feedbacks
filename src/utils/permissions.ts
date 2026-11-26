import {
  APIInteractionGuildMember,
  Guild,
  GuildMember,
  Interaction,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import { GuildConfig } from '../database/repositories/guildConfigRepo.js';

export type MemberLike = GuildMember | APIInteractionGuildMember | null;

export function resolveInteractionMember(interaction: Interaction): MemberLike {
  if (!interaction.guild) return null;
  if (interaction.member instanceof GuildMember) return interaction.member;
  const cached = interaction.guild.members.cache.get(interaction.user.id);
  if (cached) return cached;
  return (interaction.member as APIInteractionGuildMember | null) ?? null;
}

function resolveMemberPermissions(
  member: MemberLike,
  memberPermissions?: PermissionsBitField | null
): PermissionsBitField | null {
  if (memberPermissions) return memberPermissions;
  if (!member) return null;
  if (member instanceof GuildMember) return member.permissions;
  if (typeof member.permissions === 'string') {
    return new PermissionsBitField(BigInt(member.permissions));
  }
  return null;
}

function memberHasRole(member: MemberLike, roleId: string): boolean {
  if (!member) return false;
  if (member instanceof GuildMember) {
    return member.roles.cache.has(roleId);
  }
  return Array.isArray(member.roles) && member.roles.includes(roleId);
}

export function isGuildAdmin(
  member: MemberLike,
  memberPermissions?: PermissionsBitField | null
): boolean {
  const perms = resolveMemberPermissions(member, memberPermissions);
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

export function isFeedbackStaff(
  member: MemberLike,
  config: GuildConfig,
  memberPermissions?: PermissionsBitField | null
): boolean {
  if (isGuildAdmin(member, memberPermissions)) return true;
  if (config.staffRoleId && memberHasRole(member, config.staffRoleId)) {
    return true;
  }
  return false;
}

export function hasClientRole(member: MemberLike, config: GuildConfig): boolean {
  if (!member) return false;
  if (!config.requireClientRole) return true;
  if (!config.clientRoleId) return true;
  return memberHasRole(member, config.clientRoleId);
}

export async function resolveUserIdMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  return guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
}
