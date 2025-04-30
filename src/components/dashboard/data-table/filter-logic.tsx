import { useState, useCallback } from 'react';
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
}

export interface FilterHandlers {
  handleFilter: (field: string) => (filterValue: FilterValue, shouldMerge?: boolean) => void;
  handleBulkFilterChange: (filters: Record<string, FilterValue>) => void;
  handleClearAllFilters: () => void;
  handleClearFilterInputs: () => void;
  setIsFilterPopupOpen: (isOpen: boolean) => void;
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
  }
): [FilterState, FilterHandlers] {
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, FilterValue>>({});
  const [currentFilters, setCurrentFilters] = useState<Record<string, FilterQuery>>({});
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // フィルターをクリアする関数 - データテーブルとAPIの両方を更新
  const handleClearAllFilters = useCallback(() => {
    console.log('DataTable - handleClearAllFilters called');
    console.log('DataTable - columnFilters before clear:', columnFilters);
    
    // 状態をリセット
    setHasActiveFilters(false);
    setColumnFilters({});
    setCurrentFilters({});
    sortState.setPrimarySort(null);
    sortState.setSecondarySort(null);
    sortState.setSortField(null);
    sortState.setSortDirection(null);
    
    console.log('DataTable - columnFilters after clear: {}');
    
    // 親コンポーネントに通知 - 明示的なフィルターリセット信号を送る
    onFilterChange(false, { field: 'reset', type: 'clear', value: '', active: false });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);

    // 強制的に再レンダリングを発生させる
    // setForceUpdate(prev => prev + 1);
  }, [onFilterChange, columnFilters, sortState]);
  
  // ポップアップ内のフィルター入力のみをクリアする関数 - ポップアップの入力のみクリア（APIリクエストなし）
  const handleClearFilterInputs = useCallback(() => {
    console.log('FilterPopup内の入力のみをクリア');
    // 明示的にFilterPopupを直接クリアするのではなく、ポップアップ内部のClearAllボタンに任せる
    // 実際のデータのクリアはhandleBulkFilterChangeで処理される
  }, []);
  
  // handleFilterを拡張してソート処理を明示的に扱う
  const handleFilter = useCallback((field: string) => {
    return (filterValue: FilterValue, shouldMerge = false) => {
      console.log(`[DataTable] フィルター処理 - フィールド: ${field}`, filterValue);
      
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
        
        // 親コンポーネントに通知は不要
        // onFilterChange(true, filterValue); // ← この行をコメントアウトまたは削除
        // setForceUpdate(prev => prev + 1); // ★ 不要であればこの行も削除検討
        return;
      }
      
      if (filterValue.type === 'clear') {
        console.log(`[DataTable] 明示的なクリア処理 - フィールド: ${field}`, filterValue);
        
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
        
        // 強制的に再レンダリングを発生させる
        // setForceUpdate(prev => prev + 1);
        return;
      }
      
      // 新しいフィルターを適用する前に、active: trueを設定
      const updatedFilterValue = {
        ...filterValue,
        active: true
      };
      console.log(`[DataTable] フィルター値を更新 - フィールド: ${field}, active=true を設定`);
      
      // 新しいフィルターを適用
      const newFilters = shouldMerge 
        ? { ...columnFilters, [field]: updatedFilterValue } 
        : { [field]: updatedFilterValue };
      
      setColumnFilters(newFilters);
      console.log(`[DataTable] columnFiltersを更新 - フィールド: ${field}`, newFilters[field]);
      
      // 現在のフィルターに追加
      const updatedFilter = {
        ...currentFilters,
        [field]: {
          ...updatedFilterValue
        }
      };
      setCurrentFilters(updatedFilter);
      console.log(`[DataTable] currentFiltersを更新 - フィールド: ${field}`, updatedFilter[field]);
      
      // フィルターがアクティブになったことを通知
      setHasActiveFilters(true);
      
      // 親コンポーネントに通知（フィルター条件を含める）
      onFilterChange(true, {
        ...updatedFilterValue
      });
      
      // 強制的に再レンダリングを発生させる
      // setForceUpdate(prev => prev + 1);
      return;
    };
  }, [columnFilters, currentFilters, onFilterChange, sortState]);

  // handleBulkFilterChange関数 - 空のフィルター配列と既存フィルターとの比較を明示的に処理
  const handleBulkFilterChange = useCallback((filters: Record<string, FilterValue>) => {
    console.log('[SORT-DEBUG] DataTable - 一括フィルター変更受信:', 
      Object.entries(filters).map(([key, value]) => ({
        key, 
        type: value.type, 
        active: value.active,
        isSort: value.type === 'sort',
        isPrimarySort: value.isPrimarySort,
        field: value.field
      }))
    );
    
    // ソート関連のフィルターを特に詳しくログ
    Object.entries(filters).forEach(([key, value]) => {
      if (value.type === 'sort') {
        console.log('[SORT-DEBUG] DataTable - ソートフィルター詳細:', {
          key,
          field: value.field,
          sortField: value.sortField,
          direction: value.value,
          isPrimarySort: value.isPrimarySort,
          active: value.active
        });
      }
    });
    
    // 明示的なリセット信号をチェック
    if (filters.reset && filters.reset.type === 'clear') {
      console.log('[SORT-DEBUG] DataTable - 明示的なリセット信号を受信しました。すべてのフィルターをクリアします');
      
      // 状態をリセット
      setColumnFilters({});
      setCurrentFilters({});
      sortState.setPrimarySort(null);
      sortState.setSecondarySort(null);
      sortState.setSortField(null);
      sortState.setSortDirection(null);
      setHasActiveFilters(false);
      
      // 親コンポーネントに通知 - リセット信号を含める
      onFilterChange(false, { field: 'reset', type: 'clear', value: '' });
      
      // フィルターポップアップを閉じる
      setIsFilterPopupOpen(false);
      return;
    }
    
    // ソート処理のための変数
    let newPrimarySort: { field: string; direction: 'asc' | 'desc' } | null = null;
    let newSecondarySort: { field: string; direction: 'asc' | 'desc' } | null = null;
    let sortUpdated = false;
    
    // フィルター情報を処理
    const normalFilters: Record<string, FilterValue> = {};
    
    // ソート関連のフラグ - ソート関連のキーがあるかどうかを確認
    const hasSortKeys = Object.keys(filters).some(key => key.startsWith('sort_'));
    
    // 明示的なソートキーログ
    if (hasSortKeys) {
      const sortKeys = Object.keys(filters).filter(key => key.startsWith('sort_'));
      console.log('[SORT-DEBUG] DataTable - ソートキー検出:', {
        sortKeys,
        values: sortKeys.map(key => ({
          key,
          value: filters[key].value,
          field: filters[key].field || key.replace(/^sort_/, ''),
          type: filters[key].type
        }))
      });
    }
    
    // フィルターを処理し、ソート情報とフィルター情報を分離
    Object.entries(filters).forEach(([key, filter]) => {
      // ソート情報の処理
      if (filter.type === 'sort' || key.startsWith('sort_')) {
        sortUpdated = true;
        // キーからフィールド名を取得 - sort_prefix対応
        const fieldName = filter.field || filter.sortField || (key.startsWith('sort_') ? key.replace(/^sort_/, '') : key);
        
        // フィールド名のマッピングを行う
        const apiFieldName = mapFieldNameToApi(fieldName);
        
        console.log('[SORT-DEBUG] DataTable - ソート情報抽出:', {
          key,
          uiFieldName: fieldName,
          apiFieldName,
          isPrimarySort: filter.isPrimarySort,
          direction: filter.value,
          filterType: filter.type,
          hasSortPrefix: key.startsWith('sort_')
        });
        
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
          
          console.log('[SORT-DEBUG] DataTable - 第一ソート設定:', {
            field: fieldName,
            direction: direction,
            source: filter.isPrimarySort ? 'isPrimarySort' : 'first detected',
            timestamp: new Date().toISOString()
          });
        } else if (!newSecondarySort) {
          // 第二ソートの設定（まだ設定されていない場合のみ）
          newSecondarySort = {
            field: fieldName, // UI表示用にはオリジナルのフィールド名を保持
            direction: direction
          };
          
          console.log('[SORT-DEBUG] DataTable - 第二ソート設定:', {
            field: fieldName,
            direction: direction,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // 通常のフィルター情報 - active プロパティを明示的に保持
        normalFilters[key] = {
          ...filter,
          active: filter.active === undefined ? true : filter.active // activeが設定されていない場合はtrueをデフォルト値とする
        };
      }
    });
    
    // ソート情報を更新
    if (sortUpdated) {
      console.log('[SORT-DEBUG] DataTable - ソート状態更新:', {
        primarySort: newPrimarySort,
        secondarySort: newSecondarySort,
        timestamp: new Date().toISOString()
      });
      
      // 必ず正しいオブジェクトを渡す
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
      console.log('[SORT-DEBUG] DataTable - sort_プレフィックスキーがあるがソート情報が処理されませんでした。再処理を試みます。');
      
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
            
            console.log('[SORT-DEBUG] DataTable - プレフィックスから第一ソート検出:', {
              field: fieldName,
              direction,
              timestamp: new Date().toISOString()
            });
          } else if (!newSecondarySort) {
            // セカンダリソートとして処理
            newSecondarySort = {
              field: fieldName,
              direction
            };
            
            console.log('[SORT-DEBUG] DataTable - プレフィックスから第二ソート検出:', {
              field: fieldName,
              direction,
              timestamp: new Date().toISOString()
            });
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

    // フィルター情報を設定
    setColumnFilters({
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig
    });
    
    // 現在のフィルターも更新（ソート情報も含める）
    const newCurrentFilters = {
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig
    };
    
    setCurrentFilters(newCurrentFilters);
    
    // フィルターがアクティブになったことを通知
    const hasFilters = Object.keys(normalFilters).length > 0 || sortUpdated;
    setHasActiveFilters(hasFilters);
    
    // 親コンポーネントに通知
    onFilterChange(hasFilters, {
      type: 'multiple',
      field: 'multipleFilters',
      value: Object.values(normalFilters),
      filters: newCurrentFilters
    });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);
    
    console.log('[SORT-DEBUG] DataTable - フィルター処理完了:', {
      hasFilters,
      normalFiltersCount: Object.keys(normalFilters).length,
      columnFiltersWithSort: JSON.stringify({
        ...normalFilters,
        ...primarySortConfig
      })
    });
  }, [onFilterChange, sortState]);

  return [
    { hasActiveFilters, columnFilters, currentFilters },
    { 
      handleFilter, 
      handleBulkFilterChange, 
      handleClearAllFilters, 
      handleClearFilterInputs,
      setIsFilterPopupOpen
    }
  ];
} 