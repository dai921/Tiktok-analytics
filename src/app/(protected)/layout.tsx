'use client'

import { Sidebar } from '@/components/sidebar/sidebar';
import { Header } from '@/components/header';
import { ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { FilterProvider } from '@/lib/filter-context';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';
  const mainRef = useRef<HTMLDivElement | null>(null);

  // フィルター関連の状態は子コンポーネントから受け取る
  let headerProps = {};
  if (isDashboard) {
    headerProps = {
      showFilterClear: true
    };
  }

  useEffect(() => {
    // ページ遷移時にスクロール位置をリセットしてヘッダーUIを見失わないようにする
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <FilterProvider>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header {...headerProps} />
          <main ref={mainRef} className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </FilterProvider>
  );
}
