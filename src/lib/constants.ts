/**
 * アプリケーション全体で使用される定数
 */

// API Base URL - 環境変数から取得するか、デフォルト値を使用
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// TikTokのブランドカラー
export const TIKTOK_COLORS = {
  black: "#000000",
  cyan: "#25F4EE",
  red: "#FE2C55",
  white: "#FFFFFF",
  green: "#4CAF50"
} as const;

// ジャンルごとのカラー定義
export const GENRE_COLORS = {
  // 美容・スキンケア系（赤系）
  'ダイエット/着圧': { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  'スキンケア': { bg: '#FFF5F6', text: '#DB2777', border: '#FBCFE8' },
  'ビタミンC/美白': { bg: '#FCE7F3', text: '#EC4899', border: '#FBCFE8' },
  'ボディケア': { bg: '#FAE8FF', text: '#D946EF', border: '#F5D0FE' },
  '目元': { bg: '#F5EEFF', text: '#A855F7', border: '#E9D5FF' },
  
  // ヘアケア・除毛系（緑系）
  'ヘアケア': { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  '除毛/脱毛': { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  
  // 医療・健康系（青系）
  '花粉症': { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  'ホワイトニング/口臭': { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  'ワキガ/汗': { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
  'フェムケア/育乳': { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  '精力剤': { bg: '#FAF5FF', text: '#9333EA', border: '#E9D5FF' },
  
  // 生活・その他（オレンジ系）
  '転職': { bg: '#FFF7ED', text: '#EA580C', border: '#FDBA74' },
  '占い': { bg: '#FFFBEB', text: '#D97706', border: '#FED7AA' },
  '香水': { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  
  // その他
  'その他': { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' }
} as const;

// デフォルトのジャンル色
export const DEFAULT_GENRE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// その他の定数をここに追加 