// src/components/dashboard/data-table/columns.tsx
import React, { useContext } from 'react';
import { Column } from '@/types/dashboard';
import { TableHeaderCell } from './table-header-cell';
import * as cellRenderers from './cell-renderers';
import { formatNumber } from './formatters';
import { useState } from 'react'
import { TableContext } from './cell-renderers';
import { ProductBadge } from '@/components/ui/badge';

// デバッグフラグ
const DEBUG = false;


export const createColumns = (
  columnFilters: Record<string, any>,
  primarySort: {field: string; direction: 'asc' | 'desc'} | null,
  secondarySort: {field: string; direction: 'asc' | 'desc'} | null,
  handleFilter: (field: string) => (filterValue: any, shouldMerge?: boolean) => void,
  getFilteredOptions: (columnName: string) => string[],
  isLoadingFilterOptions?: boolean,
  sortField?: string | null,
  sortDirection?: 'asc' | 'desc' | null,
  productCellRenderer?: (row: any) => React.ReactElement
): Column[] => {
      
  return [
    // サムネイルカラム
    {
      accessorKey: 'thumbnail_url',
      header: ({ column }) => (
        <TableHeaderCell title="サムネイル" />
      ),
      cell: ({ row }) => cellRenderers.renderThumbnailCell(row)
    },

      // アカウントタイプカラム
      {
        accessorKey: 'account_type',
        header: ({ column }) => (
          <TableHeaderCell
            title="アカウントジャンル"
            type="text"
            onFilter={(value) => handleFilter('account_type')(value)}
            isActive={Boolean(columnFilters['account_type']?.active)}
            categoryData={getFilteredOptions('アカウントジャンル')}
            sortDirection={
              primarySort?.field === 'account_type' 
                ? primarySort.direction 
                : secondarySort?.field === 'account_type' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'account_type' ? 1 : secondarySort?.field === 'account_type' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderAccountTypeCell(row)  
      },
      {
        accessorKey: 'second_account_type',
        header: ({ column }) => (
          <TableHeaderCell
            title="目的"
            type="text"
            onFilter={(value) => handleFilter('second_account_type')(value)}
            isActive={Boolean(columnFilters['second_account_type']?.active)}
            categoryData={getFilteredOptions('目的')}
            sortDirection={
              primarySort?.field === 'second_account_type' 
                ? primarySort.direction 
                : secondarySort?.field === 'second_account_type' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'second_account_type' ? 1 : secondarySort?.field === 'second_account_type' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderSecondAccountTypeCell(row)
      },
      {
        accessorKey: 'third_account_type',
        header: ({ column }) => (
          <TableHeaderCell
            title="中ジャンル"
            type="text"
            onFilter={(value) => handleFilter('third_account_type')(value)}
            isActive={Boolean(columnFilters['third_account_type']?.active)}
            categoryData={getFilteredOptions('中ジャンル')}
            sortDirection={
              primarySort?.field === 'third_account_type' 
                ? primarySort.direction 
                : secondarySort?.field === 'third_account_type' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'third_account_type' ? 1 : secondarySort?.field === 'third_account_type' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderThirdAccountTypeCell(row)
      },

    // 動画ジャンルカラム
    {
      accessorKey: 'category',
      header: ({ column }) => {
        
        const options = getFilteredOptions('PR動画ジャンル');
        return (
          <TableHeaderCell
            title="PR動画ジャンル"
            type="text"
            align="left"
            onFilter={(value) => handleFilter('category')(value)}
            isActive={Boolean(columnFilters['category']?.active)}
            categoryData={options}
            sortDirection={
              primarySort?.field === 'category' 
                ? primarySort.direction 
                : secondarySort?.field === 'category' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'category' ? 1 : secondarySort?.field === 'category' ? 2 : null}
          />
        );
      },
      cell: ({ row }) => cellRenderers.renderCategoryCell(row)
    },

    // 商品名カラム
    {
      accessorKey: 'product',
      header: ({ column }) => (
        <TableHeaderCell
          title="商品名"
          type="text"
          onFilter={(value) => handleFilter('product')(value)}
          isActive={Boolean(columnFilters['product']?.active)}
          categoryData={getFilteredOptions('商品名')}
          sortDirection={
            primarySort?.field === 'product' 
              ? primarySort.direction 
              : secondarySort?.field === 'product' 
                ? secondarySort.direction 
                : null
          }
          sortPriority={primarySort?.field === 'product' ? 1 : secondarySort?.field === 'product' ? 2 : null}
        />
      ),
      cell: ({ row }) => productCellRenderer ? productCellRenderer(row) : null
    },

      // 投稿日カラム
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <TableHeaderCell
            title="投稿日"
            type="date"
            align="right"
            onFilter={(value) => handleFilter('createdAt')(value)}
            isActive={Boolean(columnFilters['createdAt']?.active)}
            sortDirection={
              primarySort?.field === 'createdAt' 
                ? primarySort.direction 
                : secondarySort?.field === 'createdAt' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'createdAt' ? 1 : secondarySort?.field === 'createdAt' ? 2 : null}
            isLoadingFilterOptions={isLoadingFilterOptions}
          />
        ),
        cell: ({ row }) => cellRenderers.renderDateCell(row)
      },

    // 再生数カラム
    {
        accessorKey: 'views',
        header: ({ column }) => {        
        // ソート状態のデバッグログを追加
        if (DEBUG) {
        }
        
        // ソート状態の判定を明示的に行う
        const isActiveSort = 
          primarySort?.field === 'views' || 
          primarySort?.field === 'play_count' ||
          secondarySort?.field === 'views' || 
          secondarySort?.field === 'play_count' ||
          columnFilters['sort_views']?.active ||
          sortField === 'views';
          
        // 使用するソート方向の決定
        let effectiveSortDirection: 'asc' | 'desc' | null = null;
        
        if (primarySort?.field === 'views' || primarySort?.field === 'play_count') {
          effectiveSortDirection = primarySort.direction;
        } else if (secondarySort?.field === 'views' || secondarySort?.field === 'play_count') {
          effectiveSortDirection = secondarySort.direction;
        } else if (columnFilters['sort_views']?.value) {
          effectiveSortDirection = columnFilters['sort_views'].value as 'asc' | 'desc';
        } else if (sortField === 'views' && sortDirection) {
          effectiveSortDirection = sortDirection;
        }
        
        
        // ソート優先度の決定
        const sortPriorityValue = primarySort?.field === 'views' || primarySort?.field === 'play_count' 
          ? 1 
          : secondarySort?.field === 'views' || secondarySort?.field === 'play_count' 
            ? 2 
            : null;
        
        return (
            <TableHeaderCell
            title="再生数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('views')(value)}
            isActive={Boolean(columnFilters['views']?.active) || isActiveSort}
            sortDirection={effectiveSortDirection}
            sortPriority={sortPriorityValue}
            />
        );
        },
        cell: ({ row }) => cellRenderers.renderViewsCell(row)
    },

    // 再生増加数カラム
    {
        accessorKey: 'viewsIncrease',
        header: ({ column }) => {
          // ソート状態のデバッグログを追加
          
          const effectiveSortDirection = 
            primarySort?.field === 'viewsIncrease' || primarySort?.field === 'play_count_increase'
              ? primarySort.direction 
              : secondarySort?.field === 'viewsIncrease' || secondarySort?.field === 'play_count_increase'
                ? secondarySort.direction 
                : null;
          
          
          return (
            <TableHeaderCell
              title="2日再生増加数"
              type="number"
              align="right"
              onFilter={(value) => handleFilter('viewsIncrease')(value)}
              isActive={Boolean(columnFilters['viewsIncrease']?.active)}
              sortDirection={effectiveSortDirection}
              sortPriority={
                primarySort?.field === 'viewsIncrease' || primarySort?.field === 'play_count_increase' 
                  ? 1 
                  : secondarySort?.field === 'viewsIncrease' || secondarySort?.field === 'play_count_increase' 
                    ? 2 
                    : null
              }
            />
          );
        },
        cell: ({ row }) => cellRenderers.renderViewsIncreaseCell(row)
    },

    // 10日間再生増加数カラム
    {
        accessorKey: 'ten_days_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="10日再生増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('ten_days_increase')(value)}
            isActive={Boolean(columnFilters['ten_days_increase']?.active)}
            sortDirection={
              primarySort?.field === 'ten_days_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'ten_days_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'ten_days_increase' ? 1 : secondarySort?.field === 'ten_days_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderTenDaysViewsIncreaseCell(row)
      },

      // いいね数カラム
      {
        accessorKey: 'likes',
        header: ({ column }) => (
          <TableHeaderCell
            title="いいね数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('likes')(value)}
            isActive={Boolean(columnFilters['likes']?.active)}
            sortDirection={
              primarySort?.field === 'likes' 
                ? primarySort.direction 
                : secondarySort?.field === 'likes' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'likes' ? 1 : secondarySort?.field === 'likes' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderLikesCell(row)
      },

      // いいね増加数カラム
      {
        accessorKey: 'likes_count_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="2日いいね増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('likes_count_increase')(value)}
            isActive={Boolean(columnFilters['likes_count_increase']?.active)}
            sortDirection={
              primarySort?.field === 'likes_count_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'likes_count_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'likes_count_increase' ? 1 : secondarySort?.field === 'likes_count_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderLikesCountIncreaseCell(row)
      },

      // 10日間いいね増加数カラム
      {
        accessorKey: 'ten_days_likes_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="10日いいね増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('ten_days_likes_increase')(value)}
            isActive={Boolean(columnFilters['ten_days_likes_increase']?.active)}
            sortDirection={
              primarySort?.field === 'ten_days_likes_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'ten_days_likes_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'ten_days_likes_increase' ? 1 : secondarySort?.field === 'ten_days_likes_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderTenDaysLikesCountIncreaseCell(row)
      },

      // コメント数カラム
      {
        accessorKey: 'comments',
        header: ({ column }) => (
          <TableHeaderCell
            title="コメント数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('comments')(value)}
            isActive={Boolean(columnFilters['comments']?.active)}
            sortDirection={
              primarySort?.field === 'comments' 
                ? primarySort.direction 
                : secondarySort?.field === 'comments' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'comments' ? 1 : secondarySort?.field === 'comments' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderCommentsCell(row)
      },

      // コメント増加数カラム
      {
        accessorKey: 'comment_count_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="2日コメント増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('comment_count_increase')(value)}
            isActive={Boolean(columnFilters['comment_count_increase']?.active)}
            sortDirection={
              primarySort?.field === 'comment_count_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'comment_count_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'comment_count_increase' ? 1 : secondarySort?.field === 'comment_count_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderCommentCountIncreaseCell(row)
      },

      // 10日間コメント増加数カラム
      {
        accessorKey: 'ten_days_comment_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="10日コメント増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('ten_days_comment_increase')(value)}
            isActive={Boolean(columnFilters['ten_days_comment_increase']?.active)}
            sortDirection={
              primarySort?.field === 'ten_days_comment_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'ten_days_comment_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'ten_days_comment_increase' ? 1 : secondarySort?.field === 'ten_days_comment_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderTenDaysCommentCountIncreaseCell(row)
      },

      // 再生/フォロワーカラム
      {
        accessorKey: 'play_count_per_follower',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生/フォロワー"
            type="number"
            onFilter={(value) => handleFilter('play_count_per_follower')(value)}
            isActive={Boolean(columnFilters['play_count_per_follower']?.active)}
            sortDirection={
              primarySort?.field === 'play_count_per_follower' 
                ? primarySort.direction 
                : secondarySort?.field === 'play_count_per_follower' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'play_count_per_follower' ? 1 : secondarySort?.field === 'play_count_per_follower' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderViewsPerFollowerCell(row)
      },

      // 再生増/フォロワーカラム
      {
        accessorKey: 'play_increase_per_follower',
        header: ({ column }) => (
          <TableHeaderCell
            title="再生増/フォロワー"
            type="number"
            onFilter={(value) => handleFilter('play_increase_per_follower')(value)}
            isActive={Boolean(columnFilters['play_increase_per_follower']?.active)}
            sortDirection={
              primarySort?.field === 'play_increase_per_follower' 
                ? primarySort.direction 
                : secondarySort?.field === 'play_increase_per_follower' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'play_increase_per_follower' ? 1 : secondarySort?.field === 'play_increase_per_follower' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderViewsIncreasePerFollowerCell(row)
      },

      // 保存数カラム
      {
        accessorKey: 'save_count',
        header: ({ column }) => (
          <TableHeaderCell
            title="保存数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('save_count')(value)}
            isActive={Boolean(columnFilters['save_count']?.active)}
            sortDirection={
              primarySort?.field === 'save_count' 
                ? primarySort.direction 
                : secondarySort?.field === 'save_count' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'save_count' ? 1 : secondarySort?.field === 'save_count' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderSaveCountCell(row)
      },

      // 保存増加数カラム
      {
        accessorKey: 'save_count_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="2日保存増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('save_count_increase')(value)}
            isActive={Boolean(columnFilters['save_count_increase']?.active)}
            sortDirection={
              primarySort?.field === 'save_count_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'save_count_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'save_count_increase' ? 1 : secondarySort?.field === 'save_count_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderSaveCountIncreaseCell(row)
      },

      // 10日間保存増加数カラム
      {
        accessorKey: 'ten_days_save_increase',
        header: ({ column }) => (
          <TableHeaderCell
            title="10日保存増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('ten_days_save_increase')(value)}
            isActive={Boolean(columnFilters['ten_days_save_increase']?.active)}
            sortDirection={
              primarySort?.field === 'ten_days_save_increase' 
                ? primarySort.direction 
                : secondarySort?.field === 'ten_days_save_increase' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'ten_days_save_increase' ? 1 : secondarySort?.field === 'ten_days_save_increase' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderTenDaysSaveIncreaseCell(row)
      },

      // アカウント名カラム
      {
        accessorKey: 'account_name',
        header: ({ column }) => (
          <TableHeaderCell
            title="アカウント名"
            type="text"
            onFilter={(value) => handleFilter('account_name')(value)}
            isActive={Boolean(columnFilters['account_name']?.active)}
            sortDirection={
              primarySort?.field === 'account_name' 
                ? primarySort.direction 
                : secondarySort?.field === 'account_name' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'account_name' ? 1 : secondarySort?.field === 'account_name' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderAccountNameCell(row)
      },

      // ハッシュタグカラム
      {
        accessorKey: 'hashtags',
        header: ({ column }) => (
          <TableHeaderCell
            title="ハッシュタグ"
            type="text"
            onFilter={(value) => handleFilter('hashtags')(value)}
            isActive={Boolean(columnFilters['hashtags']?.active)}
            categoryData={getFilteredOptions('ハッシュタグ')}
            sortDirection={sortField === 'hashtags' ? sortDirection : null}
            sortPriority={primarySort?.field === 'hashtags' ? 1 : secondarySort?.field === 'hashtags' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderHashtagsCell(row)
      },

      // BGMカラム
      {
        accessorKey: 'audioTitle',
        header: ({ column }) => (
          <TableHeaderCell
            title="BGM"
            type="text"
            onFilter={(value) => handleFilter('audioTitle')(value)}
            isActive={Boolean(columnFilters['audioTitle']?.active)}
            categoryData={getFilteredOptions('BGM')}
            sortDirection={
              primarySort?.field === 'audioTitle' 
                ? primarySort.direction 
                : secondarySort?.field === 'audioTitle' 
                  ? secondarySort.direction 
                  : null
            }
            sortPriority={primarySort?.field === 'audioTitle' ? 1 : secondarySort?.field === 'audioTitle' ? 2 : null}
          />
        ),
        cell: ({ row }) => cellRenderers.renderAudioTitleCell(row)
      },


  ];
};

// 以下の定数は../data-table.tsxに移動しました
/*
export const DEFAULT_VISIBLE_COLUMNS = [
  'thumbnail_url',    // サムネイル
  'account_type',     // アカウントタイプ
  'category',         // 動画ジャンル
  'product',         // 商品名
  'createdAt',       // 投稿日
  'views',           // 再生数
  'viewsIncrease',   // 再生増加数
  'ten_days_increase', // 10日間再生増加数
  'likes',           // いいね数
  'comments',        // コメント数
  'account_name',    // アカウント名
  'hashtags',        // ハッシュタグ
  'audioTitle',      // BGM
];

// 表示設定から除外するカラムのリスト
export const EXCLUDED_COLUMNS = ['description']; // キャプションは表示設定から除外
*/