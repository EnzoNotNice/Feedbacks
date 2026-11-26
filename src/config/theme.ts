export const THEME_COLORS = {
  primary: 0x5865f2,
  gold: 0xf59e0b,
  success: 0x10b981,
  warning: 0xf59e0b,
  danger: 0xef4444,
  neutral: 0x2b2d31,
  indigo: 0x6366f1,
} as const;

export const RATING_COLORS: Record<number, number> = {
  5: 0xf59e0b,
  4: 0x10b981,
  3: 0x38bdf8,
  2: 0xf97316,
  1: 0xef4444,
};

export const DEFAULT_SERVICES = [
  'برمجة بوت ديسكورد',
  'تطوير موقع ويب',
  'تجهيز وحماية سيرفر',
  'تصميم وهوية بصرية',
  'دعم واستشارة تقنية',
] as const;
