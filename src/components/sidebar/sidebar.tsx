'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Logo } from "@/components/ui/logo";
import { useAuth } from '@/lib/auth-context';
import { useState, useEffect } from 'react';

// アイコンをインポート
import { 
  LayoutDashboard, 
  LineChart, 
  Menu, 
  Eye,
  LogOut,
  FileText,
  Users,
  ChevronDown,
  X,
  Mic,
  TrendingUp,
  Music,
  Shield
} from 'lucide-react';

type IconName = 'LayoutDashboard' | 'LineChart' | 'Eye' | 'Shield' | 'LogOut' | 'FileText' | 'Users' | 'Mic' | 'TrendingUp' | 'Music';

type SidebarItemProps = {
  href?: string;
  icon: IconName;
  label: string;
  active: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  showSubmenu?: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const { logout, isAdmin } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isTrendsOpen, setIsTrendsOpen] = useState(false);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [, setIsAdminMenuOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // 画面幅を監視するステート
  const [isMobile, setIsMobile] = useState(false);
  
  // 画面幅の変更を検知
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768); // 768px未満をモバイルとみなす
    };
    
    checkScreenSize(); // 初期チェック
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        logout();
      } else {
        console.error('ログアウトに失敗しました');
        setIsLoggingOut(false);
      }
    } catch (error) {
      console.error('ログアウトエラー:', error);
      setIsLoggingOut(false);
    }
  };
  
  const [isOverallTrendsOpen, setIsOverallTrendsOpen] = useState(false);

  return (
    <>
      {/* モバイル用メニューボタン */}
      <button 
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-white text-black p-2 rounded-md shadow-lg hover:bg-gray-100 transition-colors"
      >
        {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      
      {/* サイドバー */}
      <aside className={cn(
        "bg-black border-r border-gray-800 flex flex-col",
        "fixed md:static z-40 h-screen transition-all duration-300",
        "w-64 flex-shrink-0",
        isMobile 
          ? isMobileOpen ? "left-0" : "-left-64" 
          : ""
      )}>
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
          <div 
            className="relative group"
            onMouseEnter={() => setIsTrendsOpen(true)}
            onMouseLeave={() => setIsTrendsOpen(false)}
          >
            <SidebarItem
              icon="LineChart"
              label="PR動画トレンド"
              active={pathname.startsWith('/trends')}
            />
            <div 
              className="absolute left-full top-0 ml-0 bg-[#1a1a1a] rounded-md border border-gray-800 min-w-[160px] shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
            >
              <Link href="/trends/product">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-md">
                  商材トレンド
                </div>
              </Link>
              <Link href="/trends/genre">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-b-md">
                  ジャンルトレンド
                </div>
              </Link>
            </div>
          </div>
          <div 
            className="relative group"
            onMouseEnter={() => setIsOverallTrendsOpen(true)}
            onMouseLeave={() => setIsOverallTrendsOpen(false)}
          >
            <SidebarItem
              icon="Music"
              label="BGM・ハッシュタグトレンド"
              active={pathname.startsWith('/overall-trends')}
            />
            <div 
              className="absolute left-full top-0 ml-0 bg-[#1a1a1a] rounded-md border border-gray-800 min-w-[180px] shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
            >
              <Link href="/overall-trends/sounds">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-b-md">
                  BGMトレンド
                </div>
              </Link>
              <Link href="/overall-trends/hashtags">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-md">
                  ハッシュタグトレンド
                </div>
              </Link>
            </div>
          </div>
          <SidebarItem
            href="/corporate"
            icon="Users"
            label="業界別トレンド"
            active={pathname.startsWith('/corporate')}
          />
          <div 
            className="relative group"
            onMouseEnter={() => setIsWatchlistOpen(true)}
            onMouseLeave={() => setIsWatchlistOpen(false)}
          >
            <SidebarItem
              icon="Eye"
              label="ウォッチリスト"
              active={pathname.startsWith('/watchlist')}
            />
            <div 
              className="absolute left-full top-0 ml-0 bg-[#1a1a1a] rounded-md border border-gray-800 min-w-[200px] shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
            >
              <Link href="/watchlist/videos">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-md">
                  動画ウォッチリスト
                </div>
              </Link>
              <Link href="/watchlist/accounts">
                <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-b-md">
                  アカウントウォッチリスト
                </div>
              </Link>
            </div>
          </div>
          {/* <SidebarItem
            href="/my-report"
            icon="Users"
            label="自アカウント分析"
            active={pathname.startsWith('/my-report')}
          /> */}
          <SidebarItem
            href="/transcription"
            icon="Mic"
            label="動画文字起こし"
            active={pathname.startsWith('/transcription')}
          />
          <SidebarItem
            href="#"
            icon="FileText"
            label="台本作成"
            active={false}
            disabled={true}
            comingSoon={true}
          />
        </nav>

        {isAdmin && (
          <div className="px-2 pb-2">
            <div 
              className="relative group"
              onMouseEnter={() => setIsAdminMenuOpen(true)}
              onMouseLeave={() => setIsAdminMenuOpen(false)}
            >
              <SidebarItem
                icon="Shield"
                label="管理画面"
                active={pathname.startsWith('/admin')}
              />
              <div 
                className="absolute left-full top-0 ml-0 bg-[#1a1a1a] rounded-md border border-gray-800 min-w-[200px] shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200"
              >
                <Link href="/admin/notifications">
                  <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-t-md">
                    通知設定
                  </div>
                </Link>
                <Link href="/admin/pr-products">
                  <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors">
                    PR未判定
                  </div>
                </Link>
                <Link href="/admin/feature-roadmap">
                  <div className="px-4 py-2 text-gray-200 hover:bg-[#2a2a2a] transition-colors rounded-b-md">
                    追加機能予定
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="px-4 pb-2">
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSdO_WCDxWCJfDlZMURIxVaH_X4B8iVRuBVYTYyfX26vJrRL_A/viewform"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-black text-white font-medium py-2 rounded-md hover:bg-gray-900 transition-colors text-xs border border-white"
          >
            アカウント追加の依頼はこちらから
          </a>
        </div>

        <div className="border-t border-gray-800 pt-4 pb-4">
          <SidebarItem
            href="#"
            icon="LogOut"
            label={isLoggingOut ? "ログアウト中..." : "ログアウト"}
            active={false}
            onClick={handleLogout}
            disabled={isLoggingOut}
          />
        </div>
      </aside>
      
      {/* オーバーレイ（モバイル時サイドバー表示中） */}
      {isMobileOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}

function SidebarItem({ 
  href, 
  icon, 
  label, 
  active, 
  disabled, 
  comingSoon, 
  onClick,
  onMouseEnter,
  onMouseLeave,
  showSubmenu 
}: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        "flex items-center px-4 py-2 my-1 mx-2 rounded-md transition-colors relative",
        active 
          ? "bg-[#FE2C55] text-white font-medium" 
          : disabled
            ? "text-gray-500 cursor-not-allowed"
            : "text-gray-200 hover:bg-gray-800",
        onClick && !disabled && "cursor-pointer",
        !href && !onClick && "cursor-default"
      )}
      onClick={!disabled ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="mr-3">{renderIcon(icon)}</span>
      <span>{label}</span>
      {comingSoon && (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 -rotate-12">
          <span className="text-[10px] px-2 py-0.5 rounded-full 
            bg-gradient-to-r from-[#FE2C55]/80 to-[#00F7FF]/80 
            font-medium tracking-wide
            inline-block">
            COMING SOON
          </span>
        </div>
      )}
    </div>
  );

  if (disabled || !href) {
    return content;
  }

  return onClick ? content : <Link href={href}>{content}</Link>;
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
    case 'LogOut':
      return <LogOut size={20} />;
    case 'FileText':
      return <FileText size={20} />;
    case 'Users':
      return <Users size={20} />;
    case 'Mic':
      return <Mic size={20} />;
    case 'TrendingUp':
      return <TrendingUp size={20} />;
    case 'Music':
      return <Music size={20} />;
    case 'Shield':
      return <Shield size={20} />;
    default:
      return null;
  }
}
