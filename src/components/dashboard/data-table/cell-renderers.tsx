// src/components/dashboard/data-table/cell-renderers.tsx
import { VideoData } from '@/types/dashboard';
import { VideoTypeIcon, PhotoTypeIcon, MusicNoteIcon } from './icons';
import { ImageHover } from '@/components/ui/image-hover';
import { GenreBadge, HashtagBadge, ProductBadge } from '@/components/ui/badge';
import { formatNumber, formatFollowerCount } from './formatters';
import { useState, createContext, useContext } from 'react'
import { AccountTypeBadge } from '@/components/ui/badge';

// コンテキスト作成
export const TableContext = createContext<{
  setSelectedText?: (data: { title: string; content: string }) => void;
  productCategories?: Record<string, string>;
}>({});

export const renderThumbnailCell = (row: VideoData) => {
  let thumbnailUrl = null;
  if (typeof row.thumbnail_url === 'string') {
    thumbnailUrl = row.thumbnail_url;
  } else if (row.thumbnail_url && typeof row.thumbnail_url === 'object') {
    thumbnailUrl = row.thumbnail_url.url;
  }

  // アカウント情報をマッピング
  const videoData = {
    views: row.views || 0,
    viewsIncrease: row.viewsIncrease || 0,
    ten_days_increase: row.ten_days_increase || 0,
    createdAt: row.createdAt || '',
    accountName: row.account_name || ''
  };

  return (
    <div className="relative w-[120px] h-[120px] my-1 mx-auto">
      <div className="relative w-full h-full overflow-hidden rounded">
        {thumbnailUrl ? (
          <ImageHover 
            src={thumbnailUrl} 
            alt="サムネイル" 
            videoUrl={row.url}
            videoData={videoData}
          />
        ) : (
          // サムネイルがない場合でも ImageHover を表示
          <div className="cursor-pointer">
            <ImageHover 
              src="/images/no-thumbnail.png" 
              alt="サムネイルなし" 
              videoUrl={row.url}
              videoData={videoData}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded pointer-events-none">
              <svg 
                className="w-8 h-8 text-gray-400" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M10 8l6 4-6 4V8z" />
              </svg>
            </div>
          </div>
        )}
        <div className="absolute bottom-[0px] right-[0px] bg-white/80 backdrop-blur-sm rounded-lg shadow-sm p-0.2">
          {row.content_type === 'video' ? (
            <VideoTypeIcon size={32} />
          ) : (
            <PhotoTypeIcon size={32} />
          )}
        </div>
      </div>
    </div>
  );
}


// カテゴリセルレンダラー
export const renderCategoryCell = (row: VideoData) => {
        // カテゴリが文字列かどうかをチェック
        const category = row.category;
        if (!category) return null;
        
        // カテゴリが文字列の場合
        if (typeof category === 'string') {
          // 複数のジャンルがカンマや区切り文字で分割されている場合
          if (category.includes(',') || category.includes('、')) {
            const genres = category
              .split(/[,、]/)
              .map(g => g.trim())
              .filter(Boolean);
              
            return (
              <div className="flex flex-wrap gap-1 justify-start items-center">
                {genres.map((genre, idx) => (
                  <GenreBadge key={idx} genre={genre} categoryForColor={genre} />
                ))}
              </div>
            );
          }
          return <div className="flex justify-start items-center"><GenreBadge genre={category} categoryForColor={category} /></div>;
        }
        
        // カテゴリが配列の場合（複数カテゴリに対応）
        if (Array.isArray(category)) {
          const allGenreBadges: React.ReactElement[] = [];
          
          // すべての要素を処理して、必要に応じて分割
          (category as string[]).forEach((cat: string, idx: number) => {
            // 区切り文字を含む場合は分割
            if (cat.includes(',') || cat.includes('、')) {
              const subGenres = cat
                .split(/[,、]/)
                .map(g => g.trim())
                .filter(Boolean);
                
              subGenres.forEach((genre, subIdx) => {
                allGenreBadges.push(<GenreBadge key={`${idx}-${subIdx}`} genre={genre} categoryForColor={genre} />);
              });
            } else {
              allGenreBadges.push(<GenreBadge key={idx} genre={cat} categoryForColor={cat} />);
            }
          });
          
          return (
            <div className="flex flex-wrap gap-1 justify-start items-center">
              {allGenreBadges}
            </div>
          );
        }
        
        return null;
};

// プロダクトセルレンダラー
export const createProductCellRenderer = () => {
  return (row: VideoData) => {
    return (
      <TableContext.Consumer>
        {(context) => {

          
          const productCategory = context.productCategories?.[row.product];
          
          return (
            <div className="w-[120px] min-w-[120px]">
              <div className="flex flex-wrap gap-1 justify-start items-center">
                {row.product && (
                  <ProductBadge 
                    product={row.product} 
                    productCategory={productCategory || 'その他'}
                  />
                )}
              </div>
            </div>
          );
        }}
      </TableContext.Consumer>
    );
  };
};

// 修正版のrenderProductCell
export const renderProductCell = (row: VideoData) => {
  // コンテキストからproductCategoriesを取得
  const { productCategories } = useContext(TableContext);
  

  
  // 警告ログを出力（参考用）
  console.warn('renderProductCell is deprecated, createProductCellRenderer should be used instead');
  
  // コンテキストからのproductCategoriesを使用する
  const renderFn = createProductCellRenderer();
  return renderFn(row);
};

// 日付セルレンダラー
export const renderDateCell = (row: VideoData) => {
    const date = row.createdAt;
    if (!date) return null;

    try {
    // ISO形式や標準的な日付文字列の場合
    const dateObj = new Date(date);
    if (!isNaN(dateObj.getTime())) {
        // YY/MM/DD形式に変換
        const year = dateObj.getFullYear().toString().slice(-2);
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        return (
        <div className="text-right font-medium text-gray-700">
            {`${year}/${month}/${day}`}
        </div>
        );
    }
    
    // すでに文字列として存在する日付形式の変換
    if (typeof date === 'string') {
        // YYYY-MM-DDパターンにマッチ
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
        const year = match[1].slice(-2);
        const month = match[2];
        const day = match[3];
        return (
            <div className="text-right font-medium text-gray-700">
            {`${year}/${month}/${day}`}
            </div>
        );
        }
    }
    
    return <div className="text-right text-gray-700">{date}</div>;
    } catch (e) {
    console.error('日付変換エラー:', e);
    return <div className="text-right text-gray-700">{date}</div>;
    }
};

// 目的・中ジャンルカラム共通のバッジ描画
const normalizeAccountSubtypeValues = (value?: string | string[] | null): string[] => {
  if (!value) return [];

  const values = Array.isArray(value) ? value : [value];
  const splitter = /[,、、，､･・\s]+/;

  const normalized = values
    .flatMap((item) => (item ?? '')
      .split(splitter)
      .map((token) => token.trim())
      .filter(Boolean)
    );

  return Array.from(new Set(normalized));
};

const renderAdditionalAccountTypeCell = (value?: string | string[] | null) => {
  const types = normalizeAccountSubtypeValues(value);

  return (
    <div className="w-[150px] min-w-[150px]">
      <div className="flex flex-wrap gap-1 justify-start items-center">
        {types.map((type, idx) => (
          <AccountTypeBadge key={`${type}-${idx}`} accountType={type} />
        ))}
      </div>
    </div>
  );
};

// アカウントジャンルセルレンダラー
export const renderAccountTypeCell = (row: VideoData) => { 
  const accountType = row.account_type;
  
  if (!accountType) {
    return (
      <div className="w-[120px] min-w-[120px]">
        <div className="flex flex-wrap gap-1 justify-start items-center">
          <span className="text-gray-400 text-xs">未設定</span>
        </div>
      </div>
    );
  }
  
  // 文字列の場合
  if (typeof accountType === 'string') {
    // 複数の種類がカンマや区切り文字で分割されている場合
    if (accountType.includes(',') || accountType.includes('、')) {
      const types = accountType
        .split(/[,、]/)
        .map(t => t.trim())
        .filter(Boolean);
        
      return (
        <div className="w-[120px] min-w-[120px]">
          <div className="flex flex-wrap gap-1 justify-start items-center">
            {types.map((type, idx) => (
              <AccountTypeBadge key={idx} accountType={type} />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="w-[120px] min-w-[120px]">
        <div className="flex flex-wrap gap-1 justify-start items-center">
          <AccountTypeBadge accountType={accountType} />
        </div>
      </div>
    );
  }
  
  // 配列の場合（複数タイプに対応）
  if (Array.isArray(accountType)) {
    const allTypeBadges: React.ReactElement[] = [];
    
    // すべての要素を処理して、必要に応じて分割
    (accountType as string[]).forEach((type: string, idx: number) => {
      // 区切り文字を含む場合は分割
      if (type.includes(',') || type.includes('、')) {
        const subTypes = type
          .split(/[,、]/)
          .map(t => t.trim())
          .filter(Boolean);
          
        subTypes.forEach((subType, subIdx) => {
          allTypeBadges.push(<AccountTypeBadge key={`${idx}-${subIdx}`} accountType={subType} />);
        });
      } else {
        allTypeBadges.push(<AccountTypeBadge key={idx} accountType={type} />);
      }
    });
    
    return (
      <div className="w-[120px] min-w-[120px]">
        <div className="flex flex-wrap gap-1 justify-start items-center">
          {allTypeBadges}
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-[120px] min-w-[120px]">
      <div className="flex flex-wrap gap-1 justify-start items-center">
        <span className="text-gray-400 text-xs">未設定</span>
      </div>
    </div>
  );
};

export const renderSecondAccountTypeCell = (row: VideoData) => {
  return renderAdditionalAccountTypeCell(row.second_account_type ?? null);
};

export const renderThirdAccountTypeCell = (row: VideoData) => {
  return renderAdditionalAccountTypeCell(row.third_account_type ?? null);
};

// 再生数セルレンダラー
export const renderViewsCell = (row: VideoData) => {
    return (
    <div className="text-right">
    {formatNumber(row.views, 'views')}
   </div>
  )
};

// 再生増加数セルレンダラー
export const renderViewsIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.viewsIncrease, 'viewsIncrease')}
    </div>
    )
};

// 10日間再生増加数セルレンダラー
export const renderTenDaysViewsIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.ten_days_increase, 'ten_days_increase')}
    </div>
    )
};

// いいね数セルレンダラー
export const renderLikesCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.likes, 'likes')}
    </div>
    )
};

// いいね増加数セルレンダラー
export const renderLikesCountIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.likes_count_increase, 'likes_count_increase')}
    </div>
    )
};

// 10日間いいね増加数セルレンダラー
export const renderTenDaysLikesCountIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.ten_days_likes_increase, 'ten_days_likes_increase')}
    </div>
    )
};

// コメント数セルレンダラー
export const renderCommentsCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.comments, 'comments')}
    </div>
    )
};

// コメント増加数セルレンダラー
export const renderCommentCountIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.comment_count_increase, 'comment_count_increase')}
    </div>
    )
};

// 10日間コメント増加数セルレンダラー
export const renderTenDaysCommentCountIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.ten_days_comment_increase, 'ten_days_comment_increase')}
    </div>
    )
};

// 保存数セルレンダラー
export const renderSaveCountCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.save_count, 'saves')}
    </div>
    )
};

// 保存増加数セルレンダラー
export const renderSaveCountIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.save_count_increase, 'save_count_increase')}
    </div>
    )
};

// 10日間保存増加数セルレンダラー
export const renderTenDaysSaveIncreaseCell = (row: VideoData) => {
    return (
        <div className="text-right">
        {formatNumber(row.ten_days_save_increase, 'ten_days_save_increase')}
    </div>
    )
};

// アカウント名セルレンダラー
export const renderAccountNameCell = (row: VideoData) => {
  return (
    <div className="w-[120px] min-w-[120px] relative h-full flex items-center justify-start">
      <span className="font-bold text-base leading-tight">
        {row.account_name || '不明'}
      </span>
      {row.display_name && (
        <span className="absolute top-full left-0 text-[10px] text-gray-500 leading-tight max-w-[110px] break-words pt-0.5">
          {row.display_name}
        </span>
      )}
    </div>
  )
};

// ハッシュタグセルレンダラー
export const renderHashtagsCell = (row: VideoData) => {
  // コンテキストから関数を取得
  const { setSelectedText } = useContext(TableContext);
  
  const caption = row.description || '';
          
  // キャプションからハッシュタグを抽出（#付きの形式で）
  const hashtagsFromCaption = caption.match(/#[^\s#]+/g) || [];
  
  // 重複を除去
  const uniqueTags = [...new Set(hashtagsFromCaption)].filter(Boolean);
  
  if (uniqueTags.length === 0) {
    return <span className="text-gray-400 text-xs">ハッシュタグなし</span>;
  }
  
  // ハッシュタグの表示（最大3つまで表示し、それ以上は省略）
  const displayTags = uniqueTags.slice(0, 3);
  const remainingCount = uniqueTags.length - displayTags.length;
  
  return (
    <div className="w-[120px] min-w-[120px]">
      <button 
        onClick={() => setSelectedText && setSelectedText({ 
          title: 'ハッシュタグ', 
          content: uniqueTags.join(', ') || 'ハッシュタグなし'
        })}
        className="text-left w-full"
      >
        <div className="flex flex-wrap">
          {displayTags.map((tag: string, idx: number) => (
            <HashtagBadge key={idx} tag={tag.substring(1)} />
          ))}
          {remainingCount > 0 && (
            <span className="text-xs text-gray-500 mt-1">
              他{remainingCount}個...
            </span>
          )}
        </div>
      </button>
    </div>
  );
};

// BGMセルレンダラー
export const renderAudioTitleCell = (row: VideoData) => {
  // コンテキストから関数を取得
  const { setSelectedText } = useContext(TableContext);
  
  return (
    <div className="w-[120px] min-w-[120px]">
    <button 
      onClick={() => setSelectedText && setSelectedText({ 
        title: 'BGM情報', 
        content: `${row.audioTitle || 'BGMなし'}${row.artist ? `\nアーティスト: ${row.artist}` : ''}`
      })}
      className="text-left w-full"
    >
      <div className="flex items-center gap-1">
        <MusicNoteIcon size={14} />
        <span className="line-clamp-2 text-xs text-gray-600">
          {row.audioTitle || 'BGMなし'}
        </span>
      </div>
    </button>
  </div>
 )
};

// フォロワー系のセルレンダラー（フォロワー数を補足情報として表示）
export const renderViewsPerFollowerCell = (row: VideoData) => (
  <div className="text-right font-mono relative h-full flex items-center justify-end"> {/* 相対位置でメイン数値を中央に */}
    <div className={`font-semibold text-base ${row.play_count_per_follower !== null && row.play_count_per_follower >= 1 ? 'text-green-600' : 'text-gray-700'}`}>
      {row.play_count_per_follower !== null ? row.play_count_per_follower.toFixed(2) : '-'}
    </div>
    {row.followers !== null && (
      <div className="absolute -bottom-3 right-0 text-[10px] text-gray-500"> {/* bottom-1 → bottom-0 でさらに下に */}
        follower: {formatFollowerCount(row.followers)}
      </div>
    )}
  </div>
);

export const renderViewsIncreasePerFollowerCell = (row: VideoData) => (
  <div className="text-right font-mono relative h-full flex items-center justify-end"> {/* 相対位置でメイン数値を中央に */}
    <div className={`font-semibold text-base ${row.play_increase_per_follower !== null && row.play_increase_per_follower >= 1 ? 'text-green-600' : 'text-gray-700'}`}>
      {row.play_increase_per_follower !== null ? row.play_increase_per_follower.toFixed(2) : '-'}
    </div>
    {row.followers !== null && (
      <div className="absolute -bottom-3 right-0 text-[10px] text-gray-500"> {/* bottom-1 → bottom-0 でさらに下に */}
        follower: {formatFollowerCount(row.followers)}
      </div>
    )}
  </div>
);






