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
  initialPrOnly = false, // PR状態の初期値
  initialCorporateOnly = false // 運用代行用状態の初期値
): [FilterState, FilterHandlers] {
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, FilterValue>>({});
  const [currentFilters, setCurrentFilters] = useState<Record<string, FilterQuery>>({});
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [isPrOnly, setIsPrOnly] = useState(initialPrOnly);
  const [isCorporateOnly, setIsCorporateOnly] = useState(initialCorporateOnly);

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
      } else if (
        key === 'hashtags_pr' || 
        (filter.field === 'hashtags' && 
         filter.type === 'exact_hashtags' && 
         filter.value === 'pr')
      ) {
        // PRフィルターは無視する - このフィルターはisPrOnlyの状態のみで制御
      } else if (
        key === 'hashtags_corporate' || 
        (filter.field === 'hashtags' && 
         filter.type === 'exact_hashtags' && 
         filter.value === 'corporate')
      ) {
        // 運用代行用フィルターは無視する - このフィルターはisCorporateOnlyの状態のみで制御
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
    // isPrOnlyとisCorporateOnlyの状態に応じてフィルターを追加または削除する
    const prFilterConfig: Record<string, FilterValue> = {};
    const corporateFilterConfig: Record<string, FilterValue> = {};
    
    // フィルター情報からPR状態を確認
    const hasPrFilter = Object.values(normalFilters).some(
      filter => filter.field === 'hashtags' && 
                filter.type === 'exact_hashtags' && 
                filter.value === 'pr' && 
                filter.active === true
    );

    // フィルター情報から運用代行用状態を確認
    const hasCorporateFilter = Object.values(normalFilters).some(
      filter => filter.field === 'hashtags' && 
                filter.type === 'exact_hashtags' && 
                filter.value === 'corporate' && 
                filter.active === true
    );
    
    // もしフィルターにPRが含まれているか、または明示的にisPrOnly=trueが設定されている場合
    if (hasPrFilter || isPrOnly) {
      prFilterConfig.hashtags_pr = {
        field: 'hashtags',
        type: 'exact_hashtags' as const,
        value: 'pr',
        isHashtag: true,
        active: true
      };
    }

    // もしフィルターに運用代行用が含まれているか、または明示的にisCorporateOnly=trueが設定されている場合
    if (hasCorporateFilter || isCorporateOnly) {
      corporateFilterConfig.hashtags_corporate = {
        field: 'hashtags',
        type: 'exact_hashtags' as const,
        value: 'corporate',
        isHashtag: true,
        active: true
      };
    }

    // フィルター情報を設定 - PRフィルターと運用代行用フィルターの状態を正確に反映
    const updatedColumnFilters: Record<string, FilterValue> = {
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig,
      ...prFilterConfig,
      ...corporateFilterConfig
    };
    
    setColumnFilters(updatedColumnFilters);
    
    // 現在のフィルターも更新（ソート情報も含める）
    const newCurrentFilters: Record<string, FilterQuery> = {
      ...normalFilters,
      ...primarySortConfig,
      ...secondarySortConfig,
      ...prFilterConfig,
      ...corporateFilterConfig
    };
    
    setCurrentFilters(newCurrentFilters);
    
    // フィルターがアクティブになったことを通知
    const hasFilters = Object.keys(normalFilters).length > 0 || sortUpdated || Object.keys(prFilterConfig).length > 0 || Object.keys(corporateFilterConfig).length > 0;
    setHasActiveFilters(hasFilters);
    
    // 親コンポーネントに通知 - isPrOnlyとisCorporateOnlyの状態も含める
    onFilterChange(hasFilters, {
      type: 'multiple',
      field: 'multipleFilters',
      value: Object.values(normalFilters),
      filters: newCurrentFilters,
      isPrOnly: !!Object.keys(prFilterConfig).length, // PRフィルターの有無に基づいて設定
      isCorporateOnly: !!Object.keys(corporateFilterConfig).length // 運用代行用フィルターの有無に基づいて設定
    });
    
    // フィルターポップアップを閉じる
    setIsFilterPopupOpen(false);
    
  }, [onFilterChange, sortState, isPrOnly, isCorporateOnly]);

  // フィルター適用時にisPrOnlyも含める
  const applyFilters = useCallback((filters: Record<string, FilterValue>) => {
    // フィルターオブジェクトの構築
    const filterQuery: FilterQuery = {
      field: 'multiple',
      type: 'multiple',
      value: Object.values(filters),
      filters,
      isPrOnly // PR状態も含める
    };
    
    // フィルターがあるかどうかの判定
    const hasFilters = Object.keys(filters).length > 0 || isPrOnly;
    
    // 親コンポーネントに通知
    onFilterChange(hasFilters, filterQuery);
  }, [isPrOnly, onFilterChange, currentFilters]);
  
  // PR状態変更ハンドラー
  const handlePrOnlyChange = useCallback((newPrOnly: boolean) => {
    setIsPrOnly(newPrOnly);
    setIsCorporateOnly(false); // 他のタブをオフにする
    
    if (!newPrOnly) {
      // 新しいフィルターを作成（PRフィルターを除外）
      const newColumnFilters = { ...columnFilters };
      delete newColumnFilters.hashtags_pr;
      delete newColumnFilters.hashtags;
      
      // 他のハッシュタグ関連フィルターもチェックして削除
      Object.keys(newColumnFilters).forEach(key => {
        const filter = newColumnFilters[key];
        if (
          (filter.field === 'hashtags' && filter.type === 'exact_hashtags' && filter.value === 'pr') ||
          (key.includes('hashtag') && filter.value === 'pr')
        ) {
          delete newColumnFilters[key];
        }
      });
      
      // フィルター状態を更新
      setColumnFilters(newColumnFilters);
      
      // 現在のフィルターからもPR関連を削除
      const newCurrentFilters = { ...currentFilters };
      delete newCurrentFilters.hashtags_pr;
      delete newCurrentFilters.hashtags;
      
      // 同様に関連フィルターをすべて削除
      Object.keys(newCurrentFilters).forEach(key => {
        const filter = newCurrentFilters[key];
        if (
          (filter && filter.field === 'hashtags' && filter.type === 'exact_hashtags' && filter.value === 'pr') ||
          (key.includes('hashtag') && filter && filter.value === 'pr')
        ) {
          delete newCurrentFilters[key];
        }
      });
      
      // 現在のフィルターを更新
      setCurrentFilters(newCurrentFilters);
      
      // フィルターポップアップを閉じて内部状態をリセット
      setIsFilterPopupOpen(false);
      
      // 親コンポーネントに通知 - ダッシュボードに対して明示的にPRフィルターを削除する信号を送信
      onFilterChange(Object.keys(newColumnFilters).length > 0, {
        type: 'multiple',
        field: 'multipleFilters',
        value: Object.values(newCurrentFilters),
        filters: newCurrentFilters,  // PRフィルターが含まれていないフィルターセットを渡す
        isPrOnly: false,  // 明示的にPR状態をfalseに設定
        isCorporateOnly: false
      });

    } else {
      // PR有効時
      const prFilter: FilterQuery = {
        field: 'hashtags',
        type: 'exact_hashtags' as const,
        value: 'pr',
        isHashtag: true,
        active: true
      };
      
      // 既存のフィルターにPRフィルターを追加
      const newFilters = {
        ...currentFilters,
        hashtags_pr: prFilter
      };
      
      // フィルター状態を更新
      setColumnFilters(newFilters);
      setCurrentFilters(newFilters);
      
      // フィルターポップアップを閉じて内部状態をリセット
      setIsFilterPopupOpen(false);
      
      // 親コンポーネントに通知
      onFilterChange(true, prFilter);
    }
  }, [columnFilters, currentFilters, onFilterChange, setColumnFilters, setCurrentFilters, setIsFilterPopupOpen]);

  // 運用代行用状態変更ハンドラー
  const handleCorporateOnlyChange = useCallback((newCorporateOnly: boolean) => {
    setIsCorporateOnly(newCorporateOnly);
    setIsPrOnly(false); // 他のタブをオフにする
    
    if (!newCorporateOnly) {
      // 新しいフィルターを作成（運用代行用フィルターを除外）
      const newColumnFilters = { ...columnFilters };
      delete newColumnFilters.hashtags_corporate;
      delete newColumnFilters.hashtags;
      
      // 他のハッシュタグ関連フィルターもチェックして削除
      Object.keys(newColumnFilters).forEach(key => {
        const filter = newColumnFilters[key];
        if (
          (filter.field === 'hashtags' && filter.type === 'exact_hashtags' && filter.value === 'corporate') ||
          (key.includes('hashtag') && filter.value === 'corporate')
        ) {
          delete newColumnFilters[key];
        }
      });
      
      // フィルター状態を更新
      setColumnFilters(newColumnFilters);
      
      // 現在のフィルターからも運用代行用関連を削除
      const newCurrentFilters = { ...currentFilters };
      delete newCurrentFilters.hashtags_corporate;
      delete newCurrentFilters.hashtags;
      
      // 同様に関連フィルターをすべて削除
      Object.keys(newCurrentFilters).forEach(key => {
        const filter = newCurrentFilters[key];
        if (
          (filter && filter.field === 'hashtags' && filter.type === 'exact_hashtags' && filter.value === 'corporate') ||
          (key.includes('hashtag') && filter && filter.value === 'corporate')
        ) {
          delete newCurrentFilters[key];
        }
      });
      
      // 現在のフィルターを更新
      setCurrentFilters(newCurrentFilters);
      
      // フィルターポップアップを閉じて内部状態をリセット
      setIsFilterPopupOpen(false);
      
      // 親コンポーネントに通知 - ダッシュボードに対して明示的に運用代行用フィルターを削除する信号を送信
      onFilterChange(Object.keys(newColumnFilters).length > 0, {
        type: 'multiple',
        field: 'multipleFilters',
        value: Object.values(newCurrentFilters),
        filters: newCurrentFilters,  // 運用代行用フィルターが含まれていないフィルターセットを渡す
        isPrOnly: false,
        isCorporateOnly: false  // 明示的に運用代行用状態をfalseに設定
      });

    } else {
      // 運用代行用有効時
      const corporateFilter: FilterQuery = {
        field: 'hashtags',
        type: 'exact_hashtags' as const,
        value: 'corporate',
        isHashtag: true,
        active: true
      };
      
      // 既存のフィルターに運用代行用フィルターを追加
      const newFilters = {
        ...currentFilters,
        hashtags_corporate: corporateFilter
      };
      
      // フィルター状態を更新
      setColumnFilters(newFilters);
      setCurrentFilters(newFilters);
      
      // フィルターポップアップを閉じて内部状態をリセット
      setIsFilterPopupOpen(false);
      
      // 親コンポーネントに通知
      onFilterChange(true, corporateFilter);
    }
  }, [columnFilters, currentFilters, onFilterChange, setColumnFilters, setCurrentFilters, setIsFilterPopupOpen]);

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