import { useState, useCallback } from 'react';

export interface SortState {
  primarySort: { field: string; direction: 'asc' | 'desc' } | null;
  secondarySort: { field: string; direction: 'asc' | 'desc' } | null;
  sortField: string | null;
  sortDirection: 'asc' | 'desc' | null;
  lastClickedSort: string | null;
}

export function useSortLogic() {
  const [primarySort, setPrimarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null);
  const [secondarySort, setSecondarySort] = useState<{field: string; direction: 'asc' | 'desc'} | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [lastClickedSort, setLastClickedSort] = useState<string | null>(null);

  // ソート処理のハンドラー
  const handleSort = useCallback((field: string, direction: 'asc' | 'desc', isPrimary: boolean) => {
    if (isPrimary) {
      setPrimarySort({
        field,
        direction
      });
      
      // 後方互換性のための状態更新
      setSortField(field);
      setSortDirection(direction);
    } else {
      setSecondarySort({
        field,
        direction
      });
    }
    
    setLastClickedSort(field);
  }, []);
  
  // ソートをクリアする関数
  const handleClearSort = useCallback(() => {
    setPrimarySort(null);
    setSecondarySort(null);
    setSortField(null);
    setSortDirection(null);
    setLastClickedSort(null);
  }, []);
  
  return {
    primarySort,
    secondarySort,
    sortField,
    sortDirection,
    lastClickedSort,
    setPrimarySort,
    setSecondarySort,
    setSortField,
    setSortDirection,
    setLastClickedSort,
    handleSort,
    handleClearSort
  };
} 