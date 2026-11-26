export interface EmojiSpec {
  key: string;
  name: string;
  svgFile: string;
  gradient: [string, string, string];
  fallback: string;
}

export const EMOJI_SPECS: EmojiSpec[] = [
  {
    key: 'star',
    name: 'fb_star',
    svgFile: 'star.svg',
    gradient: ['#FDE047', '#F59E0B', '#D97706'],
    fallback: '*',
  },
  {
    key: 'starOff',
    name: 'fb_star_off',
    svgFile: 'star.svg',
    gradient: ['#475569', '#334155', '#1E293B'],
    fallback: '-',
  },
  {
    key: 'verified',
    name: 'fb_verified',
    svgFile: 'verified-check.svg',
    gradient: ['#6EE7B7', '#10B981', '#059669'],
    fallback: '',
  },
  {
    key: 'check',
    name: 'fb_check',
    svgFile: 'check-circle.svg',
    gradient: ['#6EE7B7', '#10B981', '#059669'],
    fallback: '',
  },
  {
    key: 'cross',
    name: 'fb_cross',
    svgFile: 'close-circle.svg',
    gradient: ['#FDA4AF', '#EF4444', '#DC2626'],
    fallback: '',
  },
  {
    key: 'warn',
    name: 'fb_warn',
    svgFile: 'danger-triangle.svg',
    gradient: ['#FDE047', '#F59E0B', '#D97706'],
    fallback: '',
  },
  {
    key: 'info',
    name: 'fb_info',
    svgFile: 'info-circle.svg',
    gradient: ['#93C5FD', '#38BDF8', '#0284C7'],
    fallback: '',
  },
  {
    key: 'user',
    name: 'fb_user',
    svgFile: 'user-rounded.svg',
    gradient: ['#F8FAFC', '#CBD5E1', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'users',
    name: 'fb_users',
    svgFile: 'users-group-rounded.svg',
    gradient: ['#C7D2FE', '#818CF8', '#6366F1'],
    fallback: '',
  },
  {
    key: 'client',
    name: 'fb_client',
    svgFile: 'user-check-rounded.svg',
    gradient: ['#6EE7B7', '#10B981', '#059669'],
    fallback: '',
  },
  {
    key: 'block',
    name: 'fb_block',
    svgFile: 'user-block-rounded.svg',
    gradient: ['#FDA4AF', '#EF4444', '#B91C1C'],
    fallback: '',
  },
  {
    key: 'crown',
    name: 'fb_crown',
    svgFile: 'crown-star.svg',
    gradient: ['#FEF08A', '#F59E0B', '#B45309'],
    fallback: '',
  },
  {
    key: 'trophy',
    name: 'fb_trophy',
    svgFile: 'cup-first.svg',
    gradient: ['#FDE047', '#F59E0B', '#D97706'],
    fallback: '',
  },
  {
    key: 'medal',
    name: 'fb_medal',
    svgFile: 'medal-ribbon-star.svg',
    gradient: ['#FCD34D', '#F59E0B', '#D97706'],
    fallback: '',
  },
  {
    key: 'chart',
    name: 'fb_chart',
    svgFile: 'chart-2.svg',
    gradient: ['#A5B4FC', '#6366F1', '#4F46E5'],
    fallback: '',
  },
  {
    key: 'chat',
    name: 'fb_chat',
    svgFile: 'chat-round-quote.svg',
    gradient: ['#93C5FD', '#3B82F6', '#2563EB'],
    fallback: '',
  },
  {
    key: 'like',
    name: 'fb_like',
    svgFile: 'chat-round-like.svg',
    gradient: ['#FBCFE8', '#F43F5E', '#E11D48'],
    fallback: '',
  },
  {
    key: 'heart',
    name: 'fb_heart',
    svgFile: 'heart.svg',
    gradient: ['#FDA4AF', '#F43F5E', '#E11D48'],
    fallback: '',
  },
  {
    key: 'reply',
    name: 'fb_reply',
    svgFile: 'reply.svg',
    gradient: ['#7DD3FC', '#38BDF8', '#0284C7'],
    fallback: '',
  },
  {
    key: 'edit',
    name: 'fb_edit',
    svgFile: 'pen-new-square.svg',
    gradient: ['#F8FAFC', '#CBD5E1', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'trash',
    name: 'fb_trash',
    svgFile: 'trash-bin-trash.svg',
    gradient: ['#FDA4AF', '#EF4444', '#DC2626'],
    fallback: '',
  },
  {
    key: 'settings',
    name: 'fb_settings',
    svgFile: 'settings-minimalistic.svg',
    gradient: ['#F8FAFC', '#CBD5E1', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'shield',
    name: 'fb_shield',
    svgFile: 'shield-check.svg',
    gradient: ['#6EE7B7', '#10B981', '#047857'],
    fallback: '',
  },
  {
    key: 'tag',
    name: 'fb_tag',
    svgFile: 'tag.svg',
    gradient: ['#DDD6FE', '#8B5CF6', '#6D28D9'],
    fallback: '',
  },
  {
    key: 'clock',
    name: 'fb_clock',
    svgFile: 'clock-circle.svg',
    gradient: ['#F8FAFC', '#CBD5E1', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'refresh',
    name: 'fb_refresh',
    svgFile: 'refresh-circle.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'filter',
    name: 'fb_filter',
    svgFile: 'filter.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'search',
    name: 'fb_search',
    svgFile: 'magnifier.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'sparkles',
    name: 'fb_sparkles',
    svgFile: 'sparkles.svg',
    gradient: ['#BAE6FD', '#38BDF8', '#0284C7'],
    fallback: '',
  },
  {
    key: 'export',
    name: 'fb_export',
    svgFile: 'export.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'prev',
    name: 'fb_prev',
    svgFile: 'alt-arrow-right.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'next',
    name: 'fb_next',
    svgFile: 'alt-arrow-left.svg',
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'lock',
    name: 'fb_lock',
    svgFile: 'lock-keyhole.svg',
    gradient: ['#FDE68A', '#F59E0B', '#B45309'],
    fallback: '',
  },
  {
    key: 'send',
    name: 'fb_send',
    svgFile: 'chat-round-add.svg',
    gradient: ['#C7D2FE', '#818CF8', '#4F46E5'],
    fallback: '',
  },
  {
    key: 'doc',
    name: 'fb_doc',
    svgFile: 'document-text.svg',
    gradient: ['#F8FAFC', '#CBD5E1', '#94A3B8'],
    fallback: '',
  },
  {
    key: 'pin',
    name: 'fb_pin',
    svgFile: 'bookmark-check.svg',
    gradient: ['#DDD6FE', '#8B5CF6', '#6D28D9'],
    fallback: '',
  },
  {
    key: 'gallery',
    name: 'fb_gallery',
    svgFile: 'gallery-check.svg',
    gradient: ['#BAE6FD', '#38BDF8', '#0284C7'],
    fallback: '',
  },
];

export type EmojiKey =
  | 'star'
  | 'starOff'
  | 'verified'
  | 'check'
  | 'cross'
  | 'warn'
  | 'info'
  | 'user'
  | 'users'
  | 'client'
  | 'block'
  | 'crown'
  | 'trophy'
  | 'medal'
  | 'chart'
  | 'chat'
  | 'like'
  | 'heart'
  | 'reply'
  | 'edit'
  | 'trash'
  | 'settings'
  | 'shield'
  | 'tag'
  | 'clock'
  | 'refresh'
  | 'filter'
  | 'search'
  | 'sparkles'
  | 'export'
  | 'prev'
  | 'next'
  | 'lock'
  | 'send'
  | 'doc'
  | 'pin'
  | 'gallery';
