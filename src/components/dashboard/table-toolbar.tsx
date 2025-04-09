'use client';

import { useState } from 'react';
import { Filter, Settings } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

interface TableToolbarProps {
  totalItems: number;
  lastUpdated: Date | string;
  isPrOnly: boolean;
  onPrOnlyChange: (checked: boolean) => void;
  onClearFilters: () => void;
  activeColumns: string[];
  onColumnChange: (column: string, isVisible: boolean) => void;
  availableColumns: { key: string; title: string }[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function TableToolbar({
  totalItems,
  lastUpdated,
  isPrOnly,
  onPrOnlyChange,
  onClearFilters,
  activeColumns,
  onColumnChange,
  availableColumns,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange
}: TableToolbarProps) {
  const [pageInputValue, setPageInputValue] = useState(currentPage.toString());

  // 日付フォーマット
  const formattedDate = typeof lastUpdated === 'string' 
    ? lastUpdated 
    : formatDate(lastUpdated);

  // ページ変更時の処理
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputBlur = () => {
    const newPage = parseInt(pageInputValue, 10);
    if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
      onPageChange(newPage);
    } else {
      setPageInputValue(currentPage.toString());
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePageInputBlur();
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {/* 上部ヘッダー: タイトル、動画数、最終更新日 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <h2 className="text-xl font-bold">最新動画一覧</h2>
          <span className="text-sm text-gray-500">全 {totalItems} 件</span>
          <span className="text-sm text-gray-500">最終更新: {formattedDate}</span>
        </div>
      </div>

      {/* 下部ヘッダー: フィルター、表示設定、ページネーション */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onClearFilters()}
            className="gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
          >
            <Filter size={16} />
            <span>フィルター</span>
          </Button>

          <div className="flex items-center gap-2 ml-4">
            <input
              type="checkbox"
              id="pr-only"
              checked={isPrOnly}
              onChange={(e) => onPrOnlyChange(e.target.checked)}
              className="rounded text-red-500 focus:ring-red-500"
            />
            <label htmlFor="pr-only" className="text-sm cursor-pointer">
              #PR含む動画のみ表示
            </label>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* ページネーション */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">/</span>
            <span className="text-sm text-gray-600">{totalPages} ページ</span>
            <Input
              value={pageInputValue}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              className="w-16 h-8 text-center"
              min={1}
              max={totalPages}
            />
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded border hover:bg-gray-50 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* 表示件数選択 */}
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 pl-2 pr-8 text-sm border rounded"
          >
            <option value={10}>10件</option>
            <option value={20}>20件</option>
            <option value={50}>50件</option>
          </select>

          {/* 表示設定 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Settings size={16} />
                <span>表示設定</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {availableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={activeColumns.includes(column.key)}
                  onCheckedChange={(checked) => onColumnChange(column.key, !!checked)}
                >
                  {column.title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
} 