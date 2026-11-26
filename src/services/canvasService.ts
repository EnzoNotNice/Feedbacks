import { createCanvas, GlobalFonts, loadImage, Path2D, SKRSContext2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { RATING_COLORS, THEME_COLORS } from '../config/theme.js';
import { FeedbackRecord, FeedbackStats } from '../database/repositories/feedbackRepo.js';

export interface FeedbackCardRenderOptions {
  record: FeedbackRecord;
  authorName: string;
  authorHandle: string;
  avatarUrl: string;
  guildName: string;
  guildIconUrl?: string | null;
  staffName?: string | null;
  replyAuthorName?: string | null;
}

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function hexToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function cleanCanvasText(raw: string): string {
  return raw
    .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '')
    .replace(/\u200B/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatCompactDate(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchImageSafe(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > 6 * 1024 * 1024) return null;
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

export class CanvasService {
  private static initialized = false;

  public static init(): void {
    if (this.initialized) return;

    const boldFont = path.resolve(process.cwd(), 'assets', 'fonts', 'Alexandria-Bold.ttf');
    const regFont = path.resolve(process.cwd(), 'assets', 'fonts', 'Alexandria-Regular.ttf');
    if (fs.existsSync(boldFont)) {
      GlobalFonts.registerFromPath(boldFont, 'Alexandria');
    }
    if (fs.existsSync(regFont)) {
      GlobalFonts.registerFromPath(regFont, 'AlexandriaRegular');
    }

    this.initialized = true;
  }

  private static drawRoundedRect(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private static drawSolarIcon(
    ctx: SKRSContext2D,
    svgFile: string,
    x: number,
    y: number,
    size: number,
    color: string
  ): void {
    const svgPath = path.resolve(process.cwd(), 'assets', 'enzo-icons', 'bold', svgFile);
    if (!fs.existsSync(svgPath)) return;
    const svg = fs.readFileSync(svgPath, 'utf-8');
    const matches = Array.from(svg.matchAll(/d="([^"]+)"/g)).map((m) => m[1]);
    const combined = new Path2D();
    for (const d of matches) {
      combined.addPath(new Path2D(d));
    }
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fill(combined, 'evenodd');
    ctx.restore();
  }

  private static truncateToWidth(
    ctx: SKRSContext2D,
    value: string,
    maxWidth: number
  ): string {
    const clean = value.trim();
    if (!clean) return '';
    if (ctx.measureText(clean).width <= maxWidth) return clean;
    let out = clean;
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out.trim()}...`;
  }

  private static wrapTextLines(
    ctx: SKRSContext2D,
    rawText: string,
    maxWidth: number,
    maxLines: number
  ): string[] {
    const paragraphs = rawText.split(/\r?\n/);
    const lines: string[] = [];

    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p].trim();
      if (!para) {
        if (lines.length > 0 && lines.length < maxLines) {
          lines.push('');
        }
        continue;
      }

      const words = para.split(/\s+/);
      let current = '';

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
          current = candidate;
          continue;
        }

        if (current) {
          lines.push(current);
          current = '';
          if (lines.length >= maxLines) break;
        }

        if (ctx.measureText(word).width <= maxWidth) {
          current = word;
        } else {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(`${chunk}${ch}`).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              if (lines.length >= maxLines) break;
              chunk = ch;
            }
          }
          current = chunk;
        }
      }

      if (lines.length >= maxLines) {
        lines[maxLines - 1] = this.truncateToWidth(ctx, lines[maxLines - 1], maxWidth);
        return lines.slice(0, maxLines);
      }

      if (current) {
        lines.push(current);
      }

      if (lines.length >= maxLines && p < paragraphs.length - 1) {
        lines[maxLines - 1] = this.truncateToWidth(ctx, lines[maxLines - 1], maxWidth);
        return lines.slice(0, maxLines);
      }
    }

    return lines.length > 0 ? lines.slice(0, maxLines) : ['-'];
  }

  private static async drawCircularImage(
    ctx: SKRSContext2D,
    url: string | null | undefined,
    cx: number,
    cy: number,
    radius: number,
    fallbackIcon: string,
    fallbackColor: string
  ): Promise<void> {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#131B2E';
    ctx.fill();
    ctx.clip();

    const buffer = await fetchImageSafe(url);
    if (buffer) {
      try {
        const img = await loadImage(buffer);
        ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.restore();
        return;
      } catch {
        ctx.restore();
        const iconSize = Math.round(radius * 1.15);
        this.drawSolarIcon(ctx, fallbackIcon, cx - iconSize / 2, cy - iconSize / 2, iconSize, fallbackColor);
        return;
      }
    }

    ctx.restore();
    const iconSize = Math.round(radius * 1.15);
    this.drawSolarIcon(ctx, fallbackIcon, cx - iconSize / 2, cy - iconSize / 2, iconSize, fallbackColor);
  }

  public static async renderFeedbackCard(
    options: FeedbackCardRenderOptions
  ): Promise<Buffer> {
    this.init();

    const width = 920;
    const padX = 38;
    const boxW = width - padX * 2;
    const commentFont = '400 19px "AlexandriaRegular", "Alexandria", sans-serif';
    const replyFont = '400 15px "AlexandriaRegular", "Alexandria", sans-serif';
    const cleanComment = cleanCanvasText(options.record.comment) || '-';
    const cleanReply = options.record.staffReply ? cleanCanvasText(options.record.staffReply) : '';

    const measureCanvas = createCanvas(10, 10);
    const mctx = measureCanvas.getContext('2d');
    mctx.font = commentFont;
    const commentLines = this.wrapTextLines(mctx, cleanComment, boxW - 96, 8);
    const commentBoxY = 148;
    const commentLineH = 32;
    const commentBoxH = Math.max(68, (commentLines.length - 1) * commentLineH + 68);

    let replyLines: string[] = [];
    const replyBoxY = commentBoxY + commentBoxH + 14;
    let replyBoxH = 0;
    const replyLineH = 26;

    if (cleanReply) {
      mctx.font = replyFont;
      replyLines = this.wrapTextLines(mctx, cleanReply, boxW - 60, 4);
      replyBoxH = (replyLines.length - 1) * replyLineH + 78;
    }

    const contentBottom = cleanReply ? replyBoxY + replyBoxH : commentBoxY + commentBoxH;
    const footerY = contentBottom + 18;
    const height = footerY + 46;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    this.drawRoundedRect(ctx, 0, 0, width, height, 28);
    ctx.clip();

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#070A11');
    bgGrad.addColorStop(0.55, '#0D1322');
    bgGrad.addColorStop(1, '#080B14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const ratingNum = Math.max(1, Math.min(5, Math.round(options.record.rating)));
    const accentHex = RATING_COLORS[ratingNum] ?? THEME_COLORS.gold;
    const accentCss = hexToCss(accentHex);

    const rightGlow = ctx.createRadialGradient(width - 140, 75, 16, width - 140, 75, 430);
    rightGlow.addColorStop(0, 'rgba(99, 102, 241, 0.14)');
    rightGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = rightGlow;
    ctx.fillRect(0, 0, width, height);

    const leftGlow = ctx.createRadialGradient(140, 82, 12, 140, 82, 320);
    leftGlow.addColorStop(0, hexToRgba(accentHex, 0.1));
    leftGlow.addColorStop(1, hexToRgba(accentHex, 0));
    ctx.fillStyle = leftGlow;
    ctx.fillRect(0, 0, width, height);

    const avatarCx = width - padX - 38;
    const avatarCy = 74;
    const avatarR = 38;

    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR + 4, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(accentHex, 0.22);
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 2;
    ctx.stroke();

    await this.drawCircularImage(
      ctx,
      options.avatarUrl,
      avatarCx,
      avatarCy,
      avatarR,
      'user-rounded.svg',
      '#A5B4FC'
    );

    const badgeCx = avatarCx - 28;
    const badgeCy = avatarCy + 26;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#090D18';
    ctx.fill();
    this.drawSolarIcon(ctx, 'verified-check.svg', badgeCx - 10, badgeCy - 10, 20, '#10B981');

    const nameRightX = width - padX - 96;
    const cleanAuthor = cleanCanvasText(options.authorName) || options.authorHandle || 'عميل';
    const authorIsArabic = containsArabic(cleanAuthor);
    ctx.font = '700 24px "Alexandria", sans-serif';
    ctx.direction = authorIsArabic ? 'rtl' : 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(this.truncateToWidth(ctx, cleanAuthor, 370), nameRightX, 44);

    const cleanHandle = cleanCanvasText(options.authorHandle).replace(/#0$/, '');
    const handleText = cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`;
    ctx.font = '400 15px "AlexandriaRegular", "Alexandria", sans-serif';
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(this.truncateToWidth(ctx, handleText, 350), nameRightX, 78);

    const starSize = 22;
    const starGap = 28;
    for (let i = 0; i < 5; i++) {
      const color = i < ratingNum ? '#F59E0B' : '#263248';
      this.drawSolarIcon(ctx, 'star.svg', padX + i * starGap, 44, starSize, color);
    }

    const scoreX = padX + 5 * starGap + 8;
    this.drawRoundedRect(ctx, scoreX, 41, 56, 28, 14);
    ctx.fillStyle = hexToRgba(accentHex, 0.14);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accentHex, 0.36);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ratingNum === 5 ? '#FCD34D' : accentCss;
    ctx.font = '700 13px "Alexandria", sans-serif';
    ctx.fillText(ratingNum.toFixed(1), scoreX + 28, 55);

    const cleanService = cleanCanvasText(options.record.service) || 'تقييم عام';
    const serviceFont = '700 13px "Alexandria", sans-serif';
    ctx.font = serviceFont;
    const fittedService = this.truncateToWidth(ctx, cleanService, 260);
    const serviceTextW = ctx.measureText(fittedService).width;
    const pillW = Math.ceil(serviceTextW + 44);
    const pillY = 78;
    const pillH = 30;

    this.drawRoundedRect(ctx, padX, pillY, pillW, pillH, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.085)';
    ctx.lineWidth = 1;
    ctx.stroke();

    this.drawSolarIcon(ctx, 'tag.svg', padX + pillW - 23, pillY + 8, 14, '#818CF8');
    ctx.direction = containsArabic(fittedService) ? 'rtl' : 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#CBD5E1';
    ctx.font = serviceFont;
    ctx.fillText(fittedService, padX + pillW - 29, pillY + pillH / 2 + 1);

    const sepGrad = ctx.createLinearGradient(padX, 0, width - padX, 0);
    sepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.09)');
    sepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = sepGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 128);
    ctx.lineTo(width - padX, 128);
    ctx.stroke();

    this.drawRoundedRect(ctx, padX, commentBoxY, boxW, commentBoxH, 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.032)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const commentRtl = containsArabic(cleanComment);
    this.drawRoundedRect(
      ctx,
      commentRtl ? padX + boxW - 17 : padX + 13,
      commentBoxY + 18,
      4,
      commentBoxH - 36,
      2
    );
    ctx.fillStyle = hexToRgba(accentHex, 0.72);
    ctx.fill();

    this.drawSolarIcon(
      ctx,
      'chat-round-quote.svg',
      commentRtl ? padX + boxW - 50 : padX + 28,
      commentBoxY + 24,
      20,
      'rgba(129, 140, 248, 0.72)'
    );

    ctx.font = commentFont;
    ctx.direction = commentRtl ? 'rtl' : 'ltr';
    ctx.textAlign = commentRtl ? 'right' : 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#E2E8F0';
    const commentTextX = commentRtl ? padX + boxW - 58 : padX + 56;
    for (let i = 0; i < commentLines.length; i++) {
      ctx.fillText(commentLines[i], commentTextX, commentBoxY + 22 + i * commentLineH);
    }

    if (replyLines.length > 0) {
      this.drawRoundedRect(ctx, padX, replyBoxY, boxW, replyBoxH, 16);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.065)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

      this.drawSolarIcon(
        ctx,
        'reply.svg',
        padX + boxW - 36,
        replyBoxY + 15,
        16,
        '#818CF8'
      );

      const replyTitle = options.replyAuthorName
        ? `رد الإدارة ── ${cleanCanvasText(options.replyAuthorName)}`
        : 'رد الإدارة';
      ctx.font = '700 13px "Alexandria", sans-serif';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#C7D2FE';
      ctx.fillText(this.truncateToWidth(ctx, replyTitle, boxW - 80), padX + boxW - 44, replyBoxY + 15);

      const replyRtl = containsArabic(cleanReply);
      ctx.font = replyFont;
      ctx.direction = replyRtl ? 'rtl' : 'ltr';
      ctx.textAlign = replyRtl ? 'right' : 'left';
      ctx.fillStyle = '#CBD5E1';
      const replyTextX = replyRtl ? padX + boxW - 24 : padX + 24;
      for (let i = 0; i < replyLines.length; i++) {
        ctx.fillText(replyLines[i], replyTextX, replyBoxY + 42 + i * replyLineH);
      }
    }

    const footerMid = footerY + 12;
    await this.drawCircularImage(
      ctx,
      options.guildIconUrl,
      padX + 11,
      footerMid,
      11,
      'shield-check.svg',
      '#818CF8'
    );

    ctx.font = '700 13px "Alexandria", sans-serif';
    const fittedGuild = this.truncateToWidth(ctx, cleanCanvasText(options.guildName) || 'Server', 220);
    ctx.direction = containsArabic(fittedGuild) ? 'rtl' : 'ltr';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(fittedGuild, padX + 28, footerMid + 1);
    const guildW = ctx.measureText(fittedGuild).width;

    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = '700 12px "Alexandria", sans-serif';
    ctx.fillText(`•  ${options.record.code}`, padX + 36 + guildW, footerMid + 1);

    let cursorRight = width - padX;
    this.drawSolarIcon(ctx, 'clock-circle.svg', cursorRight - 15, footerMid - 7, 15, '#64748B');
    cursorRight -= 21;

    const dateLabel = formatCompactDate(options.record.createdAt);
    ctx.font = '400 13px "AlexandriaRegular", "Alexandria", sans-serif';
    ctx.direction = 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#64748B';
    ctx.fillText(dateLabel, cursorRight, footerMid + 1);
    cursorRight -= ctx.measureText(dateLabel).width + 14;

    if (options.record.editedAt) {
      ctx.font = '700 12px "Alexandria", sans-serif';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94A3B8';
      const editedLabel = '(معدّل)';
      ctx.fillText(editedLabel, cursorRight, footerMid + 1);
      cursorRight -= ctx.measureText(editedLabel).width + 14;
    }

    cursorRight -= 4;

    if (options.staffName) {
      const cleanStaff = this.truncateToWidth(ctx, cleanCanvasText(options.staffName), 180);
      if (cleanStaff) {
        this.drawSolarIcon(ctx, 'user-check-rounded.svg', cursorRight - 15, footerMid - 7, 15, '#10B981');
        cursorRight -= 21;
        const staffLabel = `بإشراف ${cleanStaff}`;
        ctx.font = '700 13px "Alexandria", sans-serif';
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(staffLabel, cursorRight, footerMid + 1);
      }
    }

    ctx.restore();
    return canvas.toBuffer('image/png');
  }

  public static async renderStatsCard(options: {
    guildName: string;
    guildIconUrl?: string | null;
    stats: FeedbackStats;
    verifiedClientsCount: number;
  }): Promise<Buffer> {
    this.init();

    const width = 960;
    const height = 560;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    this.drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 32);
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0B0F1A');
    bgGrad.addColorStop(0.55, '#111827');
    bgGrad.addColorStop(1, '#090D16');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.save();
    this.drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 32);
    ctx.clip();

    const ambientTop = ctx.createRadialGradient(width * 0.82, 90, 10, width * 0.82, 90, 420);
    ambientTop.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
    ambientTop.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = ambientTop;
    ctx.fillRect(0, 0, width, height);

    const ambientLeft = ctx.createRadialGradient(180, 240, 10, 180, 240, 340);
    ambientLeft.addColorStop(0, 'rgba(245, 158, 11, 0.14)');
    ambientLeft.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = ambientLeft;
    ctx.fillRect(0, 0, width, height);

    if (options.guildIconUrl) {
      try {
        const avatar = await loadImage(options.guildIconUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(width - 82, 76, 30, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, width - 112, 46, 60, 60);
        ctx.restore();
      } catch {
        this.drawSolarIcon(ctx, 'chart-2.svg', width - 102, 54, 42, '#818CF8');
      }
    } else {
      this.drawSolarIcon(ctx, 'chart-2.svg', width - 102, 54, 42, '#818CF8');
    }

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 28px "Alexandria", sans-serif';
    ctx.fillText(`إحصائيات الفيدباك ── ${options.guildName}`, width - 128, 48);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '400 15px "AlexandriaRegular", "Alexandria", sans-serif';
    ctx.fillText('ملخص أداء التقييمات وآراء العملاء المعتمدة', width - 128, 86);

    const heroX = 52;
    const heroY = 136;
    const heroW = 290;
    const heroH = 228;
    this.drawRoundedRect(ctx, heroX, heroY, heroW, heroH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fill();

    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 66px "Alexandria", sans-serif';
    const avgStr = options.stats.total > 0 ? options.stats.average.toFixed(1) : '5.0';
    ctx.fillText(avgStr, heroX + heroW / 2, heroY + 34);

    ctx.fillStyle = '#64748B';
    ctx.font = '700 16px "Alexandria", sans-serif';
    ctx.fillText('OUT OF 5.0', heroX + heroW / 2, heroY + 114);

    const starGap = 32;
    const starsTotalW = starGap * 5 - 8;
    const starsStartX = heroX + (heroW - starsTotalW) / 2;
    const filledCount =
      options.stats.total > 0 ? Math.round(options.stats.average) : 5;
    for (let i = 0; i < 5; i++) {
      const color = i < filledCount ? '#F59E0B' : '#334155';
      this.drawSolarIcon(ctx, 'star.svg', starsStartX + i * starGap, heroY + 152, 24, color);
    }

    ctx.direction = 'rtl';
    ctx.fillStyle = '#CBD5E1';
    ctx.font = '400 14px "AlexandriaRegular", "Alexandria", sans-serif';
    ctx.fillText(`بناء على ${options.stats.total} تقييم`, heroX + heroW / 2, heroY + 190);

    const distX = 368;
    const distY = 136;
    const distW = width - distX - 52;
    const distH = 228;
    this.drawRoundedRect(ctx, distX, distY, distW, distH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fill();

    const levels: (5 | 4 | 3 | 2 | 1)[] = [5, 4, 3, 2, 1];
    const barColors: Record<number, string> = {
      5: '#F59E0B',
      4: '#10B981',
      3: '#38BDF8',
      2: '#F97316',
      1: '#EF4444',
    };

    for (let idx = 0; idx < levels.length; idx++) {
      const starLevel = levels[idx];
      const rowY = distY + 28 + idx * 38;
      const count = options.stats.distribution[starLevel] ?? 0;
      const ratio = options.stats.total > 0 ? count / options.stats.total : 0;
      const pct = Math.round(ratio * 100);

      this.drawSolarIcon(ctx, 'star.svg', distX + distW - 44, rowY + 2, 18, barColors[starLevel]);

      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '700 15px "Alexandria", sans-serif';
      ctx.fillText(`${starLevel}`, distX + distW - 52, rowY + 12);

      const trackX = distX + 112;
      const trackW = distW - 188;
      const trackH = 12;
      const trackY = rowY + 6;
      this.drawRoundedRect(ctx, trackX, trackY, trackW, trackH, 6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();

      if (ratio > 0) {
        const fillW = Math.max(12, trackW * ratio);
        this.drawRoundedRect(ctx, trackX, trackY, fillW, trackH, 6);
        ctx.fillStyle = barColors[starLevel];
        ctx.fill();
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#94A3B8';
      ctx.font = '700 13px "Alexandria", sans-serif';
      ctx.fillText(`${count} (${pct}%)`, distX + 24, rowY + 12);
    }

    const kpiY = 390;
    const kpiGap = 18;
    const kpiW = (width - 104 - kpiGap * 3) / 4;
    const kpiH = 114;

    const kpis: { label: string; value: string; icon: string; color: string }[] = [
      {
        label: 'إجمالي الفيدباك',
        value: String(options.stats.total),
        icon: 'chat-round-quote.svg',
        color: '#818CF8',
      },
      {
        label: 'نسبة الرضا',
        value: `${options.stats.satisfactionRate}%`,
        icon: 'verified-check.svg',
        color: '#10B981',
      },
      {
        label: 'العملاء المقيمون',
        value: String(options.stats.uniqueReviewers),
        icon: 'users-group-rounded.svg',
        color: '#38BDF8',
      },
      {
        label: 'حاملو رتبة عميل',
        value: String(options.verifiedClientsCount),
        icon: 'user-check-rounded.svg',
        color: '#F59E0B',
      },
    ];

    for (let i = 0; i < kpis.length; i++) {
      const kpi = kpis[i];
      const kx = 52 + i * (kpiW + kpiGap);
      this.drawRoundedRect(ctx, kx, kpiY, kpiW, kpiH, 20);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.fill();

      this.drawSolarIcon(ctx, kpi.icon, kx + kpiW - 38, kpiY + 20, 20, kpi.color);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#94A3B8';
      ctx.font = '400 13px "AlexandriaRegular", "Alexandria", sans-serif';
      ctx.fillText(kpi.label, kx + kpiW - 46, kpiY + 22);

      ctx.direction = 'ltr';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 28px "Alexandria", sans-serif';
      ctx.fillText(kpi.value, kx + kpiW / 2, kpiY + 58);
    }

    ctx.restore();
    return canvas.toBuffer('image/png');
  }
}
