// src/components/dashboard/data-table/columns.tsx
import { Column } from '@/types/dashboard';
import { TableHeaderCell } from './table-header-cell';
import * as cellRenderers from './cell-renderers';
import { formatNumber } from './formatters';
import { useState} from 'react'

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
  sortDirection?: 'asc' | 'desc' | null
): Column[] => {
    console.log('[DEBUG-SORT] カラム生成時のソート状態:', {
        primarySort,
        secondarySort,
        sortField,
        sortDirection
      });
      
  return [
    // サムネイルカラム
    {
      accessorKey: 'thumbnail_url',
      header: ({ column }) => (
        <TableHeaderCell title="サムネイル" />
      ),
      cell: ({ row }) => cellRenderers.renderThumbnailCell(row)
    },

    // 動画ジャンルカラム
    {
      accessorKey: 'category',
      header: ({ column }) => {
        console.log('[DEBUG-SORT] 動画ジャンルカラムのソート状態:', {
          primarySortField: primarySort?.field,
          primarySortDirection: primarySort?.direction,
          isSortActive: primarySort?.field === 'category' || secondarySort?.field === 'category',
          sortDirection: primarySort?.field === 'category' 
            ? primarySort.direction 
            : secondarySort?.field === 'category' 
              ? secondarySort.direction 
              : null
        });
        
        const options = getFilteredOptions('動画ジャンル');
        return (
          <TableHeaderCell
            title="動画ジャンル"
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
        cell: ({ row }) => cellRenderers.renderProductCell(row)
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
    // 再生数カラム
    {
        accessorKey: 'views',
        header: ({ column }) => {        
        // columnFiltersを直接確認（デバッグ用）
        if (DEBUG) {
          console.log('[Views] 現在のcolumnFilters:', columnFilters);
          console.log('[Views] views filterのactive値:', columnFilters['views']?.active);
          
          // すべてのフィルターのactiveプロパティをログ出力
          console.log('[Views] 全フィルターのactive状態:', 
              Object.entries(columnFilters).map(([key, filter]) => ({
              key,
              active: filter.active,
              hasActiveProperty: 'active' in filter
              }))
          );
        }
        
        const isActive = Boolean(columnFilters['views']?.active);
        if (DEBUG) {
          console.log('[Views] 最終的なisActive値:', isActive);
        }
        
        return (
            <TableHeaderCell
            title="再生数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('views')(value)}
            isActive={isActive}
            sortDirection={
                primarySort?.field === 'views' 
                ? primarySort.direction 
                : secondarySort?.field === 'views' 
                    ? secondarySort.direction 
                    : null
            }
            sortPriority={primarySort?.field === 'views' ? 1 : secondarySort?.field === 'views' ? 2 : null}
            />
        );
        },
        cell: ({ row }) => cellRenderers.renderViewsCell(row)
    },

    // 再生増加数カラム
    {
        accessorKey: 'viewsIncrease',
        header: ({ column }) => (
            <TableHeaderCell
            title="2日再生増加数"
            type="number"
            align="right"
            onFilter={(value) => handleFilter('viewsIncrease')(value)}
            isActive={Boolean(columnFilters['viewsIncrease']?.active)}
            sortDirection={
                primarySort?.field === 'viewsIncrease' 
                ? primarySort.direction 
                : secondarySort?.field === 'viewsIncrease' 
                    ? secondarySort.direction 
                    : null
            }
            sortPriority={primarySort?.field === 'viewsIncrease' ? 1 : secondarySort?.field === 'viewsIncrease' ? 2 : null}
            />
        ),
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