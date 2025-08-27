// src/components/dashboard/data-table/formatters.tsx
import { ReactElement } from 'react';
import { NumberFormatType } from '@/types/dashboard';
import { HeartIcon, CommentIcon, UpArrowIcon, SaveIcon } from './icons';
import { TIKTOK_COLORS } from '@/lib/constants';

// 数値フォーマット関数を修正 - num と type を受け取るように変更
export const formatNumber = (num: number, type?: NumberFormatType): ReactElement => {
    const formattedNum = new Intl.NumberFormat('ja-JP').format(num);
    
    // いいね関連の増加数の場合
    if (type && (
      type === 'likes_count_increase' ||
      type === 'ten_days_likes_increase'
    )) {
      // 値が0の場合は通常表示
      if (num === 0) {
        return (
          <div className="font-medium text-gray-700 flex items-center justify-end">
            <HeartIcon size={14} />
            <span className="tabular-nums ml-1">
              {formattedNum}
            </span>
          </div>
        );
      }
      return (
        <div className="font-medium text-green-600 flex items-center justify-end">
          <HeartIcon size={14} />
          <UpArrowIcon size={14} className="ml-1" />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
  
    // コメント関連の増加数の場合
    if (type && (
      type === 'comment_count_increase' ||
      type === 'ten_days_comment_increase'
    )) {
      // 値が0の場合は通常表示
      if (num === 0) {
        return (
          <div className="font-medium text-gray-700 flex items-center justify-end">
            <CommentIcon size={14} />
            <span className="tabular-nums ml-1">
              {formattedNum}
            </span>
          </div>
        );
      }
      return (
        <div className="font-medium text-green-600 flex items-center justify-end">
          <CommentIcon size={14} />
          <UpArrowIcon size={14} className="ml-1" />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
    
    // 保存関連の増加数の場合
    if (type && (
      type === 'save_count_increase' ||
      type === 'ten_days_save_increase'
    )) {
      // 値が0の場合は通常表示
      if (num === 0) {
        return (
          <div className="font-medium text-gray-700 flex items-center justify-end">
            <SaveIcon size={14} />
            <span className="tabular-nums ml-1">
              {formattedNum}
            </span>
          </div>
        );
      }
      return (
        <div className="font-medium text-green-600 flex items-center justify-end">
          <SaveIcon size={14} />
          <UpArrowIcon size={14} className="ml-1" />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
    
    // 再生数増加の場合
    if (type && (
      type === 'viewsIncrease' ||
      type === 'ten_days_increase'
    )) {
      // 値が0の場合は通常表示
      if (num === 0) {
        return (
          <div className="font-medium text-gray-700 flex items-center justify-end">
            <span className="tabular-nums">
              {formattedNum}
            </span>
          </div>
        );
      }
      return (
        <div className="font-medium text-green-600 flex items-center justify-end">
          <UpArrowIcon size={14} />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
    
    // いいね数の場合
    if (type === 'likes') {
      return (
        <div className="font-medium text-gray-700 flex items-center justify-end">
          <HeartIcon size={14} />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
    
    // コメント数の場合
    if (type === 'comments') {
      return (
        <div className="font-medium text-gray-700 flex items-center justify-end">
          <CommentIcon size={14} />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }

    // 保存数の場合
    if (type === 'saves') {
      return (
        <div className="font-medium text-gray-700 flex items-center justify-end">
          <SaveIcon size={14} />
          <span className="tabular-nums ml-1">
            {formattedNum}
          </span>
        </div>
      );
    }
    
    // 通常の数値表示
    return (
      <div className="font-medium text-gray-700 flex items-center justify-end">
        <span className="tabular-nums">
          {formattedNum}
        </span>
      </div>
    );
  };

// フォロワー数専用のフォーマット関数を追加
export const formatFollowerCount = (num: number): string => {
  if (num >= 1000000) {
    // 100万以上はM表示
    const millions = num / 1000000;
    return `${millions.toFixed(1)}M`;
  } else if (num >= 1000) {
    // 1000以上はK表示
    const thousands = num / 1000;
    return `${thousands.toFixed(1)}K`;
  } else {
    // 1000未満はそのまま表示
    return num.toString();
  }
};