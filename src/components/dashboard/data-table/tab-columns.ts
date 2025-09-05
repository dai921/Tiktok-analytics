// タブ別のデフォルト表示カラム設定
export const TAB_DEFAULT_COLUMNS = {
  all: [
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
    'play_count_per_follower',
    'account_name',
    'hashtags',
    'audioTitle'
  ],
  affiliate: [
    'thumbnail_url',
    'category',
    'product',
    'createdAt',
    'views',
    'viewsIncrease',
    'ten_days_increase',
    'likes',
    'comments',
    'play_count_per_follower',
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
    'play_count_per_follower',
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
    'play_count_per_follower',
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

export const TAB_FILTER_FIELDS = {
  all: {
    date: ['createdAt'],
    metrics: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower'],
    categories: ['content_type', 'category', 'product', 'account_type'], 
    text: ['account_name', 'hashtags', 'audioTitle'],
    sort: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower']
  },
  affiliate: {
    date: ['createdAt'],
    metrics: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower'],
    categories: ['content_type', 'category', 'product'], // account_typeを除外
    text: ['account_name', 'hashtags', 'audioTitle'],
    sort: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower']
  },
  corporate: {
    date: ['createdAt'],
    metrics: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower'],
    categories: ['content_type', 'account_type'], // category, productを除外
    text: ['account_name', 'hashtags', 'audioTitle'],
    sort: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower']
  },
  influencer: {
    date: ['createdAt'],
    metrics: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower'],
    categories: ['content_type', 'account_type'], // category, productを除外
    text: ['account_name', 'hashtags', 'audioTitle'],
    sort: ['views', 'viewsIncrease', 'ten_days_increase', 'likes', 'likes_count_increase', 'ten_days_likes_increase', 'comments', 'comment_count_increase', 'ten_days_comment_increase', 'saves', 'saves_count_increase', 'ten_days_saves_increase',  'play_count_per_follower', 'play_increase_per_follower']
  }
};

// 現在のタブに応じたフィルタ設定を取得する関数
export function getTabFilterFields(tabType: TabType) {
  return TAB_FILTER_FIELDS[tabType] || TAB_FILTER_FIELDS.all;
}
