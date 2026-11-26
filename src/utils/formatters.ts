export function truncateText(value: string, maxLength: number = 3900): string {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function sanitizeDisplayText(value: string): string {
  return value
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .trim();
}

export function formatQuoteBlock(value: string, maxLength: number = 1400): string {
  const clean = sanitizeDisplayText(truncateText(value, maxLength));
  if (!clean) return '> -';
  return clean
    .split(/\r?\n/)
    .map((line) => `> ${line.trim()}`)
    .join('\n');
}

export function relativeTimestamp(epochMs: number): string {
  return `<t:${Math.floor(epochMs / 1000)}:R>`;
}

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(5, Math.round(value)));
}

export function buildProgressBar(ratio: number, length: number = 12): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * length);
  const empty = Math.max(0, length - filled);
  return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
