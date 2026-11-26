import { DEFAULT_SERVICES, THEME_COLORS } from '../../config/theme.js';
import { executeRun, queryOne } from '../database.js';

export interface GuildConfig {
  guildId: string;
  feedbackChannelId: string | null;
  approvalChannelId: string | null;
  logChannelId: string | null;
  clientRoleId: string | null;
  staffRoleId: string | null;
  panelChannelId: string | null;
  panelMessageId: string | null;
  stickyMessageId: string | null;
  requireClientRole: boolean;
  requireApproval: boolean;
  stickyPanel: boolean;
  strictChannel: boolean;
  autoFeedback: boolean;
  allowHelpful: boolean;
  allowSelfEdit: boolean;
  allowStaffTag: boolean;
  dmOnStatus: boolean;
  useCanvasStats: boolean;
  useCanvasCard: boolean;
  minCommentLength: number;
  cooldownMinutes: number;
  accentColor: number;
  services: string[];
  updatedAt: number;
}

interface GuildConfigRow extends Record<string, unknown> {
  guild_id: string;
  feedback_channel_id: string | null;
  approval_channel_id: string | null;
  log_channel_id: string | null;
  client_role_id: string | null;
  staff_role_id: string | null;
  panel_channel_id: string | null;
  panel_message_id: string | null;
  sticky_message_id: string | null;
  require_client_role: number;
  require_approval: number;
  sticky_panel: number;
  strict_channel: number;
  auto_feedback: number;
  allow_helpful: number;
  allow_self_edit: number;
  allow_staff_tag: number;
  dm_on_status: number;
  use_canvas_stats: number;
  use_canvas_card: number;
  min_comment_length: number;
  cooldown_minutes: number;
  accent_color: number;
  services_json: string | null;
  updated_at: number;
}

function parseServices(raw: string | null): string[] {
  if (raw === null || raw === undefined) return [...DEFAULT_SERVICES];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      const clean: string[] = [];
      for (const entry of parsed) {
        if (typeof entry !== 'string') continue;
        const trimmed = entry.trim().slice(0, 60);
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        clean.push(trimmed);
        if (clean.length >= 20) break;
      }
      return clean;
    }
  } catch {
    return [...DEFAULT_SERVICES];
  }
  return [...DEFAULT_SERVICES];
}

function mapRow(row: GuildConfigRow): GuildConfig {
  return {
    guildId: row.guild_id,
    feedbackChannelId: row.feedback_channel_id,
    approvalChannelId: row.approval_channel_id,
    logChannelId: row.log_channel_id,
    clientRoleId: row.client_role_id,
    staffRoleId: row.staff_role_id,
    panelChannelId: row.panel_channel_id,
    panelMessageId: row.panel_message_id,
    stickyMessageId: row.sticky_message_id ?? null,
    requireClientRole: row.require_client_role === 1,
    requireApproval: row.require_approval === 1,
    stickyPanel: row.sticky_panel === 1,
    strictChannel: row.strict_channel === 1,
    autoFeedback: row.auto_feedback === undefined ? true : row.auto_feedback === 1,
    allowHelpful: row.allow_helpful === 1,
    allowSelfEdit: row.allow_self_edit === 1,
    allowStaffTag: row.allow_staff_tag === 1,
    dmOnStatus: row.dm_on_status === 1,
    useCanvasStats: row.use_canvas_stats === 1,
    useCanvasCard: row.use_canvas_card === undefined ? true : row.use_canvas_card === 1,
    minCommentLength: Number(row.min_comment_length ?? 3),
    cooldownMinutes: Number(row.cooldown_minutes ?? 5),
    accentColor: Number(row.accent_color ?? THEME_COLORS.primary),
    services: parseServices(row.services_json),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export const guildConfigRepo = {
  getOrCreate(guildId: string): GuildConfig {
    const existing = queryOne<GuildConfigRow>(
      'SELECT * FROM guild_configs WHERE guild_id = ?',
      [guildId]
    );
    if (existing) {
      return mapRow(existing);
    }

    const now = Date.now();
    executeRun(
      `INSERT INTO guild_configs (guild_id, services_json, accent_color, updated_at)
       VALUES (?, ?, ?, ?)`,
      [guildId, JSON.stringify([...DEFAULT_SERVICES]), THEME_COLORS.primary, now]
    );

    const created = queryOne<GuildConfigRow>(
      'SELECT * FROM guild_configs WHERE guild_id = ?',
      [guildId]
    );
    if (!created) {
      throw new Error(`Failed to initialize config for guild ${guildId}`);
    }
    return mapRow(created);
  },

  update(
    guildId: string,
    patch: Partial<Omit<GuildConfig, 'guildId' | 'updatedAt'>>
  ): GuildConfig {
    this.getOrCreate(guildId);
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const setStr = (col: string, val: string | null | undefined) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    };
    const setBool = (col: string, val: boolean | undefined) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val ? 1 : 0);
      }
    };
    const setNum = (col: string, val: number | undefined) => {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    };

    setStr('feedback_channel_id', patch.feedbackChannelId);
    setStr('approval_channel_id', patch.approvalChannelId);
    setStr('log_channel_id', patch.logChannelId);
    setStr('client_role_id', patch.clientRoleId);
    setStr('staff_role_id', patch.staffRoleId);
    setStr('panel_channel_id', patch.panelChannelId);
    setStr('panel_message_id', patch.panelMessageId);
    setStr('sticky_message_id', patch.stickyMessageId);
    setBool('require_client_role', patch.requireClientRole);
    setBool('require_approval', patch.requireApproval);
    setBool('sticky_panel', patch.stickyPanel);
    setBool('strict_channel', patch.strictChannel);
    setBool('auto_feedback', patch.autoFeedback);
    setBool('allow_helpful', patch.allowHelpful);
    setBool('allow_self_edit', patch.allowSelfEdit);
    setBool('allow_staff_tag', patch.allowStaffTag);
    setBool('dm_on_status', patch.dmOnStatus);
    setBool('use_canvas_stats', patch.useCanvasStats);
    setBool('use_canvas_card', patch.useCanvasCard);
    setNum('min_comment_length', patch.minCommentLength);
    setNum('cooldown_minutes', patch.cooldownMinutes);
    setNum('accent_color', patch.accentColor);

    if (patch.services !== undefined) {
      sets.push('services_json = ?');
      params.push(JSON.stringify(patch.services.slice(0, 20)));
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      params.push(Date.now());
      params.push(guildId);
      executeRun(`UPDATE guild_configs SET ${sets.join(', ')} WHERE guild_id = ?`, params);
    }

    return this.getOrCreate(guildId);
  },

  addService(
    guildId: string,
    serviceName: string
  ): { added: boolean; reason?: 'empty' | 'duplicate' | 'limit'; services: string[] } {
    const cfg = this.getOrCreate(guildId);
    const clean = serviceName.trim().slice(0, 60);
    if (!clean) {
      return { added: false, reason: 'empty', services: cfg.services };
    }
    if (cfg.services.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      return { added: false, reason: 'duplicate', services: cfg.services };
    }
    if (cfg.services.length >= 20) {
      return { added: false, reason: 'limit', services: cfg.services };
    }
    const updated = [...cfg.services, clean];
    this.update(guildId, { services: updated });
    return { added: true, services: updated };
  },

  addServices(
    guildId: string,
    rawInput: string
  ): { added: string[]; skippedDuplicates: number; limitReached: boolean; services: string[] } {
    const cfg = this.getOrCreate(guildId);
    const items = rawInput
      .split(/[\n,،]+/)
      .map((s) => s.trim().slice(0, 60))
      .filter((s) => s.length > 0);

    const existingKeys = new Set(cfg.services.map((s) => s.toLowerCase()));
    const next = [...cfg.services];
    const added: string[] = [];
    let skippedDuplicates = 0;
    let limitReached = false;

    for (const item of items) {
      const key = item.toLowerCase();
      if (existingKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }
      if (next.length >= 20) {
        limitReached = true;
        break;
      }
      existingKeys.add(key);
      next.push(item);
      added.push(item);
    }

    if (added.length > 0) {
      this.update(guildId, { services: next });
    }

    return {
      added,
      skippedDuplicates,
      limitReached,
      services: added.length > 0 ? next : cfg.services,
    };
  },

  removeService(guildId: string, serviceName: string): { removed: boolean; services: string[] } {
    const res = this.removeServices(guildId, [serviceName]);
    return { removed: res.removedCount > 0, services: res.services };
  },

  removeServices(
    guildId: string,
    serviceNames: string[]
  ): { removedCount: number; services: string[] } {
    const cfg = this.getOrCreate(guildId);
    const targets = new Set(
      serviceNames.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0)
    );
    if (targets.size === 0) {
      return { removedCount: 0, services: cfg.services };
    }
    const next = cfg.services.filter((s) => !targets.has(s.trim().toLowerCase()));
    const removedCount = cfg.services.length - next.length;
    if (removedCount === 0) {
      return { removedCount: 0, services: cfg.services };
    }
    this.update(guildId, { services: next });
    return { removedCount, services: next };
  },

  resetDefaultServices(guildId: string): string[] {
    const defaults = [...DEFAULT_SERVICES];
    this.update(guildId, { services: defaults });
    return defaults;
  },
};
