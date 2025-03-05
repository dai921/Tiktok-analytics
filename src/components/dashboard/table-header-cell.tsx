'use client'
//テスト用に変更
import { useState, ReactNode, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import type { FilterValue, FilterType } from '@/types/dashboard'
import { Portal } from '@radix-ui/react-portal'
import { cn } from '@/lib/utils'

interface TableHeaderCellProps {
  title: string
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right' | 'center'
  onFilter?: (value: FilterValue) => void
  style?: React.CSSProperties
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
        { value: 'equal' as const, label: '等しい' },
        { value: 'after' as const, label: '以降' },
        { value: 'before' as const, label: '以前' }
      ]
    default:
      return [
        { value: 'equal' as const, label: '等しい' }
      ]
  }
}

export const TableHeaderCell = forwardRef<TableHeaderCellRef, TableHeaderCellProps>(
  ({ title, type = 'text', align = 'left', onFilter, style }, ref) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [filterValue, setFilterValue] = useState('')
    const [filterType, setFilterType] = useState<FilterType>('equal')
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
    const [isActive, setIsActive] = useState(false)
    const alignmentClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

    const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 })
    const buttonRef = useRef<HTMLButtonElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)

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

    const handleSort = () => {
      // 他のカラムのソートとアクティブ状態をクリア
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        if (el !== buttonRef.current?.closest('[data-header-cell]')) {
          const button = el.querySelector('button');
          if (button) {
            button.setAttribute('data-sort-active', 'false');
            button.classList.remove('text-sky-500');
          }
          el.classList.remove('text-blue-600', 'font-medium');
        }
      });

      const newDirection = sortDirection === null ? 'desc' : 
                          sortDirection === 'desc' ? 'asc' : null
      setSortDirection(newDirection)
      setIsActive(!!newDirection || !!filterValue)

      if (newDirection) {
        onFilter?.({
          field: title,
          type: 'sort',
          value: newDirection
        })
      } else {
        handleClear()
      }
      setIsFilterOpen(false)
    }

    const handleClear = () => {
      // 全てのヘッダーセルのスタイルをリセット
      document.querySelectorAll('[data-header-cell]').forEach(el => {
        const button = el.querySelector('button');
        if (button) {
          button.setAttribute('data-sort-active', 'false');
          button.classList.remove('text-sky-500');
        }
        el.classList.remove('text-blue-600', 'font-medium');
      });

      setFilterValue('')
      setSortDirection(null)
      setFilterType('equal')
      setIsActive(false)
      onFilter?.({
        field: title,
        type: 'equal',
        value: '',
        clear: true
      })
      setIsFilterOpen(false)
    }

    const handleFilter = (value: string, filterType: FilterType) => {
      onFilter({
        field: title,  // 例: '投稿日時', 'いいね数', 'コメント数'
        type: filterType,
        value
      })
    }

    const renderFilterInput = () => {
      switch (type) {
        case 'date':
          return (
            <input
              type="date"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              className="w-full px-2 py-1 border rounded text-xs"
            />
          )
        case 'number':
          return (
            <input
              type="number"
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter(filterValue, filterType)
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
              onChange={(e) => setFilterValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter(filterValue, filterType)
                }
              }}
              placeholder="フィルター..."
              className="w-full px-2 py-1 border rounded text-xs"
            />
          )
      }
    }

    const hasFilter = !!onFilter

    const getSortLabel = () => {
      // 数値フィールドの場合
      if (type === 'number') {
        return sortDirection === null ? '▼ 大きい順に並び替え' :
               sortDirection === 'desc' ? '▲ 小さい順に並び替え' : 
               '▼ 大きい順に並び替え';
      }
      
      // その他のフィールド
      return sortDirection === null ? '▼ 降順に並び替え' :
             sortDirection === 'desc' ? '▲ 昇順に並び替え' : 
             '▼ 降順に並び替え';
    };

    // 外部からアクセスできるようにする
    useImperativeHandle(ref, () => ({
      clearFilter: handleClear
    }))

    // isFilterOpenの状態変更を処理
    const toggleFilter = () => {
      setIsFilterOpen(!isFilterOpen);
    };

    return (
      <div 
        data-header-cell
        className={cn(
          "flex items-center gap-1 whitespace-nowrap",
          "px-2 py-1 text-gray-700 text-sm",
          align === 'center' ? 'justify-center' : '',
          isActive ? "text-blue-600 font-medium" : ""
        )}
      >
        <span>{title}</span>
        {hasFilter && (
          <button 
            ref={buttonRef}
            onClick={toggleFilter}
            data-sort-active={!!sortDirection}
            className={`p-1 hover:bg-gray-100 rounded ${(sortDirection || filterValue) ? 'text-sky-500' : ''}`}
          >
            <svg 
              className="w-4 h-4"
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor"
              strokeWidth={(sortDirection || filterValue) ? "3" : "2"}
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
                  {renderFilterInput()}
                </div>
                <button
                  onClick={() => handleFilter(filterValue, filterType)}
                  className="w-full text-left px-2 py-1 text-xs bg-sky-500 text-white hover:bg-sky-600 rounded mb-2"
                >
                  フィルターを適用
                </button>
                {(filterValue || sortDirection) && (
                  <button
                    onClick={handleClear}
                    className="w-full text-left px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
                  >
                    フィルターをクリア
                  </button>
                )}
              </div>
              <div className="p-2 border-t">
                <button 
                  onClick={handleSort}
                  className="w-full text-left px-2 py-1 hover:bg-gray-50 rounded text-xs"
                >
                  {getSortLabel()}
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