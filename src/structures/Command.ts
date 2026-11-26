import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js';

export interface SlashCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export interface MessageContextCommand {
  data: ContextMenuCommandBuilder;
  type: 'message';
  execute(interaction: MessageContextMenuCommandInteraction): Promise<void>;
}

export interface UserContextCommand {
  data: ContextMenuCommandBuilder;
  type: 'user';
  execute(interaction: UserContextMenuCommandInteraction): Promise<void>;
}

export type ContextCommand = MessageContextCommand | UserContextCommand;
