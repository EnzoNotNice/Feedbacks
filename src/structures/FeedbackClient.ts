import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from 'discord.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ContextCommand, SlashCommand } from './Command.js';

export class FeedbackClient extends Client {
  public readonly slashCommands = new Collection<string, SlashCommand>();
  public readonly contextCommands = new Collection<string, ContextCommand>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.User],
      rest: {
        timeout: 30_000,
        retries: 3,
      },
    });
  }

  public registerSlashCommand(command: SlashCommand): void {
    this.slashCommands.set(command.data.name, command);
  }

  public registerContextCommand(command: ContextCommand): void {
    this.contextCommands.set(command.data.name, command);
  }

  public async deployCommands(): Promise<void> {
    if (!this.user || !env.token) {
      logger.warn('DEPLOY', 'Cannot deploy commands before client login');
      return;
    }

    const rest = new REST({ version: '10', timeout: 30_000, retries: 3 }).setToken(env.token);
    const payload = [
      ...this.slashCommands.map((cmd) => cmd.data.toJSON()),
      ...this.contextCommands.map((cmd) => cmd.data.toJSON()),
    ];

    try {
      await rest.put(Routes.applicationCommands(this.user.id), { body: payload });
      logger.success('DEPLOY', `Synchronized ${payload.length} global application commands`);

      for (const guild of this.guilds.cache.values()) {
        try {
          const existingGuildCmds = (await rest.get(
            Routes.applicationGuildCommands(this.user.id, guild.id)
          )) as unknown[];
          if (Array.isArray(existingGuildCmds) && existingGuildCmds.length > 0) {
            await rest.put(Routes.applicationGuildCommands(this.user.id, guild.id), {
              body: [],
            });
            logger.info(
              'DEPLOY',
              `Cleared ${existingGuildCmds.length} duplicate guild commands in ${guild.name} (${guild.id})`
            );
          }
        } catch (err) {
          logger.warn('DEPLOY', `Failed clearing guild commands for ${guild.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      logger.error('DEPLOY', 'Failed to synchronize application commands', err);
    }
  }
}
