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

  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="px-2 py-2 font-medium text-xs text-gray-700 bg-gray-50 sticky top-0"
    >
      <div className="w-full h-full cursor-move">
        {column.header({ column })}
      </div>
    </th>
  );
};