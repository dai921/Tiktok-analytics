import { useState, useCallback } from 'react';
import { FilterValue, FilterQuery } from '@/types/dashboard';

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
    console.log('[DataTable] 一括フィルター変更 - 受け取ったフィルター:', filters);
    console.log('[DataTable] 一括フィルター変更 - フィルターのactive状態:', Object.entries(filters).map(([key, value]) => {
      return {
        key,
        active: value.active,
        type: value.type,
        field: value.field
      };
    }));
    
    // 受け取ったフィルターのactiveプロパティをより詳細にチェック
    console.log('[DataTable] 受け取ったフィルターのactive詳細:',
      Object.entries(filters).map(([key, value]) => {
        return {
          key,
          hasActiveProperty: 'active' in value,
          activeValue: value.active,
          activeType: typeof value.active,
          valueJSON: JSON.stringify(value)
        };
      })
    );
    
    // 明示的なリセット信号をチェック
    if (filters.reset && filters.reset.type === 'clear') {
      console.log('[DataTable] 明示的なリセット信号を受信しました。すべてのフィルターをクリアします');
      
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
      
      // 強制的に再レンダリングを発生させる
      // setForceUpdate(prev => prev + 1);
      return;
    }
    
    // ソート処理のための変数
    let newPrimarySort = sortState.primarySort;
    let newSecondarySort = sortState.secondarySort;
    let sortUpdated = false;
    
    // フィルター情報を処理
    const normalFilters: Record<string, FilterValue> = {};
    
    // ソート関連のフラグ - ソート関連のキーがあるかどうかを確認
    const hasSortKeys = Object.keys(filters).some(key => key.startsWith('sort_'));
    
    // ソート情報が含まれているが、primary/secondaryソートがない場合は解除されたと判断
    if (hasSortKeys && !Object.values(filters).some(filter => filter.type === 'sort')) {
      console.log('[DataTable] ソート情報が解除されました');
      newPrimarySort = null;
      newSecondarySort = null;
      sortState.setSortField(null);
      sortState.setSortDirection(null);
      sortUpdated = true;
    } else {
      // フィルターを処理し、ソート情報とフィルター情報を分離
      Object.entries(filters).forEach(([key, filter]) => {
        // ソート情報の処理
        if (key.startsWith('sort_') && filter.type === 'sort') {
          sortUpdated = true;
          // キーから純粋なフィールド名を取得（sort_PREFIX_を削除）
          const fieldName = key.replace(/^sort_/, '').replace(/_primary$/, '').replace(/_secondary$/, '');
          
          if (filter.isPrimarySort) {
            // 第一ソートの設定
            newPrimarySort = {
              field: fieldName,
              direction: filter.value as 'asc' | 'desc'
            };
            
            // 後方互換性のために従来の状態も更新
            sortState.setSortField(fieldName);
            sortState.setSortDirection(filter.value as 'asc' | 'desc');
          } else {
            // 第二ソートの設定
            newSecondarySort = {
              field: fieldName,
              direction: filter.value as 'asc' | 'desc'
            };
          }
        } else {
          // 通常のフィルター情報 - active プロパティを明示的に保持
          normalFilters[key] = {
            ...filter,
            active: filter.active === undefined ? true : filter.active // activeが設定されていない場合はtrueをデフォルト値とする
          };
          console.log(`[DataTable] フィルター処理 - ${key}: active=${filter.active === undefined ? true : filter.active} を設定（元の値: ${filter.active}）`);
        }
      });
    }
    
    // ソート情報を更新
    if (sortUpdated) {
      sortState.setPrimarySort(newPrimarySort);
      sortState.setSecondarySort(newSecondarySort);
    }
    
    // フィルター情報を設定
    setColumnFilters(normalFilters);
    
    // 現在のフィルターも更新（ソート情報は含めない）
    setCurrentFilters(normalFilters);
    
    // フィルターがアクティブになったことを通知
    const hasFilters = Object.keys(normalFilters).length > 0 || sortUpdated;
    setHasActiveFilters(hasFilters);
    
    // 親コンポーネントに通知
    onFilterChange(hasFilters, {
      type: 'multiple',
      field: 'multipleFilters',
      value: Object.values(normalFilters),
      filters: {
        ...normalFilters,
        // ソート情報も追加
        ...(newPrimarySort && {
          [`sort_${newPrimarySort.field}`]: {
            field: newPrimarySort.field,
            type: 'sort',
            value: newPrimarySort.direction,
            isPrimarySort: true,
            sortField: newPrimarySort.field,
            active: true // ソート情報にもactiveを設定
          }
        }),
        ...(newSecondarySort && {
          [`sort_${newSecondarySort.field}`]: {
            field: newSecondarySort.field,
            type: 'sort',
            value: newSecondarySort.direction,
            isPrimarySort: false,
            sortField: newSecondarySort.field,
            active: true // ソート情報にもactiveを設定
          }
        }),
        // ソートが解除された場合は明示的に解除信号を送る
        ...(hasSortKeys && !newPrimarySort && {
          'sort_clear': {
            field: 'sort',
            type: 'clear',
            value: ''
          }
        })
      }
    });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);
    
    // デバッグログ - forceUpdateの変更を確認
    console.log('[DataTable] forceUpdate更新:', forceUpdate + 1);
  }, [columnFilters, currentFilters, forceUpdate, onFilterChange, sortState]);

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