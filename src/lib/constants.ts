/**
 * アプリケーション全体で使用される定数
 */

// API Base URL - 環境変数から取得するか、デフォルト値を使用
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
  '育毛剤': { bg: '#F6FFED', text: '#52C41A', border: '#B7EB8F' },
  '除毛/脱毛': { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  
  // 医療・健康系（青系）
  '健康食品': { bg: '#EFFCFC', text: '#0D9488', border: '#A5F3FC' },
  '花粉症': { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  'ホワイトニング/口臭': { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  'ワキガ/汗': { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
  'フェムケア/育乳': { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  '精力剤': { bg: '#FAF5FF', text: '#9333EA', border: '#E9D5FF' },
  'クリニック': { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
  
  // 生活・その他（オレンジ系）
  '転職': { bg: '#FFF7ED', text: '#EA580C', border: '#FDBA74' },
  '占い': { bg: '#FFFBEB', text: '#D97706', border: '#FED7AA' },
  '香水': { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  
  // その他
  'その他': { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' }
} as const;

// 新しいアフィリエイトタイプの色定義
export const AFFILIATE_TYPE_COLORS = {
  'アフィリエイト': { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  '自社ページ': { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC' }
} as const;

// インフルエンサータイプの色定義（旧ACCOUNT_TYPE_COLORSから「アフィリエイト」と「自社ページ」を除いたもの）
export const INFLUENCER_TYPE_COLORS = {
  // エンターテイメント・コンテンツ（オレンジ系）
  'エンタメ・おもしろ': { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  'アニメ・ショートドラマ': { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
  
  // インフルエンサー系（黄色〜黄緑系）
  '男性インフルエンサー': { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A' },
  '女性インフルエンサー': { bg: '#FAFAF5', text: '#856D20', border: '#F7FEE7' },
  '男女インフルエンサー': { bg: '#F7FEE7', text: '#4D7C0F', border: '#D9F99D' },
  '男性タレント・俳優': { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  '女性タレント・女優': { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  'アーティスト': { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' },
  
  // 健康・美容系（水色〜青系）
  '健康・フィットネス': { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
  '美容': { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  '医療': { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },
  
  // 知識・教育系（青紫系）
  '教育': { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  '社会・時事': { bg: '#FAF5FF', text: '#6D28D9', border: '#E9D5FF' },
  'ビジネス': { bg: '#FDF4FF', text: '#7E22CE', border: '#F5D0FE' },
  
  // ライフスタイル系（紫系）
  'ライフスタイル': { bg: '#FDF4FF', text: '#A21CAF', border: '#F5D0FE' },
  'グルメ': { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  
  // 趣味・特殊興味系（赤紫系）
  '動物': { bg: '#FEE2E2', text: '#BE123C', border: '#FECACA' },
  
  // スポーツ系（濃い赤系）
  'スポーツ': { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  
  // 恋愛系（ピンク系）
  '恋愛': { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' }
} as const;

// 企業・法人タイプごとのカラー定義
export const CORPORATE_TYPE_COLORS = {
  // グループ1: 飲食・食品系（赤系）
  '飲食店': { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  '食料品': { bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA' },
  
  // グループ2: 美容・健康・医療系（ピンク〜紫系）
  '美容・クリニック': { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  '医療・福祉施設': { bg: '#FAE8FF', text: '#A21CAF', border: '#F5D0FE' },
  '化粧品・美容品': { bg: '#FDF4FF', text: '#C026D3', border: '#F5D0FE' },
  'ジム': { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  
  // グループ3: エンターテイメント・接客系（オレンジ〜黄色系）
  '夜間接客業': { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
  '娯楽・エンタメ': { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  'メイドカフェ・コンカフェ': { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  'ホテル・旅館': { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A' },
  
  // グループ4: 教育・専門サービス系（黄緑系）
  '学校・スクール': { bg: '#F7FEE7', text: '#4D7C0F', border: '#D9F99D' },
  '士業・金融': { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  '代行業・コンサル': { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
  
  // グループ5: 小売・商品系（緑系）
  'ファッション': { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' },
  '生活・住宅用品': { bg: '#EFFCFC', text: '#0D9488', border: '#A5F3FC' },
  '家電・電子機器': { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC' },
  
  // グループ6: 技術・製造系（水色〜青系）
  '自動車・車両機器': { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
  '工具・機械・オフィス関連': { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  'IT・Web・広告': { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
  '製造業(工場)': { bg: '#E0F2FE', text: '#0C4A6E', border: '#7DD3FC' },
  
  // グループ7: インフラ・建設系（濃い青系）
  '建設': { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
  '電気・水道・ガス系': { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  '不動産': { bg: '#EEF2FF', text: '#312E81', border: '#A5B4FC' },
  
  // グループ8: ライフサービス系（青紫系）
  'ライフイベント関連': { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  '買取査定・リサイクル': { bg: '#FAF5FF', text: '#6D28D9', border: '#E9D5FF' },
  'クリーニング・清掃': { bg: '#FDF4FF', text: '#7E22CE', border: '#F5D0FE' },
  '人材': { bg: '#FBE9F9', text: '#A21CAF', border: '#F9A8D4' },
  
  // グループ9: 物流・一次産業系（茶色系）
  '物流・運送・交通': { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  '農林水産': { bg: '#F6F3E7', text: '#78716C', border: '#E7E5E4' },
  
  // グループ10: アウトドア・動物系（自然緑系）
  'アウトドア・スポーツ': { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
  '動物系': { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  
  // グループ11: 公的・セキュリティ系（グレー系）
  '行政': { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
  '警備保障': { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1' },
  
  // グループ12: メディア・情報系（シアン系）
  'メディア・情報サイト': { bg: '#CFFAFE', text: '#0F766E', border: '#5EEAD4' },
  
  // グループ13: スピリチュアル・恋愛系（マゼンタ系）
  '恋愛・婚活系': { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' },
  
  // グループ14: 特殊用途・その他（ニュートラル系）
  'その他': { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' },
  
  // グループ15: ビジネス活動系（アクティブカラー）
  '採用': { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  '集客': { bg: '#FED7AA', text: '#C2410C', border: '#FDBA74' }
} as const;

// デフォルトのジャンル色
export const DEFAULT_GENRE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// デフォルトのアカウントタイプ色
export const DEFAULT_ACCOUNT_TYPE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// デフォルトの企業タイプ色
export const DEFAULT_CORPORATE_TYPE_COLOR = { bg: '#F9FAFB', text: '#4B5563', border: '#E5E7EB' };

// 視覚的に区別しやすいよう色を分散配置した色パレット
export const FILTER_COLOR_PALETTE = [
  { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' }, // 赤
  { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' }, // 青
  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' }, // オレンジ
  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' }, // 緑
  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' }, // 紫
  { bg: '#FCE7F3', text: '#DB2777', border: '#FBCFE8' }, // ピンク
  { bg: '#F0FDFA', text: '#0D9488', border: '#99F6E4' }, // ティール
  { bg: '#FEFCE8', text: '#A16207', border: '#FEF08A' }, // イエロー
  { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' }, // インディゴ
  { bg: '#F0FDF4', text: '#047857', border: '#BBF7D0' }, // エメラルド
  { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' }, // アンバー
  { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' }, // ローズ
  { bg: '#FAF5FF', text: '#5B21B6', border: '#E9D5FF' }, // バイオレット
  { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC' }, // シアン
  { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' }, // オレンジレッド
  { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' }, // グリーン
  { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' }, // ブルー
  { bg: '#FCE7F3', text: '#BE1E6E', border: '#F9A8D4' }, // マゼンタ
  { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' }, // ティールダーク
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }  // ブラウン
] as const;

// 商品名から色オブジェクトを取得するヘルパー関数（改良版）
export const getProductColorFromName = (productName: string) => {
  // FNV-1a ハッシュアルゴリズムを使用してより分散したハッシュ値を生成
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < productName.length; i++) {
    hash ^= productName.charCodeAt(i);
    hash *= 16777619; // FNV prime
    hash = hash >>> 0; // 32bit unsigned integer conversion
  }
  
  // 追加の分散処理
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >>> 16) ^ hash;
  
  // ハッシュ値を色パレットのインデックスに変換
  const index = Math.abs(hash) % FILTER_COLOR_PALETTE.length;
  return FILTER_COLOR_PALETTE[index];
};

// その他の定数をここに追加 

// 既存の定数を活用したヘルパー関数
export const getAffiliateAccountTypes = () => Object.keys(AFFILIATE_TYPE_COLORS);
export const getInfluencerAccountTypes = () => Object.keys(INFLUENCER_TYPE_COLORS);
export const getCorporateAccountTypes = () => Object.keys(CORPORATE_TYPE_COLORS);
export const getAllAccountTypes = () => [...getAffiliateAccountTypes(), ...getInfluencerAccountTypes(), ...getCorporateAccountTypes()];

// カラー取得のヘルパー関数の更新
export const getAccountTypeColor = (accountType: string, context?: 'affiliate' | 'influencer' | 'corporate' | 'all') => {
  if (context === 'affiliate') {
    return accountType in AFFILIATE_TYPE_COLORS
      ? AFFILIATE_TYPE_COLORS[accountType as keyof typeof AFFILIATE_TYPE_COLORS]
      : DEFAULT_ACCOUNT_TYPE_COLOR;
  } else if (context === 'influencer') {
    return accountType in INFLUENCER_TYPE_COLORS
      ? INFLUENCER_TYPE_COLORS[accountType as keyof typeof INFLUENCER_TYPE_COLORS]
      : DEFAULT_ACCOUNT_TYPE_COLOR;
  } else if (context === 'corporate') {
    return accountType in CORPORATE_TYPE_COLORS
      ? CORPORATE_TYPE_COLORS[accountType as keyof typeof CORPORATE_TYPE_COLORS]
      : DEFAULT_ACCOUNT_TYPE_COLOR;
  } else {
    // 優先順位: アフィリエイト → インフルエンサー → 企業
    return accountType in AFFILIATE_TYPE_COLORS
      ? AFFILIATE_TYPE_COLORS[accountType as keyof typeof AFFILIATE_TYPE_COLORS]
      : accountType in INFLUENCER_TYPE_COLORS
        ? INFLUENCER_TYPE_COLORS[accountType as keyof typeof INFLUENCER_TYPE_COLORS]
        : accountType in CORPORATE_TYPE_COLORS
          ? CORPORATE_TYPE_COLORS[accountType as keyof typeof CORPORATE_TYPE_COLORS]
          : DEFAULT_ACCOUNT_TYPE_COLOR;
  }
}; 