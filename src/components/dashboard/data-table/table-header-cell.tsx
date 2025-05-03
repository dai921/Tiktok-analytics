'use client'
//テスト用に変更
import { useState, ReactNode, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import type { FilterValue, ComparisonOperator } from '@/types/dashboard'
import { Portal } from '@radix-ui/react-portal'
import { cn } from '@/lib/utils'
import { fetchCategories } from '@/lib/api'  // カテゴリ取得用のAPIを追加
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// デバッグログフラグ - 開発時のみtrueに変更
const DEBUG_LOG = false;

// FilterType定義を更新 - エクスポートしない
type FilterTypeLocal = 'equal' | 'greater' | 'less' | 'between' | 'contains' | 'sort' | 'clear' | 'number' | 'date' | 'text' | 'multiselect';

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
  isLoadingFilterOptions?: boolean
  sortPriority?: 1 | 2 | null  // ソートの優先順位を追加（1: 第一ソート、2: 第二ソート）
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

// FilterIconコンポーネントを追加
const FilterIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
);

export const TableHeaderCell = forwardRef<TableHeaderCellRef, TableHeaderCellProps>(
  ({ title, type = 'text', align = 'left', onFilter, style, currentFilters, isActive = false, categoryData = [], sortDirection = null, isLoadingFilterOptions = false, sortPriority = null }, ref) => {
    // レンダリング回数をカウントするref
    const renderCountRef = useRef(0);
    
    // レンダリングごとにカウントを増加
    useEffect(() => {
      renderCountRef.current += 1;
    }, [title]);

    // 数値カラムかどうかを判定する関数
    const isNumericColumn = (title: string): boolean => {
      return ['再生数', 'いいね数', 'コメント数', '2日再生増加数', '10日再生増加数', '2日いいね増加数', '10日いいね増加数', '2日コメント増加数', '10日コメント増加数', '投稿日', '保存数', '2日保存増加数', '10日保存増加数'].includes(title);
    }

    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [filterValue, setFilterValue] = useState('')
    const [filterType, setFilterType] = useState<FilterTypeLocal>('equal')
    const [localSortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(sortDirection);
    // 数値カラムの場合は自動的に右寄せにする
    const alignmentClass = isNumericColumn(title) ? 'text-right' : (align === 'right' ? 'text-right' : 'text-left')
    const [categories, setCategories] = useState<string[]>([])
    const [filteredCategories, setFilteredCategories] = useState<string[]>([]) // フィルタリングされたカテゴリリスト
    const [isLoadingCategories, setIsLoadingCategories] = useState(false)

    // デバッグログをフラグ制御
    const logDebug = (message: string, data?: any) => {
      if (!DEBUG_LOG) return;
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    };


    // フィルターまたはソートがアクティブかどうかを判定
    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef<HTMLButtonElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)

    // フィルターの状態をリセットする関数を更新
    const resetFilterState = useCallback(() => {
      setFilterValue('')
      setFilterType('equal')
      setSortDirection(null)
      
      // 親コンポーネントへの通知は以下に移動（この関数から削除）
    }, [title])

    // isActiveの変更を監視
    useEffect(() => {
      
      // リセットが必要かどうか明示的にチェック（フィルターが解除された場合）
      if (isActive === false) {
        // isActiveがfalseになったときだけ内部状態をリセット
        // 親への通知は行わない（無限ループ防止）
        setFilterValue('');
        setFilterType('equal');
        setSortDirection(null);
        
        logDebug(`[TableHeaderCell] ${title} - フィルター状態をリセットしました`);
      } else if (isActive === true) {
        logDebug(`[TableHeaderCell] ${title} - フィルターがアクティブになりました`);
      }
    }, [isActive, title]);

    // レンダリング前にisActiveの状態をログ出力
    useEffect(() => {
      logDebug(`[TableHeaderCell] ${title} - レンダリング時のisActive: ${isActive}, typeof: ${typeof isActive}`);
    });

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

    // ソート状態とボタンスタイルを更新する関数
    const updateSortStateAndStyles = useCallback(() => {
      
      const headerElement = buttonRef.current?.closest('[data-header-cell]');
      if (headerElement) {
        headerElement.setAttribute('data-sort-active', localSortDirection ? 'true' : 'false');
        headerElement.setAttribute('data-active', localSortDirection ? 'true' : isActive ? 'true' : 'false');
      }
    }, [title, localSortDirection, isActive, buttonRef]);

    // 外部からのsortDirectionプロップと内部ステートを同期させる
    useEffect(() => {
      
      if (sortDirection !== localSortDirection) {
        
        // 直接状態を更新
        setSortDirection(sortDirection);
        
        // DOM要素も直接更新
        const headerElement = buttonRef.current?.closest('[data-header-cell]');
        if (headerElement) {
          headerElement.setAttribute('data-sort-active', sortDirection ? 'true' : 'false');
          headerElement.setAttribute('data-active', sortDirection ? 'true' : isActive ? 'true' : 'false');
          headerElement.setAttribute('data-has-sort', sortDirection ? 'true' : 'false');
          headerElement.setAttribute('data-sort-direction', sortDirection || '');
        }
      }
    }, [sortDirection, localSortDirection]);

    // レンダリング時に実際のDOM要素のスタイル状態をチェック
    useEffect(() => {
      // 初回レンダリング後にヘッダー要素のスタイルを確認
      const checkHeaderStyles = () => {
        const headerElement = buttonRef.current?.closest('[data-header-cell]');
        if (headerElement) {
        }
      };
      
      // DOM更新後に実行するためにsetTimeoutで遅延
      setTimeout(checkHeaderStyles, 0);
    }, [title, sortDirection, localSortDirection]);



    // コンポーネントの初期レンダリング時にソート状態をログ
    useEffect(() => {
    }, []);

    // レンダリング直前の状態チェック
    useEffect(() => {
      // レンダリング前のチェック
    }, [title, sortDirection, localSortDirection]);

    // 昇順・降順ソート用の関数を更新
    const handleSortDirection = (direction: 'asc' | 'desc') => {

      // ソートの状態のみをリセット（data-sort-active属性のみ）
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        if (el !== buttonRef.current?.closest('[data-header-cell]')) {
          el.setAttribute('data-sort-active', 'false');
        }
      });
      
      setSortDirection(direction);
      // ポップアップを閉じる
      setIsFilterOpen(false);
      
      // ボタンスタイルを即時更新
      setTimeout(() => {
        updateSortStateAndStyles();
      }, 0);

      // 特定のフィールドは直接内部フィールド名を使用
      let fieldName = title;
      if (title === '投稿日') {
        fieldName = 'createdAt';
      } else if (title === '再生数') {
        fieldName = 'views';
      } else if (title === 'いいね数') {
        fieldName = 'likes';
      } else if (title === 'コメント数') {
        fieldName = 'comments';
      } else if (title === '2日再生増加数') {
        fieldName = 'viewsIncrease';
      } else if (title === '10日再生増加数') {
        fieldName = 'ten_days_increase';
      } else if (title === '2日いいね増加数') {
        fieldName = 'likes_count_increase';
      } else if (title === '10日いいね増加数') {
        fieldName = 'ten_days_likes_increase';
      } else if (title === '2日コメント増加数') {
        fieldName = 'comment_count_increase';
      } else if (title === '10日コメント増加数') {
        fieldName = 'ten_days_comment_increase';
      }


      // ソート情報を親コンポーネントに渡す
      onFilter?.({
        field: fieldName,  // 内部フィールド名を使用
        type: 'sort',
        value: direction,
        isPrimarySort: true,  // このソートを主ソートとして扱うフラグ
        sortField: fieldName,  // ソート対象のフィールド名を明示的に含める
        active: true  // activeフラグを追加
      });
    };

    // ソート処理とフィルターの表示を切り替えるハンドラー
    const handleToggleFilter = () => {
      // 数値カラムはソート優先、その他はフィルター優先
      if (type === 'number') {
        // 数値カラムの場合、クリックでソート切り替え
        if (localSortDirection === null || localSortDirection === 'desc') {
          handleSortDirection('asc');
        } else if (localSortDirection === 'asc') {
          handleSortDirection('desc');
        }
      } else {
        // それ以外のカラムはフィルターポップアップを表示
        setIsFilterOpen(!isFilterOpen);
        if (!isFilterOpen) {
          calculatePopupPosition();
        }
      }
    };

    const handleClear = () => {
      logDebug(`${title} - フィルタークリア実行`);
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
        logDebug(`フィルター ${fieldName} をクリアしています`);
        
        // フィールド名のマッピング
        let actualFieldName = fieldName;
        if (title === '投稿日') {
          actualFieldName = 'createdAt';
        } else if (title === '再生数') {
          actualFieldName = 'views';
        } else if (title === 'いいね数') {
          actualFieldName = 'likes';
        } else if (title === 'コメント数') {
          actualFieldName = 'comments';
        } else if (title === '2日再生増加数') {
          actualFieldName = 'viewsIncrease';
        } else if (title === '10日再生増加数') {
          actualFieldName = 'ten_days_increase';
        } else if (title === '2日いいね増加数') {
          actualFieldName = 'likes_count_increase';
        } else if (title === '10日いいね増加数') {
          actualFieldName = 'ten_days_likes_increase';
        } else if (title === '2日コメント増加数') {
          actualFieldName = 'comment_count_increase';
        } else if (title === '10日コメント増加数') {
          actualFieldName = 'ten_days_comment_increase';
        }
        
        
        
        // 明示的なクリアフラグを送る
        onFilter({ 
          type: 'clear', 
          value: '', 
          field: actualFieldName,
          clear: true  // 明示的なクリアフラグ
        });
      }
    };

    const handleFilter = (value: string, type: FilterTypeLocal) => {
      if (!onFilter) return;
      
      // キャプションの場合のみ部分一致を適用
      if (title === 'キャプション') {
        onFilter({
          field: title,
          value: value,
          type: 'contains'  // キャプションは常に部分一致
        }, true);
      } else if (title === '動画ジャンル') {
        // ジャンルの既存の特別処理を維持
        onFilter({
          field: title,
          value: value,
          type: type
        }, true);
      } else if (type === 'number') {
        // 数値フィールドの場合は値を数値に変換
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          onFilter({
            field: title,
            value: numValue,  // 明示的に数値型として渡す
            type: type,
            comparison: type as ComparisonOperator
          }, true);
        } else if (value === '') {
          // 空の値の場合はクリア
          handleClear();
        }
      } else {
        // その他のフィールドは通常通りの処理
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
        resetFilterState();
        if (onFilter) {
          onFilter({
            field: title,
            type: 'clear',
            value: '',
            clear: true
          });
        }
      }
    }), [resetFilterState, onFilter, title]);

    const renderFilterInput = () => {
      switch (type) {
        case 'date':
          return (
            <div className="flex flex-col gap-2">
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FilterTypeLocal)}
                className="px-2 py-1 border rounded text-xs border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
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
              onChange={(e) => {
                const newValue = e.target.value;
                // 空文字列の場合
                if (newValue === '') {
                  setFilterValue('');
                } else {
                  setFilterValue(newValue);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // 空文字列の場合はフィルターをクリア
                  if (e.currentTarget.value === '') {
                    handleClear();
                    return;
                  }
                  
                  // 数値に変換
                  const numVal = parseFloat(e.currentTarget.value);
                  if (!isNaN(numVal)) {
                    // 直接onFilterを使用
                    if (onFilter) {
                      const fieldName = 
                        title === '再生数' ? 'views' : 
                        title === 'いいね数' ? 'likes' : 
                        title === 'コメント数' ? 'comments' : 
                        title === '2日再生増加数' ? 'viewsIncrease' : 
                        title === '10日再生増加数' ? 'ten_days_increase' : 
                        title === '2日いいね増加数' ? 'likes_count_increase' : 
                        title === '10日いいね増加数' ? 'ten_days_likes_increase' : 
                        title === '2日コメント増加数' ? 'comment_count_increase' : 
                        title === '10日コメント増加数' ? 'ten_days_comment_increase' : 
                        String(title);
                      
                      onFilter({
                        field: fieldName,
                        value: numVal,
                        type: 'number',
                        comparison: filterType as unknown as ComparisonOperator
                      }, true);
                      
                      setIsFilterOpen(false);
                    }
                  }
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

    // categoryDataが変更されたときのuseEffect
    useEffect(() => {
      if (categoryData && categoryData.length > 0) {
        setCategories(categoryData);
        setFilteredCategories(categoryData);
      }
    }, [categoryData, title]);

    // カテゴリを選択する処理
    const handleCategorySelect = (category: string) => {
      logDebug(`カテゴリ選択: ${category}`);
      
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
      if (!['動画ジャンル', 'アカウント名', 'ハッシュタグ', 'BGM'].includes(title)) {
        return null;
      }

      // ローディング中の表示
      if (isLoadingFilterOptions) {
        return (
          <div className="flex justify-center items-center py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            <span className="ml-2 text-xs text-gray-500">フィルター更新中...</span>
          </div>
        );
      }

      // カテゴリが空の場合
      if (filteredCategories.length === 0) {
        return (
          <div className="py-4 px-3 text-sm text-gray-500 text-center">
            選択可能な項目がありません
          </div>
        );
      }

      return (
        <div className="p-2 border-t">
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
        case '動画ジャンル':
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

    // renderCategoryList の前あたりに配置
    const renderSortSection = () => {
      // 数値カラムの場合のみソート機能を表示                 
      if (!isNumericColumn(title)) {
        return null;
      }

      return (
        <div className="p-2 border-t">
          {/* ソートのヘッダー部分 */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-700">並び替え</p>
            {/* ソートがアクティブな場合のみクリアボタンを表示 */}
          </div>

          {/* ソートボタン */}
          <div className="space-y-1">
            <button 
              onClick={() => handleSortDirection('desc')}
              className={cn(
                "w-full text-left px-2 py-1 rounded text-xs",
                localSortDirection === 'desc' 
                  ? "bg-blue-100 font-semibold text-blue-700" 
                  : "hover:bg-gray-50 text-gray-700"
              )}
            >
              {getDescSortLabel()}
            </button>
            <button 
              onClick={() => handleSortDirection('asc')}
              className={cn(
                "w-full text-left px-2 py-1 rounded text-xs",
                localSortDirection === 'asc' 
                  ? "bg-blue-100 font-semibold text-blue-700" 
                  : "hover:bg-gray-50 text-gray-700"
              )}
            >
              {getAscSortLabel()}
            </button>
          </div>
        </div>
      );
    };


    // スタイルのデバッグ関連
    const buttonStyleClasses = cn(
      "cursor-pointer flex items-center border border-transparent rounded hover:bg-gray-100",
      isNumericColumn(title) ? "pl-1 pr-0" : "p-1",
      localSortDirection ? "font-semibold" : "",
      (isActive || localSortDirection) ? "text-blue-600" : ""
    );

    // ボタン要素のマウント後に要素を確認
    useEffect(() => {
      if (buttonRef.current) {
        console.log('[DOM-DEBUG] TableHeaderCell - ボタン要素:', {
          title,
          element: buttonRef.current,
          hasDataActive: buttonRef.current.hasAttribute('data-active'),
          hasDataSortActive: buttonRef.current.hasAttribute('data-sort-active'),
          dataActiveValue: buttonRef.current.getAttribute('data-active'),
          dataSortActiveValue: buttonRef.current.getAttribute('data-sort-active')
        });
      }
    }, [title, localSortDirection, isActive]);

    return (
      <div 
        className={cn(
          "relative p-0 h-full w-full", 
          isNumericColumn(title) ? "text-right !important" : "",
          localSortDirection ? "has-sort-indicator" : ""
        )}
        data-header-cell 
        data-active={isActive || localSortDirection ? 'true' : 'false'}
        data-sort-active={localSortDirection ? 'true' : 'false'}
        data-sort-direction={localSortDirection}
        data-has-sort={!!localSortDirection ? 'true' : 'false'}
        data-title={title}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%' 
        }}
      >
        <div className={cn(
          "h-full w-full",
          "bg-gray-50",
          isNumericColumn(title) ? "pl-0 pr-0" : "pl-0 pr-0",
          "py-1 text-[12px]",
          alignmentClass,
          (isActive || localSortDirection) ? "text-blue-600 font-medium" : "text-gray-700"
        )}>
          <div
            className={cn(
              "flex items-center border border-transparent",
              isNumericColumn(title) ? "pl-1 pr-0" : "p-1",
              localSortDirection ? "font-semibold" : "",
              (isActive || localSortDirection) ? "text-blue-600" : "",
              "w-full"
            )}
            data-active={isActive || localSortDirection ? 'true' : 'false'}
            data-sort-active={localSortDirection ? 'true' : 'false'}
            data-sort-direction={localSortDirection}
            data-has-sort={!!localSortDirection ? 'true' : 'false'}
            style={{
              fontWeight: localSortDirection ? 'bold' : 'normal',
              color: (isActive || localSortDirection) ? '#2563eb' : 'inherit',
              width: '100%',
              textAlign: isNumericColumn(title) ? 'right' : 'left',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isNumericColumn(title) ? 'flex-end' : 'flex-start',
              gap: '4px'
            }}
          >
            <span className={`${localSortDirection ? "text-blue-700" : ""} ${isNumericColumn(title) ? "text-right w-full" : "w-full"}`}>
              {title}
            </span>
            
            {/* ソート方向表示 - フィルター機能は削除したがソート表示は維持 */}
            {localSortDirection && (
              <span 
                className={`ml-1 inline-flex items-center justify-center h-4 w-4 bg-blue-100 rounded-full ${isNumericColumn(title) ? "mr-0" : ""}`}
                data-sort-indicator="true"
                data-sort-direction={localSortDirection}
              >
                <span className="font-bold text-blue-700">
                  {localSortDirection === 'asc' ? '↑' : '↓'}
                </span>
                {sortPriority && (
                  <span className="ml-0.5 text-[10px] absolute top-0 right-0 font-bold text-blue-700">
                    {sortPriority}
                  </span>
                )}
              </span>
            )}
            
            {/* フィルターアクティブ表示（ソートがない場合） */}
            {isActive && !localSortDirection && (
              <span className={`ml-1 inline-block w-2 h-2 rounded-full bg-blue-600 ${isNumericColumn(title) ? "mr-0" : ""}`}></span>
            )}
          </div>
        </div>
        
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
                      onChange={(e) => setFilterType(e.target.value as FilterTypeLocal)}
                      className="px-2 py-1 border rounded text-xs border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
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
                      logDebug(`フィルタークリアボタンがクリックされました: ${title}`);
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
              
              {/* ソートセクションを条件付きで表示 */}
              {renderSortSection()}
            </div>
          </Portal>
        )}
      </div>
    );
  }
)

TableHeaderCell.displayName = "TableHeaderCell" 