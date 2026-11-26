import { createCanvas, GlobalFonts, Path2D, SKRSContext2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { emojiService } from '../src/services/emojiService.js';
import { logger } from '../src/utils/logger.js';

function drawRoundedRect(
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

function registerFonts(): void {
  const boldFont = path.resolve(process.cwd(), 'assets', 'fonts', 'Alexandria-Bold.ttf');
  const regFont = path.resolve(process.cwd(), 'assets', 'fonts', 'Alexandria-Regular.ttf');
  if (fs.existsSync(boldFont)) GlobalFonts.registerFromPath(boldFont, 'Alexandria');
  if (fs.existsSync(regFont)) GlobalFonts.registerFromPath(regFont, 'AlexandriaRegular');
}

function drawSolarSvgVector(
  ctx: SKRSContext2D,
  svgFile: string,
  x: number,
  y: number,
  size: number,
  fillStyle: string | CanvasGradient
): void {
  const fullPath = path.resolve(process.cwd(), 'assets', 'enzo-icons', 'bold', svgFile);
  if (!fs.existsSync(fullPath)) return;
  const svg = fs.readFileSync(fullPath, 'utf-8');
  const matches = Array.from(svg.matchAll(/d="([^"]+)"/g)).map((m) => m[1]);
  const combined = new Path2D();
  for (const d of matches) {
    combined.addPath(new Path2D(d));
  }
  const scale = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = fillStyle;
  ctx.fill(combined, 'evenodd');
  ctx.restore();
}

function paintDarkSurface(ctx: SKRSContext2D, width: number, height: number, radius: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  drawRoundedRect(ctx, 0, 0, width, height, radius);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#070A11');
  bg.addColorStop(0.55, '#0C1220');
  bg.addColorStop(1, '#080B14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function drawEmblemWithStars(
  ctx: SKRSContext2D,
  options: {
    x: number;
    y: number;
    size: number;
    radius: number;
    iconSize: number;
    starSize: number;
    starGap: number;
    starsOffsetY: number;
  }
): void {
  const { x, y, size, radius, iconSize, starSize, starGap, starsOffsetY } = options;

  drawRoundedRect(ctx, x, y, size, size, radius);
  const emblemFill = ctx.createLinearGradient(x, y, x + size, y + size);
  emblemFill.addColorStop(0, 'rgba(24, 33, 56, 0.88)');
  emblemFill.addColorStop(1, 'rgba(13, 18, 32, 0.95)');
  ctx.fillStyle = emblemFill;
  ctx.fill();

  const emblemBorder = ctx.createLinearGradient(x, y, x, y + size);
  emblemBorder.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  emblemBorder.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
  ctx.strokeStyle = emblemBorder;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const iconGrad = ctx.createLinearGradient(0, 0, 24, 24);
  iconGrad.addColorStop(0, '#F8FAFC');
  iconGrad.addColorStop(1, '#A5B4FC');
  const iconOffset = (size - iconSize) / 2;
  drawSolarSvgVector(ctx, 'chat-round-like.svg', x + iconOffset, y + iconOffset, iconSize, iconGrad);

  const starsTotalWidth = 4 * starGap + starSize;
  const starsStartX = x + (size - starsTotalWidth) / 2;
  for (let i = 0; i < 5; i++) {
    drawSolarSvgVector(ctx, 'star.svg', starsStartX + i * starGap, y + size + starsOffsetY, starSize, '#F59E0B');
  }
}

function drawAccentBar(ctx: SKRSContext2D, x: number, y: number, w: number): void {
  drawRoundedRect(ctx, x, y, w, 3, 1.5);
  const accentGrad = ctx.createLinearGradient(x, 0, x + w, 0);
  accentGrad.addColorStop(0, '#F59E0B');
  accentGrad.addColorStop(1, '#6366F1');
  ctx.fillStyle = accentGrad;
  ctx.fill();
}

function generateBanner(): Buffer {
  registerFonts();

  const width = 1200;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  paintDarkSurface(ctx, width, height, 32);

  const rightGlow = ctx.createRadialGradient(980, 95, 20, 980, 95, 520);
  rightGlow.addColorStop(0, 'rgba(99, 102, 241, 0.14)');
  rightGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, width, height);

  const leftIndigoGlow = ctx.createRadialGradient(178, 155, 12, 178, 155, 320);
  leftIndigoGlow.addColorStop(0, 'rgba(99, 102, 241, 0.09)');
  leftIndigoGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.fillStyle = leftIndigoGlow;
  ctx.fillRect(0, 0, width, height);

  const leftGoldGlow = ctx.createRadialGradient(178, 248, 8, 178, 248, 200);
  leftGoldGlow.addColorStop(0, 'rgba(245, 158, 11, 0.06)');
  leftGoldGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = leftGoldGlow;
  ctx.fillRect(0, 0, width, height);

  drawEmblemWithStars(ctx, {
    x: 116,
    y: 102,
    size: 124,
    radius: 32,
    iconSize: 58,
    starSize: 16,
    starGap: 24,
    starsOffsetY: 18,
  });

  const rightEdge = width - 96;
  drawAccentBar(ctx, rightEdge - 56, 116, 56);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 56px "Alexandria", sans-serif';
  ctx.fillText('آراء وفيدباك العملاء', rightEdge, 140);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 21px "AlexandriaRegular", "Alexandria", sans-serif';
  ctx.fillText('تجارب حقيقية تعكس جودة العمل ومستوى الخدمة', rightEdge, 222);

  ctx.restore();
  return canvas.toBuffer('image/png');
}

function generateGithubPreview(): Buffer {
  registerFonts();

  const width = 1280;
  const height = 640;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  paintDarkSurface(ctx, width, height, 32);

  const centerX = width / 2;

  const topGlow = ctx.createRadialGradient(centerX, 195, 24, centerX, 195, 580);
  topGlow.addColorStop(0, 'rgba(99, 102, 241, 0.14)');
  topGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, height);

  const goldGlow = ctx.createRadialGradient(centerX, 305, 12, centerX, 305, 280);
  goldGlow.addColorStop(0, 'rgba(245, 158, 11, 0.065)');
  goldGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = goldGlow;
  ctx.fillRect(0, 0, width, height);

  const emblemSize = 132;
  drawEmblemWithStars(ctx, {
    x: centerX - emblemSize / 2,
    y: 142,
    size: emblemSize,
    radius: 34,
    iconSize: 62,
    starSize: 18,
    starGap: 28,
    starsOffsetY: 20,
  });

  drawAccentBar(ctx, centerX - 32, 342, 64);

  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '700 62px "Alexandria", sans-serif';
  ctx.fillText('آراء وفيدباك العملاء', centerX, 368);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 23px "AlexandriaRegular", "Alexandria", sans-serif';
  ctx.fillText('نظام متكامل لإدارة تقييمات وآراء العملاء على ديسكورد', centerX, 456);

  ctx.restore();
  return canvas.toBuffer('image/png');
}

function generateDivider(): Buffer {
  const width = 1000;
  const height = 10;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, 'rgba(99, 102, 241, 0)');
  grad.addColorStop(0.25, 'rgba(99, 102, 241, 0.45)');
  grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.75)');
  grad.addColorStop(0.75, 'rgba(99, 102, 241, 0.45)');
  grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

  drawRoundedRect(ctx, 40, 3, width - 80, 4, 2);
  ctx.fillStyle = grad;
  ctx.fill();

  return canvas.toBuffer('image/png');
}

function main(): void {
  const force = process.argv.includes('--force');
  const count = emojiService.ensureLocalPngs(force);
  logger.success('ASSETS', `Generated ${count} Enzo emoji PNG assets`);

  const assetsDir = path.resolve(process.cwd(), 'assets');
  fs.writeFileSync(path.join(assetsDir, 'banner.png'), generateBanner());
  fs.writeFileSync(path.join(assetsDir, 'divider.png'), generateDivider());
  fs.writeFileSync(path.join(assetsDir, 'github-preview.png'), generateGithubPreview());
  logger.success('ASSETS', 'Generated banner.png, divider.png, and github-preview.png');
}

main();
