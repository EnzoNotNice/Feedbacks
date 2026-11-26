import { SqlValue } from 'sql.js';
import { executeRun, queryAll, queryOne } from '../database.js';

export type FeedbackStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'DELETED';

export interface FeedbackRecord {
  id: number;
  code: string;
  guildId: string;
  userId: string;
  userTag: string;
  staffId: string | null;
  service: string;
  rating: number;
  comment: string;
  imageUrl: string | null;
  status: FeedbackStatus;
  channelId: string | null;
  messageId: string | null;
  queueChannelId: string | null;
  queueMessageId: string | null;
  moderatorId: string | null;
  rejectReason: string | null;
  staffReply: string | null;
  staffReplyBy: string | null;
  staffReplyAt: number | null;
  helpfulCount: number;
  createdAt: number;
  editedAt: number | null;
}

export interface FeedbackStats {
  total: number;
  average: number;
  satisfactionRate: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  uniqueReviewers: number;
  topServices: { service: string; count: number; average: number }[];
  pendingCount: number;
}

export interface StaffRankEntry {
  staffId: string;
  count: number;
  average: number;
  fiveStars: number;
}

export interface ReviewerRankEntry {
  userId: string;
  count: number;
  average: number;
}

interface FeedbackRow extends Record<string, unknown> {
  id: number;
  code: string;
  guild_id: string;
  user_id: string;
  user_tag: string;
  staff_id: string | null;
  service: string;
  rating: number;
  comment: string;
  image_url: string | null;
  status: string;
  channel_id: string | null;
  message_id: string | null;
  queue_channel_id: string | null;
  queue_message_id: string | null;
  moderator_id: string | null;
  reject_reason: string | null;
  staff_reply: string | null;
  staff_reply_by: string | null;
  staff_reply_at: number | null;
  helpful_count: number;
  created_at: number;
  edited_at: number | null;
}

function mapFeedback(row: FeedbackRow): FeedbackRecord {
  return {
    id: Number(row.id),
    code: String(row.code),
    guildId: String(row.guild_id),
    userId: String(row.user_id),
    userTag: String(row.user_tag),
    staffId: row.staff_id ? String(row.staff_id) : null,
    service: String(row.service),
    rating: Number(row.rating),
    comment: String(row.comment),
    imageUrl: row.image_url ? String(row.image_url) : null,
    status: row.status as FeedbackStatus,
    channelId: row.channel_id ? String(row.channel_id) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    queueChannelId: row.queue_channel_id ? String(row.queue_channel_id) : null,
    queueMessageId: row.queue_message_id ? String(row.queue_message_id) : null,
    moderatorId: row.moderator_id ? String(row.moderator_id) : null,
    rejectReason: row.reject_reason ? String(row.reject_reason) : null,
    staffReply: row.staff_reply ? String(row.staff_reply) : null,
    staffReplyBy: row.staff_reply_by ? String(row.staff_reply_by) : null,
    staffReplyAt: row.staff_reply_at ? Number(row.staff_reply_at) : null,
    helpfulCount: Number(row.helpful_count ?? 0),
    createdAt: Number(row.created_at),
    editedAt: row.edited_at ? Number(row.edited_at) : null,
  };
}

export const feedbackRepo = {
  generateNextCode(guildId: string): string {
    const row = queryOne<{ total: number }>(
      'SELECT COUNT(*) AS total FROM feedbacks WHERE guild_id = ?',
      [guildId]
    );
    let seq = Number(row?.total ?? 0) + 1;
    while (true) {
      const code = `FB-${String(seq).padStart(4, '0')}`;
      const clash = queryOne<{ id: number }>(
        'SELECT id FROM feedbacks WHERE guild_id = ? AND code = ?',
        [guildId, code]
      );
      if (!clash) return code;
      seq++;
    }
  },

  create(input: {
    guildId: string;
    userId: string;
    userTag: string;
    staffId?: string | null;
    service: string;
    rating: number;
    comment: string;
    imageUrl?: string | null;
    status: FeedbackStatus;
  }): FeedbackRecord {
    const code = this.generateNextCode(input.guildId);
    const now = Date.now();
    const res = executeRun(
      `INSERT INTO feedbacks (
        code, guild_id, user_id, user_tag, staff_id, service, rating, comment, image_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        input.guildId,
        input.userId,
        input.userTag,
        input.staffId ?? null,
        input.service,
        input.rating,
        input.comment,
        input.imageUrl ?? null,
        input.status,
        now,
      ]
    );
    const created = this.findById(res.lastInsertRowid);
    if (!created) {
      throw new Error('Failed to fetch newly inserted feedback');
    }
    return created;
  },

  findById(id: number): FeedbackRecord | null {
    const row = queryOne<FeedbackRow>('SELECT * FROM feedbacks WHERE id = ?', [id]);
    return row ? mapFeedback(row) : null;
  },

  findByCode(guildId: string, codeOrId: string): FeedbackRecord | null {
    const normalized = codeOrId.trim().toUpperCase();
    const withPrefix = normalized.startsWith('FB-') ? normalized : `FB-${normalized.padStart(4, '0')}`;
    const byCode = queryOne<FeedbackRow>(
      'SELECT * FROM feedbacks WHERE guild_id = ? AND (UPPER(code) = ? OR UPPER(code) = ?)',
      [guildId, normalized, withPrefix]
    );
    if (byCode) return mapFeedback(byCode);

    const num = Number(codeOrId.trim());
    if (Number.isInteger(num) && num > 0) {
      const byId = queryOne<FeedbackRow>(
        'SELECT * FROM feedbacks WHERE guild_id = ? AND id = ?',
        [guildId, num]
      );
      if (byId) return mapFeedback(byId);
    }
    return null;
  },

  findByMessageId(messageId: string): FeedbackRecord | null {
    const row = queryOne<FeedbackRow>(
      'SELECT * FROM feedbacks WHERE message_id = ? OR queue_message_id = ?',
      [messageId, messageId]
    );
    return row ? mapFeedback(row) : null;
  },

  getLatestByUser(guildId: string, userId: string): FeedbackRecord | null {
    const row = queryOne<FeedbackRow>(
      'SELECT * FROM feedbacks WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1',
      [guildId, userId]
    );
    return row ? mapFeedback(row) : null;
  },

  update(
    id: number,
    patch: Partial<{
      service: string;
      rating: number;
      comment: string;
      imageUrl: string | null;
      status: FeedbackStatus;
      channelId: string | null;
      messageId: string | null;
      queueChannelId: string | null;
      queueMessageId: string | null;
      moderatorId: string | null;
      rejectReason: string | null;
      staffReply: string | null;
      staffReplyBy: string | null;
      staffReplyAt: number | null;
      editedAt: number | null;
    }>
  ): FeedbackRecord | null {
    const sets: string[] = [];
    const params: SqlValue[] = [];

    const mapField = (col: string, val: SqlValue | undefined) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    };

    mapField('service', patch.service);
    mapField('rating', patch.rating);
    mapField('comment', patch.comment);
    mapField('image_url', patch.imageUrl);
    mapField('status', patch.status);
    mapField('channel_id', patch.channelId);
    mapField('message_id', patch.messageId);
    mapField('queue_channel_id', patch.queueChannelId);
    mapField('queue_message_id', patch.queueMessageId);
    mapField('moderator_id', patch.moderatorId);
    mapField('reject_reason', patch.rejectReason);
    mapField('staff_reply', patch.staffReply);
    mapField('staff_reply_by', patch.staffReplyBy);
    mapField('staff_reply_at', patch.staffReplyAt);
    mapField('edited_at', patch.editedAt);

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    executeRun(`UPDATE feedbacks SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  },

  listPublished(
    guildId: string,
    options: {
      page?: number;
      pageSize?: number;
      rating?: number | null;
      service?: string | null;
      userId?: string | null;
      staffId?: string | null;
      sort?: 'newest' | 'highest' | 'helpful';
    } = {}
  ): { items: FeedbackRecord[]; total: number; totalPages: number; page: number } {
    const pageSize = Math.max(1, Math.min(10, options.pageSize ?? 4));
    const where: string[] = ["guild_id = ? AND status = 'PUBLISHED'"];
    const params: SqlValue[] = [guildId];

    if (options.rating && options.rating >= 1 && options.rating <= 5) {
      where.push('rating = ?');
      params.push(options.rating);
    }
    if (options.service) {
      where.push('LOWER(service) = LOWER(?)');
      params.push(options.service.trim());
    }
    if (options.userId) {
      where.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.staffId) {
      where.push('staff_id = ?');
      params.push(options.staffId);
    }

    const whereSql = where.join(' AND ');
    const countRow = queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM feedbacks WHERE ${whereSql}`,
      params
    );
    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, options.page ?? 1));
    const offset = (page - 1) * pageSize;

    let orderSql = 'created_at DESC';
    if (options.sort === 'highest') {
      orderSql = 'rating DESC, created_at DESC';
    } else if (options.sort === 'helpful') {
      orderSql = 'helpful_count DESC, created_at DESC';
    }

    const rows = queryAll<FeedbackRow>(
      `SELECT * FROM feedbacks WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      items: rows.map(mapFeedback),
      total,
      totalPages,
      page,
    };
  },

  getAllForExport(guildId: string): FeedbackRecord[] {
    const rows = queryAll<FeedbackRow>(
      "SELECT * FROM feedbacks WHERE guild_id = ? AND status != 'DELETED' ORDER BY created_at DESC",
      [guildId]
    );
    return rows.map(mapFeedback);
  },

  toggleHelpful(feedbackId: number, userId: string): { added: boolean; count: number } {
    const existing = queryOne<{ feedback_id: number }>(
      'SELECT feedback_id FROM helpful_votes WHERE feedback_id = ? AND user_id = ?',
      [feedbackId, userId]
    );

    if (existing) {
      executeRun(
        'DELETE FROM helpful_votes WHERE feedback_id = ? AND user_id = ?',
        [feedbackId, userId],
        false
      );
    } else {
      executeRun(
        'INSERT INTO helpful_votes (feedback_id, user_id, created_at) VALUES (?, ?, ?)',
        [feedbackId, userId, Date.now()],
        false
      );
    }

    const countRow = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM helpful_votes WHERE feedback_id = ?',
      [feedbackId]
    );
    const count = Number(countRow?.cnt ?? 0);
    executeRun('UPDATE feedbacks SET helpful_count = ? WHERE id = ?', [count, feedbackId]);
    return { added: !existing, count };
  },

  getStats(guildId: string): FeedbackStats {
    const publishedRows = queryAll<{ rating: number; service: string; user_id: string }>(
      "SELECT rating, service, user_id FROM feedbacks WHERE guild_id = ? AND status = 'PUBLISHED'",
      [guildId]
    );
    const pendingRow = queryOne<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM feedbacks WHERE guild_id = ? AND status = 'PENDING'",
      [guildId]
    );

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const serviceBuckets = new Map<string, { count: number; sum: number }>();
    const reviewers = new Set<string>();
    let sumRating = 0;
    let satisfied = 0;

    for (const row of publishedRows) {
      const r = Math.max(1, Math.min(5, Number(row.rating))) as 1 | 2 | 3 | 4 | 5;
      distribution[r]++;
      sumRating += r;
      if (r >= 4) satisfied++;
      reviewers.add(String(row.user_id));

      const svc = String(row.service);
      const bucket = serviceBuckets.get(svc) ?? { count: 0, sum: 0 };
      bucket.count++;
      bucket.sum += r;
      serviceBuckets.set(svc, bucket);
    }

    const total = publishedRows.length;
    const average = total > 0 ? Number((sumRating / total).toFixed(2)) : 0;
    const satisfactionRate = total > 0 ? Math.round((satisfied / total) * 100) : 100;

    const topServices = Array.from(serviceBuckets.entries())
      .map(([service, val]) => ({
        service,
        count: val.count,
        average: Number((val.sum / val.count).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count || b.average - a.average)
      .slice(0, 5);

    return {
      total,
      average,
      satisfactionRate,
      distribution,
      uniqueReviewers: reviewers.size,
      topServices,
      pendingCount: Number(pendingRow?.cnt ?? 0),
    };
  },

  getTopStaff(guildId: string, limit: number = 8): StaffRankEntry[] {
    const rows = queryAll<{
      staff_id: string;
      cnt: number;
      avg_rating: number;
      five_stars: number;
    }>(
      `SELECT staff_id,
              COUNT(*) AS cnt,
              AVG(rating) AS avg_rating,
              SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_stars
       FROM feedbacks
       WHERE guild_id = ? AND status = 'PUBLISHED' AND staff_id IS NOT NULL
       GROUP BY staff_id
       ORDER BY cnt DESC, avg_rating DESC
       LIMIT ?`,
      [guildId, limit]
    );
    return rows.map((r) => ({
      staffId: String(r.staff_id),
      count: Number(r.cnt),
      average: Number(Number(r.avg_rating).toFixed(2)),
      fiveStars: Number(r.five_stars),
    }));
  },

  getTopReviewers(guildId: string, limit: number = 8): ReviewerRankEntry[] {
    const rows = queryAll<{
      user_id: string;
      cnt: number;
      avg_rating: number;
    }>(
      `SELECT user_id,
              COUNT(*) AS cnt,
              AVG(rating) AS avg_rating
       FROM feedbacks
       WHERE guild_id = ? AND status = 'PUBLISHED'
       GROUP BY user_id
       ORDER BY cnt DESC, avg_rating DESC
       LIMIT ?`,
      [guildId, limit]
    );
    return rows.map((r) => ({
      userId: String(r.user_id),
      count: Number(r.cnt),
      average: Number(Number(r.avg_rating).toFixed(2)),
    }));
  },
};
