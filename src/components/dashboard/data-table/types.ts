// src/components/dashboard/data-table/types.ts
import { FilterValue, FilterQuery, Column } from '@/types/dashboard';

// データテーブル内部で使用する追加の型を定義
export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterState {
  hasActiveFilters: boolean;
  columnFilters: Record<string, FilterValue>;
  currentFilters: Record<string, FilterQuery>;
  primarySort: SortState | null;
  secondarySort: SortState | null;
}

// その他必要な型定義