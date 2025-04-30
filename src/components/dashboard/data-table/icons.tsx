// src/components/dashboard/data-table/icons.tsx
import { TIKTOK_COLORS } from '@/lib/constants';

export const VideoTypeIcon = ({ size = 32 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 80 80" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="40" cy="40" r="35" fill={TIKTOK_COLORS.black} />
    <path d="M40 75C59.33 75 75 59.33 75 40C75 20.67 59.33 5 40 5" stroke={TIKTOK_COLORS.cyan} strokeWidth="10" />
    <path d="M40 5C20.67 5 5 20.67 5 40C5 59.33 20.67 75 40 75" stroke={TIKTOK_COLORS.white} strokeWidth="3" />
    <circle cx="40" cy="40" r="18" fill={TIKTOK_COLORS.red} />
    <path d="M48 40L36 48V32L48 40Z" fill={TIKTOK_COLORS.white} />
  </svg>
);

export const PhotoTypeIcon = ({ size = 32 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 80 80" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="15" y="15" width="50" height="50" rx="4" fill={TIKTOK_COLORS.black} />
    <rect x="15" y="15" width="50" height="50" rx="4" stroke={TIKTOK_COLORS.cyan} strokeWidth="3" fill="none" />
    <rect x="20" y="20" width="40" height="40" rx="2" fill={TIKTOK_COLORS.white} />
    <path d="M20 50L30 40L40 50L50 35L60 50V60H20V50Z" fill={TIKTOK_COLORS.red} />
    <circle cx="50" cy="30" r="5" fill={TIKTOK_COLORS.red} />
  </svg>
);

// ハートアイコンを追加
export const HeartIcon = ({ size = 16 }: { size?: number }) => (
 <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={TIKTOK_COLORS.red} 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
 </svg>
);
  
  // コメントアイコン（アウトライン）を追加
export const CommentIcon = ({ size = 16 }: { size?: number }) => (
 <svg 
     width={size} 
     height={size} 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke={TIKTOK_COLORS.cyan} 
     strokeWidth="2" 
     strokeLinecap="round" 
     strokeLinejoin="round"
 >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
 </svg>
);
  
  // 保存アイコンを追加
export const SaveIcon = ({ size = 16 }: { size?: number }) => (
 <svg 
     width={size} 
     height={size} 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke="#F59E0B"
     strokeWidth="2.5"
     strokeLinecap="round" 
     strokeLinejoin="round"
     className="drop-shadow-sm"
 >
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
 </svg>
);
  
  // 上矢印アイコンを追加
export const UpArrowIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
 <svg 
     width={size} 
     height={size} 
     viewBox="0 0 24 24" 
     fill="none" 
     stroke={TIKTOK_COLORS.green} 
     strokeWidth="2" 
     strokeLinecap="round" 
     strokeLinejoin="round"
     className={className}
 >
    <path d="M12 19V5M5 12L12 5l7 7"/>
 </svg>
);
// フィルターアイコンを追加
export const FilterIcon = ({ size = 20 }: { size?: number }) => (
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
  
// 八分音符アイコンを追加
export const MusicNoteIcon = ({ size = 16 }: { size?: number }) => (
 <svg 
     width={size} 
     height={size} 
     viewBox="0 0 24 24" 
     fill="currentColor"
     className="text-gray-600"
    >
    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
 </svg>
);
export const SettingsIcon = ({ size = 20 }: SettingsIconProps) => (
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
     <circle cx="12" cy="12" r="3" />
     <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
 </svg>
); 

export const NoThumbnail = () => (
    <div className="w-[160px] h-[90px] relative bg-gray-100 rounded flex items-center justify-center">
      <svg 
        className="w-8 h-8 text-gray-400" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M10 8l6 4-6 4V8z" />
      </svg>
    </div>
  );