'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function TrendTabs() {
  const router = useRouter();
  const pathname = usePathname();
  
  const isTimelinePage = pathname === '/trends';
  const isSummaryPage = pathname === '/trends/summary';
  
  const handleTabChange = (value: string) => {
    router.push(value);
  };
  
  return (
    <Tabs 
      defaultValue={isTimelinePage ? '/trends' : '/trends/summary'} 
      className="w-full mb-6"
      onValueChange={handleTabChange}
    >
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="/trends">トレンドグラフ</TabsTrigger>
        <TabsTrigger value="/trends/summary">トレンド数値データ</TabsTrigger>
      </TabsList>
    </Tabs>
  );
} 