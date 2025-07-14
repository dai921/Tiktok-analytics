// タブ別のデフォルト表示カラム設定
export const TAB_DEFAULT_COLUMNS = {
  all: [
    'thumbnail_url',
    'account_type',
    'createdAt',
    'views',
    'viewsIncrease',
    'ten_days_increase',
    'likes',
    'comments',
    'account_name',
    'hashtags',
    'audioTitle'
  ],
  affiliate: [
    'thumbnail_url',
    'account_type',
    'category',
    'product',
    'createdAt',
    'views',
    'viewsIncrease',
    'ten_days_increase',
    'likes',
    'comments',
    'account_name',
    'hashtags',
    'audioTitle'
  ],
  corporate: [
    'thumbnail_url',
    'account_type',
    'createdAt',
    'views',
    'viewsIncrease',
    'ten_days_increase',
    'likes',
    'comments',
    'account_name',
    'hashtags',
    'audioTitle'
  ],
  influencer: [
    'thumbnail_url',
    'account_type',
    'createdAt',
    'views',
    'viewsIncrease',
    'ten_days_increase',
    'likes',
    'comments',
    'account_name',
    'hashtags',
    'audioTitle'
  ]
};

export type TabType = keyof typeof TAB_DEFAULT_COLUMNS;

// タブタイプを取得する関数
export function getCurrentTabType(
  isPrOnly: boolean,
  isCorporateOnly: boolean,
  isInfluencerOnly: boolean
): TabType {
  if (isPrOnly) return 'affiliate';
  if (isCorporateOnly) return 'corporate';
  if (isInfluencerOnly) return 'influencer';
  return 'all';
}
