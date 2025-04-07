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
  Settings,
  Eye,
  LogOut
} from 'lucide-react';

type IconName = 'LayoutDashboard' | 'LineChart' | 'Eye' | 'Settings' | 'LogOut';

type SidebarItemProps = {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  
  return (
    <aside className="w-64 h-screen bg-black border-r border-gray-800 flex flex-col">
      <div className="p-4">
        <Logo className="w-full max-w-[200px]" variant="sidebar" />
      </div>
      
      <nav className="mt-8 flex-1">
        <SidebarItem
          href="/dashboard"
          icon="LayoutDashboard"
          label="ダッシュボード"
          active={pathname === '/dashboard'}
        />
        <SidebarItem
          href="/trends"
          icon="LineChart"
          label="PR動画トレンド"
          active={pathname === '/trends' || pathname.startsWith('/trends/')}
        />
        <SidebarItem
          href="/watchlist"
          icon="Eye"
          label="ウォッチリスト"
          active={pathname === '/watchlist'}
        />
      </nav>

      <div className="border-t border-gray-800 pt-4 pb-4">
        <SidebarItem
          href="/settings"
          icon="Settings"
          label="設定"
          active={pathname === '/settings'}
        />
        <SidebarItem
          href="/logout"
          icon="LogOut"
          label="ログアウト"
          active={false}
        />
      </div>
    </aside>
  );
}

function SidebarItem({ href, icon, label, active }: SidebarItemProps) {
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center px-4 py-2 my-1 mx-2 rounded-md transition-colors",
          active 
            ? "bg-[#FE2C55] text-white font-medium" 
            : "text-gray-200 hover:bg-gray-800"
        )}
      >
        <span className="mr-3">{renderIcon(icon)}</span>
        <span>{label}</span>
      </div>
    </Link>
  );
}

// アイコン名からコンポーネントを返す関数
function renderIcon(iconName: IconName) {
  switch (iconName) {
    case 'LayoutDashboard':
      return <LayoutDashboard size={20} />;
    case 'LineChart':
      return <LineChart size={20} />;
    case 'Eye':
      return <Eye size={20} />;
    case 'Settings':
      return <Settings size={20} />;
    case 'LogOut':
      return <LogOut size={20} />;
    default:
      return null;
  }
}
