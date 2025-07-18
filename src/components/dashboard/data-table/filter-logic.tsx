import { useState, useCallback, useEffect } from 'react';
import { FilterValue, FilterQuery } from '@/types/dashboard';


// APIとUIのフィールド名の対応をマッピングする関数
function mapFieldNameToApi(uiFieldName: string): string {
  // UI表示用の名前からAPIで使用するフィールド名への変換
  const fieldMapping: Record<string, string> = {
    'views': 'play_count',
    'viewsIncrease': 'play_count_increase',
    'likes': 'like_count',
    'comments': 'comment_count',
    'likes_count_increase': 'like_count_increase',
    'ten_days_likes_increase': 'ten_days_like_increase',
    'comment_count_increase': 'comment_count_increase',
    'ten_days_comment_increase': 'ten_days_comment_increase'
    // 他のフィールドのマッピングをここに追加
  };
  
  return fieldMapping[uiFieldName] || uiFieldName;
}

// APIのフィールド名からUI表示用の名前に変換する逆マッピング関数
function mapApiFieldNameToUi(apiFieldName: string): string {
  // APIフィールド名からUI表示用の名前への変換
  const reverseFieldMapping: Record<string, string> = {
    'play_count': 'views',
    'play_count_increase': 'viewsIncrease',
    'like_count': 'likes',
    'comment_count': 'comments',
    'like_count_increase': 'likes_count_increase',
    'ten_days_like_increase': 'ten_days_likes_increase'
    // 他のフィールドの逆マッピングをここに追加
  };
  
  return reverseFieldMapping[apiFieldName] || apiFieldName;
}

// 型ガード関数をコンポーネント外に配置
function isSortConfig(obj: any): obj is { field: string; direction: 'asc' | 'desc' } {
  return obj !== null && typeof obj === 'object' && 'field' in obj && 'direction' in obj;
}

export interface FilterState {
  hasActiveFilters: boolean;
  columnFilters: Record<string, FilterValue>;
  currentFilters: Record<string, FilterQuery>;
  isPrOnly: boolean;
  isCorporateOnly: boolean;
}

export interface FilterHandlers {
  handleFilter: (field: string) => (filterValue: FilterValue, shouldMerge?: boolean) => void;
  handleBulkFilterChange: (filters: Record<string, FilterValue>) => void;
  handleClearAllFilters: () => void;
  handleClearFilterInputs: () => void;
  setIsFilterPopupOpen: (isOpen: boolean) => void;
  setColumnFilters: (filters: Record<string, FilterValue> | ((prev: Record<string, FilterValue>) => Record<string, FilterValue>)) => void;
  isPrOnly: boolean;
  handlePrOnlyChange: (newPrOnly: boolean) => void;
  isCorporateOnly: boolean;
  handleCorporateOnlyChange: (newCorporateOnly: boolean) => void;
}

export function useFilterLogic(
  onFilterChange: (hasFilters: boolean, filter?: FilterQuery) => void,
  sortState: {
    primarySort: { field: string; direction: 'asc' | 'desc' } | null;
    secondarySort: { field: string; direction: 'asc' | 'desc' } | null;
    setSortField: (field: string | null) => void;
    setSortDirection: (direction: 'asc' | 'desc' | null) => void;
    setPrimarySort: (sort: { field: string; direction: 'asc' | 'desc' } | null) => void;
    setSecondarySort: (sort: { field: string; direction: 'asc' | 'desc' } | null) => void;
  },
  initialPrOnly = false,
  initialCorporateOnly = false,
  externalFilters: Record<string, FilterQuery> = {} // ← 外部フィルター状態を追加
): [FilterState, FilterHandlers] {
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, FilterValue>>({});
  const [currentFilters, setCurrentFilters] = useState<Record<string, FilterQuery>>({});
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [isPrOnly, setIsPrOnly] = useState(initialPrOnly);
  const [isCorporateOnly, setIsCorporateOnly] = useState(initialCorporateOnly);

  // ★ 外部フィルター状態との同期を追加
  useEffect(() => {
    // 外部フィルターが変更された場合、内部状態を同期
    const convertedFilters: Record<string, FilterValue> = {};
    
    Object.entries(externalFilters).forEach(([key, filterQuery]) => {
      convertedFilters[key] = {
        field: filterQuery.field,
        type: filterQuery.type,
        value: filterQuery.value,
        active: filterQuery.active,
        ...(filterQuery.comparison && { comparison: filterQuery.comparison }),
        ...(filterQuery.isPrimarySort !== undefined && { isPrimarySort: filterQuery.isPrimarySort }),
        ...(filterQuery.sortField && { sortField: filterQuery.sortField }),
        ...(filterQuery.isHashtag && { isHashtag: filterQuery.isHashtag }),
        ...(filterQuery.timestamp !== undefined && { timestamp: filterQuery.timestamp })
      };
    });
    
    setColumnFilters(convertedFilters);
    setCurrentFilters(externalFilters);
    setHasActiveFilters(Object.keys(externalFilters).length > 0);
  }, [externalFilters]);

  // 初期値が変更された場合の同期
  useEffect(() => {
    setIsPrOnly(initialPrOnly);
  }, [initialPrOnly]);

  useEffect(() => {
    setIsCorporateOnly(initialCorporateOnly);
  }, [initialCorporateOnly]);

  // フィルターをクリアする関数 - データテーブルとAPIの両方を更新
  const handleClearAllFilters = useCallback(() => {

    // 状態をリセット
    setHasActiveFilters(false);
    setColumnFilters({});
    setCurrentFilters({});
    setIsPrOnly(false);
    setIsCorporateOnly(false);
    sortState.setPrimarySort(null);
    sortState.setSecondarySort(null);
    sortState.setSortField(null);
    sortState.setSortDirection(null);
    // 親コンポーネントに通知 - 明示的なフィルターリセット信号を送る
    onFilterChange(false, { field: 'reset', type: 'clear', value: '', active: false });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);

  }, [onFilterChange, columnFilters, sortState]);
  
  // ポップアップ内のフィルター入力のみをクリアする関数 - ポップアップの入力のみクリア（APIリクエストなし）
  const handleClearFilterInputs = useCallback(() => {
  }, []);
  
  // handleFilterを拡張してソート処理を明示的に扱う
  const handleFilter = useCallback((field: string) => {
    return (filterValue: FilterValue, shouldMerge = false) => {
      
      if (filterValue.type === 'sort') {
        // ソート処理
        const isPrimarySort = filterValue.isPrimarySort === true;
        
        if (isPrimarySort) {
          // 第一ソートの設定
          sortState.setPrimarySort({
            field: field,
            direction: filterValue.value as 'asc' | 'desc'
          });
          
          // 後方互換性のために従来の状態も更新
          sortState.setSortField(field);
          sortState.setSortDirection(filterValue.value as 'asc' | 'desc');
        } else {
          // 第二ソートの設定
          sortState.setSecondarySort({
            field: field,
            direction: filterValue.value as 'asc' | 'desc'
          });
        }
        
        return;
      }
      
      if (filterValue.type === 'clear') {
        // ソートもクリアする
        if (sortState.primarySort?.field === field) {
          sortState.setSortField(null);
          sortState.setSortDirection(null);
        }
        
        // このフィールドのフィルターを削除
        const newFilters = { ...columnFilters };
        delete newFilters[field];
        setColumnFilters(newFilters);
        
        // 現在のフィルターからも削除
        const newCurrentFilters = { ...currentFilters };
        delete newCurrentFilters[field];
        setCurrentFilters(newCurrentFilters);
        
        // フィルターが全て空になったかをチェック
        const hasFilters = Object.keys(newFilters).length > 0;
        setHasActiveFilters(hasFilters);
        
        // 親コンポーネントに通知 - 明示的なクリアフラグを含む
        if (hasFilters) {
          // まだフィルターが残っている場合
          // 複数フィルターを配列として渡す
          onFilterChange(hasFilters, { 
            type: 'multiple',
            field: 'multipleFilters',
            value: Object.values(newCurrentFilters),
            filters: newCurrentFilters  // 全フィルターをオブジェクトとして渡す
          });
        } else {
          // 全てのフィルターが空になった場合、明示的にリセット信号を送る
          onFilterChange(false, { field: 'reset', type: 'clear', value: '', clear: true });
        }
        return;
      }
      
      // 新しいフィルターを適用する前に、active: trueを設定
      const updatedFilterValue = {
        ...filterValue,
        active: true
      };
      
      // 新しいフィルターを適用
      const newFilters = shouldMerge 
        ? { ...columnFilters, [field]: updatedFilterValue } 
        : { [field]: updatedFilterValue };
      
      setColumnFilters(newFilters);
      
      // 現在のフィルターに追加
      const updatedFilter = {
        ...currentFilters,
        [field]: {
          ...updatedFilterValue
        }
      };
      setCurrentFilters(updatedFilter);
      
      // フィルターがアクティブになったことを通知
      setHasActiveFilters(true);
      
      // 親コンポーネントに通知（フィルター条件を含める）
      onFilterChange(true, {
        ...updatedFilterValue
      });
      
      return;
    };
  }, [columnFilters, currentFilters, onFilterChange, sortState]);

  // handleBulkFilterChange関数 - 空のフィルター配列と既存フィルターとの比較を明示的に処理
  const handleBulkFilterChange = useCallback((filters: Record<string, FilterValue>) => {
    
    
    // 明示的なリセット信号をチェック
    if (filters.reset && filters.reset.type === 'clear') {
      
      // 状態をリセット
      setColumnFilters({});
      setCurrentFilters({});
      setIsPrOnly(false);
      setIsCorporateOnly(false);
      sortState.setPrimarySort(null);
      sortState.setSecondarySort(null);
      sortState.setSortField(null);
      sortState.setSortDirection(null);
      setHasActiveFilters(false);
      
      // 親コンポーネントに通知 - リセット信号を含める
      onFilterChange(false, { 
        field: 'reset', 
        type: 'clear', 
        value: '',
        isPrOnly: false,
        isCorporateOnly: false
      });
      
      // フィルターポップアップを閉じる
      setIsFilterPopupOpen(false);
      return;
    }
    
    // 以下の部分が重要 - フィルターポップアップから受け取ったフィルターセットを処理
    
    // ソート処理のための変数
    let newPrimarySort: { field: string; direction: 'asc' | 'desc' } | null = null;
    let newSecondarySort: { field: string; direction: 'asc' | 'desc' } | null = null;
    let sortUpdated = false;
    
    // フィルター情報を処理
    const normalFilters: Record<string, FilterValue> = {};
    
    // ソート関連のフラグ - ソート関連のキーがあるかどうかを確認
    const hasSortKeys = Object.keys(filters).some(key => key.startsWith('sort_'));
    
    // フィルターを処理し、ソート情報とフィルター情報を分離
    Object.entries(filters).forEach(([key, filter]) => {
      // ソート情報の処理
      if (filter.type === 'sort' || key.startsWith('sort_')) {
        sortUpdated = true;
        // キーからフィールド名を取得 - sort_prefix対応
        const fieldName = filter.field || filter.sortField || (key.startsWith('sort_') ? key.replace(/^sort_/, '') : key);
        
        // フィールド名のマッピングを行う
        const apiFieldName = mapFieldNameToApi(fieldName);
        
        // ソート方向を取得
        const direction = (filter.value as 'asc' | 'desc') || 'desc';
        
        if (filter.isPrimarySort || !newPrimarySort) {
          // 第一ソートの設定
          newPrimarySort = {
            field: fieldName, // UI表示用にはオリジナルのフィールド名を保持
            direction: direction
          };
          
          // 後方互換性のために従来の状態も更新
          sortState.setSortField(fieldName);
          sortState.setSortDirection(direction);
          
        } else if (!newSecondarySort) {
          // 第二ソートの設定（まだ設定されていない場合のみ）
          newSecondarySort = {
            field: fieldName, // UI表示用にはオリジナルのフィールド名を保持
            direction: direction
          };
          
        }
      } else {
        // 通常のフィルター情報 - active プロパティを明示的に保持
        normalFilters[key] = {
          ...filter,
          active: filter.active === undefined ? true : filter.active
        };
      }
    });
    
    // 必ず正しいオブジェクトを渡す
    if (sortUpdated) {
      if (newPrimarySort) {
        sortState.setPrimarySort(newPrimarySort);
      }
      
      if (newSecondarySort) {
        sortState.setSecondarySort(newSecondarySort);
      } else if (!newSecondarySort && sortState.secondarySort) {
        // セカンダリソートがなくなった場合、明示的にクリア
        sortState.setSecondarySort(null);
      }
    } else if (hasSortKeys && !sortUpdated) {
      // sort_プレフィックスのキーがあるのにソート情報が処理されなかった場合の追加対応
      
      // 明示的にsort_プレフィックスを持つキーを探してソート情報を処理
      Object.entries(filters).forEach(([key, filter]) => {
        if (key.startsWith('sort_')) {
          // キーから実際のフィールド名を抽出
          const fieldName = key.replace(/^sort_/, '');
          
          // ソート方向を取得
          const direction = filter.value as 'asc' | 'desc' || 'desc';
          
          // プライマリソートとして処理
          if (!newPrimarySort) {
            newPrimarySort = {
              field: fieldName,
              direction
            };
            
            sortState.setSortField(fieldName);
            sortState.setSortDirection(direction);
            
          } else if (!newSecondarySort) {
            // セカンダリソートとして処理
            newSecondarySort = {
              field: fieldName,
              direction
            };
            
          }
          
          sortUpdated = true;
        }
      });
      
      if (sortUpdated) {
        if (newPrimarySort) {
          sortState.setPrimarySort(newPrimarySort);
        }
        
        if (newSecondarySort) {
          sortState.setSecondarySort(newSecondarySort);
        }
      }
    }
    
    // newPrimarySort と newSecondarySort が有効な場合のみアクセス
    const primarySortConfig = isSortConfig(newPrimarySort) ? {
      [`sort_${(newPrimarySort as any).field}`]: {
        field: (newPrimarySort as any).field,
        type: 'sort' as const,
        value: (newPrimarySort as any).direction,
        isPrimarySort: true,
        sortField: (newPrimarySort as any).field,
        active: true
      }
    } : {};

    const secondarySortConfig = isSortConfig(newSecondarySort) ? {
      [`sort_${(newSecondarySort as any).field}`]: {
        field: (newSecondarySort as any).field,
        type: 'sort' as const,
        value: (newSecondarySort as any).direction,
        isPrimarySort: false,
        sortField: (newSecondarySort as any).field,
        active: true
      }
    } : {};

    // ここが重要な修正ポイント：
    // PRフィルターと運用代行用フィルターの処理を削除
    // const prFilterConfig: Record<string, FilterValue> = {}; // 削除
    
    // フィルター情報からPR状態を確認する処理を削除
    // const hasPrFilter = Object.values(normalFilters).some(...); // 削除

    // PRフィルターの追加処理を削除
    // if (hasPrFilter || isPrOnly) { ... } // 削除

    // フィルター情報を設定 - PRフィルターと運用代行用フィルターを削除
    const updatedColumnFilters: Record<string, FilterValue> = {
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig
      // ...prFilterConfig を削除
    };
    
    setColumnFilters(updatedColumnFilters);
    
    // 現在のフィルターも更新（ソート情報のみ含める）
    const newCurrentFilters: Record<string, FilterQuery> = {
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig
      // ...prFilterConfig を削除
    };
    
    setCurrentFilters(newCurrentFilters);
    
    // フィルターがアクティブになったことを通知
    const hasFilters = Object.keys(normalFilters).length > 0 || sortUpdated;
    setHasActiveFilters(hasFilters);
    
    // 親コンポーネントに通知 - 状態のみ渡す（フィルターは適用しない）
    onFilterChange(hasFilters, {
      type: 'multiple',
      field: 'multipleFilters',
      value: Object.values(normalFilters),
      filters: newCurrentFilters,
      isPrOnly: isPrOnly, // 状態のみ渡す（フィルターは適用しない）
      isCorporateOnly: isCorporateOnly // 状態のみ渡す（フィルターは適用しない）
    });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);
    
  }, [onFilterChange, sortState, isPrOnly, isCorporateOnly]);

  // フィルター適用時の処理を修正
  const applyFilters = useCallback((filters: Record<string, FilterValue>) => {
    // フィルターオブジェクトの構築
    const filterQuery: FilterQuery = {
      field: 'multiple',
      type: 'multiple',
      value: Object.values(filters),
      filters
      // isPrOnly を削除
    };
    
    // フィルターがあるかどうかの判定
    const hasFilters = Object.keys(filters).length > 0;
    
    // 親コンポーネントに通知
    onFilterChange(hasFilters, filterQuery);
  }, [onFilterChange, currentFilters]);
  
  // PR状態変更ハンドラーを修正
  const handlePrOnlyChange = useCallback((newPrOnly: boolean) => {
    setIsPrOnly(newPrOnly);
    setIsCorporateOnly(false); // 他のタブをオフにする
    
    // 親コンポーネントの状態も更新する必要がある
    // しかし、この関数は内部状態の管理のみを行うべき
    
    // フィルターポップアップを閉じて内部状態をリセット
    setIsFilterPopupOpen(false);
    
    // 親コンポーネントに通知 - フィルターは適用しない
    onFilterChange(false, {
      type: 'multiple',
      field: 'multipleFilters',
      value: [],
      filters: {},
      isPrOnly: newPrOnly,
      isCorporateOnly: false
    });
    
  }, [onFilterChange]);

  // 運用代行用状態変更ハンドラー
  const handleCorporateOnlyChange = useCallback((newCorporateOnly: boolean) => {
    setIsCorporateOnly(newCorporateOnly);
    setIsPrOnly(false); // 他のタブをオフにする
    
    // 運用代行用タブがクリックされた時の処理を削除
    // フィルターは適用せず、状態のみ管理する
    
    // フィルターポップアップを閉じて内部状態をリセット
    setIsFilterPopupOpen(false);
    
    // 親コンポーネントに通知 - フィルターは適用しない
    onFilterChange(false, {
      type: 'multiple',
      field: 'multipleFilters',
      value: [],
      filters: {},
      isPrOnly: false,
      isCorporateOnly: newCorporateOnly
    });
    
  }, [onFilterChange]);

  return [
    { hasActiveFilters, columnFilters, currentFilters, isPrOnly, isCorporateOnly },
    { 
      handleFilter, 
      handleBulkFilterChange, 
      handleClearAllFilters, 
      handleClearFilterInputs,
      setIsFilterPopupOpen,
      setColumnFilters,
      isPrOnly,
      handlePrOnlyChange,
      isCorporateOnly,
      handleCorporateOnlyChange
    }
  ];
} 