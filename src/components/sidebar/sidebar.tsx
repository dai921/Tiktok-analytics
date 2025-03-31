'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Logo } from "@/components/ui/logo";

// アイコンをインポート
import { 
  LayoutDashboard, 
  LineChart, 
  Menu, 
  Settings 
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  
  return (
    <aside className="w-64 h-screen bg-gray-50 border-r">
      <div className="p-4">
        <Logo className="w-48" />
      </div>
      
      <nav className="mt-8">
        <SidebarItem
          href="/dashboard"
          icon="LayoutDashboard"
          label="ダッシュボード"
          active={pathname === '/dashboard'}
        />
        <SidebarItem
          href="/trends"
          icon="LineChart"
          label="トレンド分析"
          active={pathname === '/trends' || pathname.startsWith('/trends/')}
        />
        {/* その他のメニュー項目 */}
      </nav>
    </aside>
  );
}

function SidebarItem({ href, icon, label, active }) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center px-4 py-2 my-1 mx-2 rounded-md transition-colors",
          active 
            ? "bg-primary/10 text-primary font-medium" 
            : "text-gray-600 hover:bg-gray-100"
        )}
      >
        <span className="mr-3">{renderIcon(icon)}</span>
        <span>{label}</span>
      </div>
    </Link>
  );
}

// アイコン名からコンポーネントを返す関数
function renderIcon(iconName) {
  switch (iconName) {
    case 'LayoutDashboard':
      return <LayoutDashboard size={20} />;
    case 'LineChart':
      return <LineChart size={20} />;
    case 'Menu':
      return <Menu size={20} />;
    case 'Settings':
      return <Settings size={20} />;
    default:
      return null;
  }
}
