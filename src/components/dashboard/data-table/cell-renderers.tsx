// src/components/dashboard/data-table/cell-renderers.tsx
import { VideoData } from '@/types/dashboard';
import { VideoTypeIcon, PhotoTypeIcon, MusicNoteIcon } from './icons';
import { ImageHover } from '@/components/ui/image-hover';
import { GenreBadge, HashtagBadge, ProductBadge } from '@/components/ui/badge';
import { formatNumber } from './formatters';
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
                  <GenreBadge key={idx} genre={genre} />
                ))}
              </div>
            );
          }
          return <div className="flex justify-start items-center"><GenreBadge genre={category} /></div>;
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
                allGenreBadges.push(<GenreBadge key={`${idx}-${subIdx}`} genre={genre} />);
              });
            } else {
              allGenreBadges.push(<GenreBadge key={idx} genre={cat} />);
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
export const renderProductCell = (row: VideoData) => { 
  // ProductCategoriesコンテキストからマッピングを取得
  const { productCategories } = useContext(TableContext);
  
  // デバッグ用のログを追加
  console.log('Product Debug Info:', {
    productName: row.product,
    allProductCategories: productCategories,
    mappedCategory: productCategories?.[row.product] || 'マッピングなし',
    productType: typeof row.product,
  });
  
  return (
    <div className="w-[120px] min-w-[120px]">
      <div className="flex flex-wrap gap-1 justify-start items-center">
        {row.product && (
          <ProductBadge 
            product={row.product} 
            // 製品カテゴリマッピングから製品のカテゴリを取得
            productCategory={productCategories?.[row.product] || 'その他'}
          />
        )}
      </div>
    </div>
  );           
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
    <div className="w-[120px] min-w-[120px]">
    <div className="flex flex-col">
      <span className="font-bold truncate text-base">
        {row.account_name || '不明'}
      </span>
      {row.display_name && (
        <span className="text-xs text-gray-500 truncate">
          {row.display_name}
        </span>
      )}
    </div>
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







