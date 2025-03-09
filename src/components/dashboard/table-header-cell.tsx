'use client'
//テスト用に変更
import { useState, ReactNode, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import type { FilterValue } from '@/types/dashboard'
import { Portal } from '@radix-ui/react-portal'
import { cn } from '@/lib/utils'
import { fetchCategories } from '@/lib/api'  // カテゴリ取得用のAPIを追加
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// FilterType定義を更新
export type FilterType = 'equal' | 'greater' | 'less' | 'between' | 'contains' | 'sort' | 'clear';

interface TableHeaderCellProps {
  title: string
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right' | 'center'
  onFilter?: (value: FilterValue, shouldMerge?: boolean) => void
  style?: React.CSSProperties
  currentFilters?: Record<string, FilterValue>
  isActive?: boolean
  categoryData?: string[]  // カテゴリデータの型を追加
  sortDirection?: 'asc' | 'desc' | null  // ソート方向を追加
}

export interface TableHeaderCellRef {
  clearFilter: () => void
}

// 幅を設定する関数を定義
const getColumnWidth = (title: ReactNode) => {
  // すべてのカラムで同じ幅に
  return 'w-[120px] min-w-[120px]'
}

// 選択肢を動的に生成　
const getFilterOptions = (type: 'text' | 'number' | 'date') => {
  switch (type) {
    case 'number':
      return [
        { value: 'equal' as const, label: '等しい' },
        { value: 'greater' as const, label: '以上' },
        { value: 'less' as const, label: '以下' }
      ]
    case 'date':
      return [
        { value: 'date' as const, label: '等しい' },
        { value: 'after' as const, label: 'この日以降' },
        { value: 'before' as const, label: 'この日以前' }
      ]
    default:
      return [
        { value: 'equal' as const, label: '等しい' }
      ]
  }
}

export const TableHeaderCell = forwardRef<TableHeaderCellRef, TableHeaderCellProps>(
  ({ title, type = 'text', align = 'left', onFilter, style, currentFilters, isActive = false, categoryData = [], sortDirection = null }, ref) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [filterValue, setFilterValue] = useState('')
    const [filterType, setFilterType] = useState<FilterType>('equal')
    const [localSortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
    const alignmentClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    const [categories, setCategories] = useState<string[]>([])
    const [filteredCategories, setFilteredCategories] = useState<string[]>([]) // フィルタリングされたカテゴリリスト
    const [isLoadingCategories, setIsLoadingCategories] = useState(false)

    // フィルターまたはソートがアクティブかどうかを判定
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef<HTMLButtonElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)

    // フィルターの状態をリセットする関数を更新
    const resetFilterState = useCallback(() => {
      console.log(`TableHeaderCell(${title}) - resetFilterState called`);
      setFilterValue('')
      setFilterType('equal')
      setSortDirection(null)
      
      // 親コンポーネントへの通知は以下に移動（この関数から削除）
    }, [title])

    // isActiveの変更を監視
    useEffect(() => {
      console.log(`TableHeaderCell(${title}) - isActive changed:`, { isActive });
      if (!isActive) {
        // isActiveがfalseになったときだけ内部状態をリセット
        // 親への通知は行わない（無限ループ防止）
        setFilterValue('')
        setFilterType('equal')
        setSortDirection(null)
      }
    }, [isActive, title])

    // ポップアップの位置を計算する関数
    const calculatePopupPosition = useCallback(() => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        
        // スクロール位置を考慮した絶対位置を計算
        setPopupPosition({
          top: rect.top + scrollY - 130, // ボタンの上部に表示
          left: rect.left + scrollX - 10 // 少し左に調整
        });
      }
    }, []);

    // フィルターを開くときに位置を計算
    useEffect(() => {
      if (isFilterOpen) {
        calculatePopupPosition();
      }
    }, [isFilterOpen, calculatePopupPosition]);

    useEffect(() => {
      if (isFilterOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        // 画面上部に表示するための位置計算は不要になるため、この部分は使用しません
      }
    }, [isFilterOpen]);

    useEffect(() => {
      // クリック外側検知のハンドラー
      const handleClickOutside = (event: MouseEvent) => {
        if (isFilterOpen && 
            popupRef.current && 
            buttonRef.current && 
            !popupRef.current.contains(event.target as Node) &&
            !buttonRef.current.contains(event.target as Node)) {
          setIsFilterOpen(false)
        }
      }

      // イベントリスナーを登録 (スクロールイベントリスナーは削除)
      document.addEventListener('mousedown', handleClickOutside)
      
      // クリーンアップ関数
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isFilterOpen]);

    // ポップアップの可視性を監視するIntersection Observer
    useEffect(() => {
      if (!isFilterOpen || !popupRef.current) return;

      // 少し遅延させてからObserverを設定（初期表示での誤検出を防ぐ）
      const timer = setTimeout(() => {
        // 画面外に出たら閉じる処理を実装
        const observer = new IntersectionObserver(
          (entries) => {
            // entriesは監視対象の要素の配列
            const [entry] = entries;
            // 要素が画面外に出たら（intersectionRatio === 0）ポップアップを閉じる
            if (!entry.isIntersecting) {
              setIsFilterOpen(false);
            }
          },
          {
            // rootはビューポート（null）、marginは余裕を持たせる
            root: null,
            threshold: 0,  // 完全に見えなくなったときに反応
            rootMargin: '10px', // 少し余裕を持たせる
          }
        );

        // popupRefの監視を開始
        if (popupRef.current) {
          observer.observe(popupRef.current);
        }

        return () => {
          observer.disconnect();
        };
      }, 100); // 100ms遅延

      // クリーンアップ
      return () => {
        clearTimeout(timer);
      };
    }, [isFilterOpen]);

    // 外部からのsortDirectionプロップと内部ステートを同期させる
    useEffect(() => {
      if (sortDirection !== localSortDirection) {
        setSortDirection(sortDirection);
      }
    }, [sortDirection, localSortDirection]);

    // 昇順・降順ソート用の新しい関数を追加
    const handleSortDirection = (direction: 'asc' | 'desc') => {
      // ソートの状態のみをリセット（data-sort-active属性のみ）
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        if (el !== buttonRef.current?.closest('[data-header-cell]')) {
          const button = el.querySelector('button');
          if (button) {
            button.setAttribute('data-sort-active', 'false');
          }
        }
      });
      
      setSortDirection(direction);
      setIsFilterOpen(false);

      // 現在のミリ秒タイムスタンプを取得
      const currentTimestamp = Date.now();

      console.log('TableHeaderCell - ソート実行:', {
        title,
        direction, 
        internalFieldMapping: title === '投稿日時' ? 'createdAt' : undefined,
        timestamp: currentTimestamp,
        currentTime: new Date(currentTimestamp).toISOString()
      });

      // 特定のフィールドは直接内部フィールド名を使用
      let fieldName = title;
      if (title === '投稿日時') {
        fieldName = 'createdAt';  // 日本語名から内部フィールド名へ直接マッピング
      } else if (title === '再生数') {
        fieldName = 'views';
      } else if (title === 'いいね数') {
        fieldName = 'likes';
      } else if (title === 'コメント数') {
        fieldName = 'comments';
      }

      // ソート情報を親コンポーネントに渡す際に、明示的に新しいソートであることを示すフラグを追加
      onFilter?.({
        field: fieldName,  // 内部フィールド名を使用
        type: 'sort',
        value: direction,
        timestamp: currentTimestamp,  // 現在のタイムスタンプを追加
        isPrimarySort: true,  // このソートを主ソートとして扱うフラグ
        sortField: fieldName  // ソート対象のフィールド名を明示的に含める
      });
    };

    const handleSort = () => {
      if (!isFilterOpen) {
        setIsFilterOpen(true);
      }
      
      // 昇順ソート
      if (localSortDirection === null || localSortDirection === 'desc') {
        handleSortDirection('asc');
        setIsFilterOpen(false);
      } 
      // 降順ソート
      else if (localSortDirection === 'asc') {
        handleSortDirection('desc');
        setIsFilterOpen(false);
      }
    };

    const handleClear = () => {
      console.log(`${title} - フィルタークリア実行`);
      // ローカル状態をクリア
      setFilterValue('');
      setIsFilterOpen(false);
      setSortDirection(null);
      
      // カテゴリフィルターのクリア処理を追加
      if (categories.length > 0) {
        setFilteredCategories(categories);
      }
      
      // 親コンポーネントに通知（より明示的な実装）
      if (onFilter) {
        const fieldName = typeof title === 'string' ? title : '';
        console.log(`フィルター ${fieldName} をクリアしています`);
        
        // フィールド名のマッピング
        let actualFieldName = fieldName;
        if (title === '投稿日時') {
          actualFieldName = 'createdAt';
        } else if (title === '再生数') {
          actualFieldName = 'views';
        } else if (title === 'いいね数') {
          actualFieldName = 'likes';
        } else if (title === 'コメント数') {
          actualFieldName = 'comments';
        }
        
        onFilter({ 
          type: 'clear', 
          value: '', 
          field: actualFieldName 
        });
      }
    };

    const handleFilter = (value: string, type: FilterType) => {
      if (!onFilter) return;
      
      // カテゴリフィールドの場合は特別な処理
      if (title === 'ジャンル') {
        // 既存の型に合わせて渡すデータを調整
        onFilter({
          field: title,
          value: value,
          type: type
        }, true);
      } else {
        // 他のフィールドは通常通り
        onFilter({
          field: title,
          value: value,
          type: type
        }, true);
      }
    };

    const getSortLabel = () => {
      // 数値フィールドの場合
      if (type === 'number') {
        // descとascの表示を反転: descが降順、ascが昇順
        return localSortDirection === 'desc' ? '▼ 小さい順に並び替え' : '▲ 大きい順に並び替え';
      }
      
      // テキストフィールドの場合（日付やアルファベット順など）
      // descとascの表示を反転: descが降順、ascが昇順
      return localSortDirection === 'desc' ? '▼ 昇順に並び替え' : '▲ 降順に並び替え';
    };

    // 外部からアクセスできるようにする
    useImperativeHandle(ref, () => ({
      clearFilter: () => {
        // ローカル状態のみリセット（親への通知は行わない）
        setFilterValue('')
        setFilterType('equal')
        setSortDirection(null)
        console.log(`TableHeaderCell(${title}) - 外部からのclearFilter呼び出し`);
      }
    }), [title])

    const renderFilterInput = () => {
      switch (type) {
        case 'date':
          return (
            <div className="flex flex-col gap-2">
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterType)}
                className="w-full px-2 py-1 border rounded text-xs"
              >
                {getFilterOptions('date').map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={filterValue}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setFilterValue(newValue);
                }}
                onClick={(e) => {
                  // カレンダーを強制的に表示
                  const input = e.target as HTMLInputElement;
                  input.showPicker();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filterValue) {
                    handleFilter(filterValue, filterType);
                  }
                }}
                className="w-full px-2 py-1 border rounded text-xs mt-2 cursor-pointer"
                style={{
                  colorScheme: 'auto'
                }}
              />
            </div>
          )
        case 'number':
          return (
            <input
              type="number"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter(filterValue, filterType);
                }
              }}
              placeholder="フィルター..."
              className="w-full px-2 py-1 border rounded text-xs"
            />
          )
        default:
          return (
            <input
              type="text"
              value={filterValue}
              onChange={(e) => {
                const newValue = e.target.value;
                setFilterValue(newValue);
                
                // ジャンルの場合は即時フィルタリングのみ行う（フィルタは適用しない）
                // onChange内では e.key は存在しないため参照しない
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter(filterValue, filterType);
                }
              }}
              placeholder="フィルター..."
              className="w-full px-2 py-1 border rounded text-xs"
            />
          )
      }
    }

    // propsから受け取ったcategoryDataを使用
    useEffect(() => {
      if (categoryData && categoryData.length > 0) {
        console.log(`TableHeaderCell(${title}) - カテゴリデータを受け取りました:`, {
          count: categoryData.length,
          sample: categoryData.slice(0, 3)
        });
        setCategories(categoryData);
        // フィルタリングされた値も更新
        if (filterValue === '') {
          setFilteredCategories(categoryData);
        } else {
          const filtered = categoryData.filter(category => 
            category.toLowerCase().includes(filterValue.toLowerCase())
          );
          setFilteredCategories(filtered);
        }
      }
    }, [categoryData, title, filterValue]);

    // カテゴリを選択する処理
    const handleCategorySelect = (category: string) => {
      console.log(`カテゴリ選択: ${category}`);
      
      if (onFilter) {
        // カテゴリ選択時の処理
        // 部分一致によるフィルタリングを実装
        onFilter({
          type: 'contains', // 'equals'から'contains'に変更して部分一致検索に
          value: category,
          field: title
        });
        
        // UI状態を更新
        setFilterValue(category);
        setIsFilterOpen(false);
      }
    };

    // カテゴリリストを描画する関数を改善
    const renderCategoryList = () => {
      // カテゴリーデータが関連するカラムにのみ表示
      if (!['ジャンル', 'アカウント名', 'ハッシュタグ', 'BGM'].includes(title) || filteredCategories.length === 0) {
        return null;
      }

      return (
        <div className="p-2 border-t">
          <div className="mb-2">
            <input
              type="text"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder={`${getTitleLabel()}を検索...`}
              className="w-full px-2 py-1 border rounded text-xs"
            />
          </div>
          
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-gray-700">利用可能な{getTitleLabel()}:</p>
            <span className="text-xs text-gray-500">{filteredCategories.length}件</span>
          </div>

          {filteredCategories.length > 0 ? (
            <ul className="space-y-1 max-h-60 overflow-y-auto">
              {filteredCategories.map((category, index) => (
                <li key={index}>
                  <button
                    className="w-full text-left px-2 py-1 text-xs hover:bg-gray-50 rounded"
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 p-2">
              {filterValue ? "一致する項目がありません" : "項目がありません"}
            </p>
          )}
        </div>
      );
    };

    // タイトルに応じたラベルを取得
    const getTitleLabel = () => {
      switch (title) {
        case 'ジャンル':
          return 'カテゴリ';
        case 'アカウント名':
          return 'アカウント';
        case 'ハッシュタグ':
          return 'ハッシュタグ';
        case 'BGM':
          return '音声タイトル';
        default:
          return '項目';
      }
    };

    // 昇順/降順のラベルを取得する関数
    const getAscSortLabel = () => {
      // 数値フィールドの場合
      if (type === 'number') {
        return '▲ 小さい順に並び替え';
      }
      // テキストフィールドの場合（日付やアルファベット順など）
      return '▲ 昇順に並び替え';
    };

    const getDescSortLabel = () => {
      // 数値フィールドの場合
      if (type === 'number') {
        return '▼ 大きい順に並び替え';
      }
      // テキストフィールドの場合（日付やアルファベット順など）
      return '▼ 降順に並び替え';
    };

    return (
      <div 
        data-header-cell
        className={cn(
          "flex items-center gap-1 whitespace-nowrap",
          "px-2 py-1 text-gray-700 text-sm",
          align === 'center' ? 'justify-center' : '',
          isActive || localSortDirection ? "text-blue-600 font-medium" : ""
        )}
      >
        <div 
          className="flex items-center cursor-default" 
          // ソート機能を削除するため、handleSortの呼び出しを削除
          // onClick={handleSort}
        >
          <span>{title}</span>
          {localSortDirection && (
            <span className="ml-1 text-blue-600">
              {localSortDirection === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </div>
        {onFilter && (
          <button 
            ref={buttonRef}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`p-1 hover:bg-gray-100 rounded ${isActive ? 'text-sky-500 font-bold' : ''}`}
            data-active={isActive}
          >
            <svg 
              className="w-4 h-4"
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor"
              strokeWidth={isActive ? "3" : "2"}
            >
              <path d="M3 4h18M6 9h12M9 14h6M11 19h2" />
            </svg>
          </button>
        )}
        
        {isFilterOpen && (
          <Portal>
            <div 
              ref={popupRef}
              className="absolute bg-white border rounded shadow-lg z-[9999] text-sm w-[200px]"
              style={{ 
                top: `${popupPosition.top}px`,
                left: `${popupPosition.left}px`,
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <div className="p-2 border-b">
                <div className="flex items-center gap-2 mb-2">
                  {type === 'number' && (
                    <select 
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as FilterType)}
                      className="px-2 py-1 border rounded text-xs"
                    >
                      {getFilterOptions(type).map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {renderFilterInput()}
                </div>
                <button
                  onClick={() => handleFilter(filterValue, filterType)}
                  className="w-full text-left px-2 py-1 text-xs bg-sky-500 text-white hover:bg-sky-600 rounded mb-2"
                >
                  フィルターを適用
                </button>
                {(filterValue || localSortDirection) && (
                  <button
                    onClick={() => {
                      console.log(`フィルタークリアボタンがクリックされました: ${title}`);
                      handleClear();
                    }}
                    className="w-full text-left px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
                  >
                    フィルターをクリア
                  </button>
                )}
              </div>
              
              {/* カテゴリリストを表示 */}
              {renderCategoryList()}
              
              <div className="p-2 border-t">
                <p className="text-xs font-medium mb-1 text-gray-700">並び替え:</p>
                <button 
                  onClick={() => handleSortDirection('desc')}
                  className={`w-full text-left px-2 py-1 hover:bg-gray-50 rounded text-xs mb-1 ${localSortDirection === 'desc' ? 'bg-gray-100 font-semibold' : ''}`}
                >
                  {getDescSortLabel()}
                </button>
                <button 
                  onClick={() => handleSortDirection('asc')}
                  className={`w-full text-left px-2 py-1 hover:bg-gray-50 rounded text-xs ${localSortDirection === 'asc' ? 'bg-gray-100 font-semibold' : ''}`}
                >
                  {getAscSortLabel()}
                </button>
              </div>
            </div>
          </Portal>
        )}
      </div>
    )
  }
)

TableHeaderCell.displayName = "TableHeaderCell" 