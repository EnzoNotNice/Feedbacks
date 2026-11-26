import { executeRun, queryAll, queryOne } from '../database.js';

export interface BlacklistRecord {
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: number;
}

interface BlacklistRow extends Record<string, unknown> {
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  created_at: number;
}

export const blacklistRepo = {
  get(guildId: string, userId: string): BlacklistRecord | null {
    const row = queryOne<BlacklistRow>(
      'SELECT * FROM feedback_blacklist WHERE guild_id = ? AND user_id = ?',
      [guildId, userId]
    );
    if (!row) return null;
    return {
      guildId: String(row.guild_id),
      userId: String(row.user_id),
      moderatorId: String(row.moderator_id),
      reason: String(row.reason),
      createdAt: Number(row.created_at),
    };
  },

  add(guildId: string, userId: string, moderatorId: string, reason: string): void {
    executeRun(
      `INSERT OR REPLACE INTO feedback_blacklist (guild_id, user_id, moderator_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [guildId, userId, moderatorId, reason, Date.now()]
    );
  },

  remove(guildId: string, userId: string): boolean {
    const res = executeRun(
      'DELETE FROM feedback_blacklist WHERE guild_id = ? AND user_id = ?',
      [guildId, userId]
    );
    return res.changes > 0;
  },

  list(guildId: string): BlacklistRecord[] {
    const rows = queryAll<BlacklistRow>(
      'SELECT * FROM feedback_blacklist WHERE guild_id = ? ORDER BY created_at DESC',
      [guildId]
    );
    return rows.map((row) => ({
      guildId: String(row.guild_id),
      userId: String(row.user_id),
      moderatorId: String(row.moderator_id),
      reason: String(row.reason),
      createdAt: Number(row.created_at),
    }));
  },
};
