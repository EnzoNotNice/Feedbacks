import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  DISCORD_TOKEN: z.string().trim().default(''),
  DISCORD_CLIENT_ID: z.string().trim().default(''),
  DISCORD_GUILD_ID: z.string().trim().optional().default(''),
  DATABASE_PATH: z.string().trim().default('./data/feedbacks.db'),
  BOT_STATUS_TEXT: z.string().trim().default('آراء العملاء'),
  BRAND_NAME: z.string().trim().default('Enzo Feedbacks'),
});

const parsed = envSchema.parse(process.env);

export const env = {
  token: parsed.DISCORD_TOKEN,
  clientId: parsed.DISCORD_CLIENT_ID,
  guildId: parsed.DISCORD_GUILD_ID || undefined,
  databasePath: parsed.DATABASE_PATH,
  statusText: parsed.BOT_STATUS_TEXT,
  brandName: parsed.BRAND_NAME,
};
