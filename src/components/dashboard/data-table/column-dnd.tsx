import { useState, useEffect, useCallback, useRef } from 'react';
import type { Column } from '@/types/dashboard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable';

interface ColumnDndProps {
  children: React.ReactNode;
}

export function useColumnDnd(initialColumns: Column[]) {
  const [orderedColumns, setOrderedColumns] = useState<Column[]>([]);
  
  // 参照変化をチェックするための ref
  const prevColumnsRef = useRef<Column[] | null>(null);
  
  // 初期化時とカラムのコンテンツが変更された場合のみ更新
  // 深い等価性を使用して、列の内容が実際に変更されているかどうかを確認
  useEffect(() => {
    // columnsの参照が変わったかどうかをチェック
    const hasColumnsReferenceChanged = prevColumnsRef.current !== initialColumns;
    
    // 初回のみ、または列のコンテンツが変更された場合のみ更新
    const isFirstRender = prevColumnsRef.current === null;

    // 深い等価性チェック - 列の内容が実際に変更されたかどうかを確認
    let hasColumnsContentChanged = false;
    
    if (!isFirstRender && hasColumnsReferenceChanged) {
      // 参照は変わっているが、中身が同じかどうかを調べる
      hasColumnsContentChanged = 
        prevColumnsRef.current?.length !== initialColumns.length ||
        initialColumns.some((col, index) => {
          const prevCol = prevColumnsRef.current?.[index];
          return prevCol?.accessorKey !== col.accessorKey;
        });
    }
    
    // 初回呼び出し時、または実際に列のコンテンツが変更された場合のみ更新
    if (isFirstRender || hasColumnsContentChanged) {
      setOrderedColumns(initialColumns);
    }
    
    // 次回の比較のために現在の値を保存
    prevColumnsRef.current = initialColumns;
  }, [initialColumns]);
  
  // センサーの設定
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ドラッグ終了時のハンドラー
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    setOrderedColumns((items) => {
      const oldIndex = items.findIndex((item) => item.accessorKey === active.id);
      const newIndex = items.findIndex((item) => item.accessorKey === over.id);
      
      return arrayMove(items, oldIndex, newIndex);
    });
  }, []);
  
  // DnDコンテキストを提供するコンポーネント
  const DndContextProvider = ({ children }: ColumnDndProps) => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {children}
    </DndContext>
  );
  
  // SortableContextを提供するコンポーネント
  const SortableContextProvider = ({ children }: ColumnDndProps) => (
    <SortableContext
      items={orderedColumns.map(col => col.accessorKey)}
      strategy={horizontalListSortingStrategy}
    >
      {children}
    </SortableContext>
  );
  
  return {
    orderedColumns,
    setOrderedColumns,
    DndContextProvider,
    SortableContextProvider
  };
} 