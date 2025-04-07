'use client'

import { Sidebar } from '@/components/sidebar/sidebar';
import { Header } from '@/components/header';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { FilterProvider } from '@/lib/filter-context';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  // フィルター関連の状態は子コンポーネントから受け取る
  let headerProps = {};
  if (isDashboard) {
    headerProps = {
      showFilterClear: true
    };
  }

  return (
    <FilterProvider>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header {...headerProps} />
          <main className="flex-1 p-4 overflow-auto">{children}</main>
        </div>
      </div>
    </FilterProvider>
  );
}
