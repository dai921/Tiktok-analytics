// src/components/dashboard/data-table/SortableHeaderCell.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column } from '@/types/dashboard';

export const SortableHeaderCell = ({ column, index }: { column: Column; index: number }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: column.accessorKey
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
    cursor: 'move'
  };

  // 数値カラムかどうかを判定する関数
  const isNumericColumn = (key: string): boolean => {
    return ['views', 'likes', 'comments', 'viewsIncrease', 'ten_days_increase', 'likes_count_increase', 'ten_days_likes_increase', 'comment_count_increase', 'ten_days_comment_increase', 'createdAt', 'save_count', 'save_count_increase', 'ten_days_save_increase'].includes(String(key));
  };

  

  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`px-1 py-2 font-medium text-xs text-gray-700 bg-gray-50 sticky top-0 ${isNumericColumn(String(column.accessorKey)) ? 'text-right' : ''}`}
      data-sort-column={column.accessorKey}
    >
      <div className="w-full h-full cursor-move">
        {/* column.header関数をそのまま呼び出す */}
        {column.header({ column })}
      </div>
    </th>
  );
};