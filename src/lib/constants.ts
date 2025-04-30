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
  '健康食品': { bg: '#EFFCFC', text: '#0D9488', border: '#A5F3FC' },
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

// アカウントタイプごとのカラー定義
export const ACCOUNT_TYPE_COLORS = {
  // グループ1: アフィリエイト（赤系）
  'アフィリエイト': { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  
  // グループ2: エンターテイメント・コンテンツ（オレンジ系）
  'エンタメ・おもしろ': { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  'アニメ・ショートドラマ': { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
  
  // グループ3: インフルエンサー系（黄色〜黄緑系）
  '男性インフルエンサー': { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A' },
  '女性インフルエンサー': { bg: '#FAFAF5', text: '#856D20', border: '#F7FEE7' },
  '男女インフルエンサー': { bg: '#F7FEE7', text: '#4D7C0F', border: '#D9F99D' },
  '男性タレント・俳優': { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  '女性タレント・女優': { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  'アーティスト': { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' },
  
  // グループ4: 自社ページ（青緑系）
  '自社ページ': { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC' },
  
  // グループ5: 健康・美容系（水色〜青系）
  '健康・フィットネス': { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
  '美容': { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  '医療': { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
  
  // グループ6: 知識・教育系（青紫系）
  '教育': { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  '社会・時事': { bg: '#FAF5FF', text: '#6D28D9', border: '#E9D5FF' },
  'ビジネス': { bg: '#FDF4FF', text: '#7E22CE', border: '#F5D0FE' },
  
  // グループ7: ライフスタイル系（紫系）
  'ライフスタイル': { bg: '#FDF4FF', text: '#A21CAF', border: '#F5D0FE' },
  'グルメ': { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  
  // グループ8: 趣味・特殊興味系（赤紫系）
  '占い': { bg: '#FBE9F9', text: '#C01A79', border: '#F9A8D4' },
  '動物': { bg: '#FEE2E2', text: '#BE123C', border: '#FECACA' },
  
  // グループ9: スポーツ系（濃い赤系）
  'スポーツ': { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  
  // グループ10: 恋愛系（ピンク系）
  '恋愛': { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' }
} as const;

// デフォルトのジャンル色
export const DEFAULT_GENRE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// デフォルトのアカウントタイプ色
export const DEFAULT_ACCOUNT_TYPE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// その他の定数をここに追加 