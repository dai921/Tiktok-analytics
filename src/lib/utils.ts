import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // ISO形式でない場合（例：'24/02/15'）の処理
    const [year, month, day] = dateStr.split('/');
    return `20${year}/${month}/${day}`;
  }
  
  return date.toLocaleDateString('ja-JP', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit'
  });
};
