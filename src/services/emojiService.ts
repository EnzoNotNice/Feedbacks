import { Client, ComponentEmojiResolvable, REST, Routes } from 'discord.js';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { EMOJI_SPECS, EmojiKey, EmojiSpec } from '../config/emojis.js';
import { logger } from '../utils/logger.js';

export interface StoredEmojiRecord {
  id: string;
  name: string;
  mention: string;
}

interface EmojiStorePayload {
  _applicationId: string | null;
  emojis: Record<string, StoredEmojiRecord>;
}

interface PortalEmoji {
  id: string;
  name: string;
}

export function renderSolarEmojiPng(spec: EmojiSpec, svgRaw: string): Buffer {
  const gradId = `fb_grad_${spec.name}`;
  const [c0, c1, c2] = spec.gradient;
  const defs = `<defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c0}"/><stop offset="50%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>`;

  let svg = svgRaw
    .replace(/viewBox="0 0 24 24"/g, 'viewBox="-1.5 -1.5 27 27"')
    .replace(/width="24"/g, 'width="128"')
    .replace(/height="24"/g, 'height="128"')
    .replace(/fill="currentColor"/g, `fill="url(#${gradId})"`);

  svg = svg.replace(/<svg\b([^>]*)>/, `<svg$1>${defs}`);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 128 },
    background: 'rgba(0,0,0,0)',
  });

  return resvg.render().asPng();
}

export class EmojiService {
  private static instance: EmojiService;
  private store: EmojiStorePayload = { _applicationId: null, emojis: {} };
  private readonly storePath = path.resolve(process.cwd(), 'emojis.json');
  private readonly assetsDir = path.resolve(process.cwd(), 'assets', 'emojis');
  private readonly svgDir = path.resolve(process.cwd(), 'assets', 'enzo-icons', 'bold');

  private constructor() {
    this.loadFromDisk();
  }

  public static getInstance(): EmojiService {
    if (!EmojiService.instance) {
      EmojiService.instance = new EmojiService();
    }
    return EmojiService.instance;
  }

  public loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<EmojiStorePayload>;
      this.store = {
        _applicationId: typeof parsed._applicationId === 'string' ? parsed._applicationId : null,
        emojis: parsed.emojis && typeof parsed.emojis === 'object' ? parsed.emojis : {},
      };
    } catch {
      logger.warn('EMOJI', 'Failed to parse emojis.json, resetting in-memory cache');
      this.store = { _applicationId: null, emojis: {} };
    }
  }

  private saveToDisk(): void {
    const tempPath = `${this.storePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.store, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.storePath);
  }

  public ensureLocalPngs(forceRegenerate: boolean = false): number {
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true });
    }

    let generated = 0;
    for (const spec of EMOJI_SPECS) {
      const pngPath = path.join(this.assetsDir, `${spec.name}.png`);
      if (!forceRegenerate && fs.existsSync(pngPath)) {
        continue;
      }

      const svgPath = path.join(this.svgDir, spec.svgFile);
      if (!fs.existsSync(svgPath)) {
        logger.warn('EMOJI', `Missing Solar SVG for ${spec.name}: ${spec.svgFile}`);
        continue;
      }

      const svgRaw = fs.readFileSync(svgPath, 'utf-8');
      const pngBuffer = renderSolarEmojiPng(spec, svgRaw);
      fs.writeFileSync(pngPath, pngBuffer);
      generated++;
    }

    return generated;
  }

  public async syncWithClient(client: Client, forceReplace: boolean = false): Promise<number> {
    try {
      if (client.application) {
        await client.application.fetch().catch(() => undefined);
      }

      const appId = client.application?.id || client.user?.id;
      if (!appId) {
        logger.warn('EMOJI', 'Application ID unavailable during emoji sync');
        return 0;
      }

      this.ensureLocalPngs(false);

      const appChanged = this.store._applicationId !== null && this.store._applicationId !== appId;
      if (appChanged || forceReplace) {
        logger.info('EMOJI', `Application change detected (${this.store._applicationId ?? 'none'} -> ${appId}), refreshing emoji cache`);
        this.store.emojis = {};
      }

      const portalEmojis = await client.application!.emojis.fetch();
      const portalByName = new Map<string, { id: string; name: string }>();
      for (const item of portalEmojis.values()) {
        if (item.name) {
          portalByName.set(item.name, { id: item.id, name: item.name });
        }
      }

      let syncedCount = 0;
      for (const spec of EMOJI_SPECS) {
        const existing = portalByName.get(spec.name);
        if (existing && !forceReplace) {
          this.store.emojis[spec.key] = {
            id: existing.id,
            name: existing.name,
            mention: `<:${existing.name}:${existing.id}>`,
          };
          syncedCount++;
          continue;
        }

        if (existing && forceReplace) {
          await client.application!.emojis.delete(existing.id).catch(() => undefined);
        }

        const pngPath = path.join(this.assetsDir, `${spec.name}.png`);
        if (!fs.existsSync(pngPath)) continue;

        try {
          const pngBuffer = fs.readFileSync(pngPath);
          const created = await client.application!.emojis.create({
            attachment: pngBuffer,
            name: spec.name,
          });
          this.store.emojis[spec.key] = {
            id: created.id,
            name: created.name,
            mention: `<:${created.name}:${created.id}>`,
          };
          syncedCount++;
          logger.info('EMOJI', `Uploaded application emoji ${created.name} (${created.id})`);
          await new Promise((resolve) => setTimeout(resolve, 350));
        } catch (err) {
          logger.error('EMOJI', `Failed to upload application emoji ${spec.name}`, err);
        }
      }

      this.store._applicationId = appId;
      this.saveToDisk();
      logger.success('EMOJI', `Application emojis ready (${syncedCount}/${EMOJI_SPECS.length})`);
      return syncedCount;
    } catch (err) {
      logger.error('EMOJI', 'Failed to synchronize application emojis', err);
      return 0;
    }
  }

  public async syncViaRest(token: string, clientId: string, forceReplace: boolean = false): Promise<number> {
    this.ensureLocalPngs(forceReplace);

    const rest = new REST({ version: '10', timeout: 30_000, retries: 3 }).setToken(token);
    const response = (await rest.get(Routes.applicationEmojis(clientId))) as
      | { items?: PortalEmoji[] }
      | PortalEmoji[];
    const items = Array.isArray(response) ? response : response.items ?? [];

    const portalByName = new Map<string, PortalEmoji>();
    for (const item of items) {
      portalByName.set(item.name, item);
    }

    if (this.store._applicationId !== clientId || forceReplace) {
      this.store.emojis = {};
    }

    let syncedCount = 0;
    for (const spec of EMOJI_SPECS) {
      const existing = portalByName.get(spec.name);
      if (existing && !forceReplace) {
        this.store.emojis[spec.key] = {
          id: existing.id,
          name: existing.name,
          mention: `<:${existing.name}:${existing.id}>`,
        };
        syncedCount++;
        continue;
      }

      if (existing && forceReplace) {
        await rest.delete(Routes.applicationEmoji(clientId, existing.id)).catch(() => undefined);
      }

      const pngPath = path.join(this.assetsDir, `${spec.name}.png`);
      if (!fs.existsSync(pngPath)) continue;

      const base64 = `data:image/png;base64,${fs.readFileSync(pngPath).toString('base64')}`;
      const created = (await rest.post(Routes.applicationEmojis(clientId), {
        body: { name: spec.name, image: base64 },
      })) as PortalEmoji;

      this.store.emojis[spec.key] = {
        id: created.id,
        name: created.name,
        mention: `<:${created.name}:${created.id}>`,
      };
      syncedCount++;
      logger.info('EMOJI', `Synced emoji ${created.name} (${created.id})`);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    this.store._applicationId = clientId;
    this.saveToDisk();
    return syncedCount;
  }

  public get(key: EmojiKey): string {
    const rec = this.store.emojis[key];
    if (rec?.mention) return rec.mention;
    const spec = EMOJI_SPECS.find((item) => item.key === key);
    return spec?.fallback || '';
  }

  public btn(key: EmojiKey): ComponentEmojiResolvable | undefined {
    const rec = this.store.emojis[key];
    if (rec?.id && rec?.name) {
      return { id: rec.id, name: rec.name };
    }
    return undefined;
  }

  public stars(rating: number, max: number = 5): string {
    const safe = Math.max(0, Math.min(max, Math.round(rating)));
    const on = this.get('star');
    const off = this.get('starOff');
    return `${on.repeat(safe)}${off.repeat(Math.max(0, max - safe))}`;
  }

  public getStats(): { total: number; synced: number; applicationId: string | null } {
    const synced = EMOJI_SPECS.filter((s) => Boolean(this.store.emojis[s.key]?.id)).length;
    return {
      total: EMOJI_SPECS.length,
      synced,
      applicationId: this.store._applicationId,
    };
  }
}

export const emojiService = EmojiService.getInstance();
