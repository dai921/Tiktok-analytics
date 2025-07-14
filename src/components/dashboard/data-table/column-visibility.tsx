import { useState, useRef, useEffect, useCallback } from 'react';
import { DEFAULT_VISIBLE_COLUMNS } from './constants';

// デバッグフラグ
const DEBUG = false;

export function useColumnVisibility(
  defaultColumns?: string[],
  onColumnSettingsChange?: (visibleColumns: string[]) => void
) {
  // defaultColumnsが空配列の場合もDEFAULT_VISIBLE_COLUMNSを使用
  const initialColumns = (!defaultColumns || defaultColumns.length === 0) 
    ? DEFAULT_VISIBLE_COLUMNS 
    : defaultColumns;
  
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(initialColumns);
  
  // デバッグログ
  if (DEBUG) {
    console.log('useColumnVisibility - 初期化:', {
      defaultColumns,
      visibleColumns: visibleColumns.length
    });
  }
  
  // defaultColumnsが変更された時にvisibleColumnsを更新
  useEffect(() => {
    if (defaultColumns && defaultColumns.length > 0) {
      setVisibleColumns(defaultColumns);
      if (DEBUG) {
        console.log('defaultColumnsが変更されました:', defaultColumns);
      }
    }
  }, [defaultColumns]);
  
  const columnSettingsButtonRef = useRef<HTMLButtonElement>(null) as React.RefObject<HTMLButtonElement>;
  
  // カラムの表示/非表示を切り替える関数
  const handleColumnVisibilityChange = useCallback((
    columnKey: string, 
    isVisible: boolean, 
    newColumns?: string[]
  ) => {
    if (newColumns) {
      // 一括更新の場合
      setVisibleColumns(newColumns);
      onColumnSettingsChange?.(newColumns);
      return;
    }

    // 個別更新の場合
    const newVisibleColumns = isVisible
      ? [...visibleColumns, columnKey]
      : visibleColumns.filter(key => key !== columnKey);
    
    setVisibleColumns(newVisibleColumns);
    onColumnSettingsChange?.(newVisibleColumns);
  }, [visibleColumns, onColumnSettingsChange]);
  
  // スクロール制御のためのeffect
  useEffect(() => {
    if (isColumnSettingsOpen) {
      // スクロールを無効化
      document.body.style.overflow = 'hidden';
    } else {
      // スクロールを有効化
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      // クリーンアップ時にスクロールを有効化
      document.body.style.overflow = 'unset';
    };
  }, [isColumnSettingsOpen]);
  
  return {
    isColumnSettingsOpen,
    setIsColumnSettingsOpen,
    visibleColumns,
    columnSettingsButtonRef,
    handleColumnVisibilityChange
  };
} 