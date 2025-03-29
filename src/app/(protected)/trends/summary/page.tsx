'use client';

import React, { useEffect, useState, useRef } from "react";
import { DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchTrendDates, fetchTrendSummary } from "@/lib/api";
import { DataTable } from "@/components/ui/trend-data-table";
import { DownloadIcon } from "lucide-react";
import { TrendTabs } from '@/components/ui/trend-tabs';

// サマリーデータの型定義
interface TrendSummaryItem {
  genre: string;
  total_view_increase: number;
  total_videos_100k_plus: number;
  total_posts: number;
  ratio_10k_plus: number;
  ratio_100k_plus: number;
}

export default function TrendsSummaryPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  });
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [summaryData, setSummaryData] = useState<TrendSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingTable, setIsLoadingTable] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // キャッシュを保持する
  const dataCache = useRef<Record<string, TrendSummaryItem[]>>({});

  // テーブルの列定義
  const columns = [
    {
      accessorKey: "genre",
      header: "ジャンル",
      enableSorting: false,
    },
    {
      accessorKey: "total_view_increase",
      header: "合計再生増加数",
      cell: ({ row }: { row: any }) => formatNumber(row.getValue("total_view_increase")),
      enableSorting: true,
    },
    {
      accessorKey: "total_videos_100k_plus",
      header: "10万再生増加個数",
      cell: ({ row }: { row: any }) => formatNumber(row.getValue("total_videos_100k_plus")),
      enableSorting: true,
    },
    {
      accessorKey: "total_posts",
      header: "対象動画数",
      cell: ({ row }: { row: any }) => formatNumber(row.getValue("total_posts")),
      enableSorting: true,
    },
    {
      accessorKey: "ratio_100k_plus",
      header: "10万再生増加割合",
      cell: ({ row }: { row: any }) => formatPercent(row.getValue("ratio_100k_plus")),
      enableSorting: true,
    },
    {
      accessorKey: "ratio_10k_plus",
      header: "1万再生増加割合",
      cell: ({ row }: { row: any }) => formatPercent(row.getValue("ratio_10k_plus")),
      enableSorting: true,
    },
  ];

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('初期データ読み込み開始');
        
        // 利用可能な日付を取得
        const datesResponse = await fetchTrendDates();
        
        if (datesResponse.success && datesResponse.data.length > 0) {
          setAvailableDates(datesResponse.data);
          
          // デフォルトの日付範囲を設定（直近7回まで）
          const dates = datesResponse.data.map(dateStr => new Date(dateStr));
          dates.sort((a, b) => a.getTime() - b.getTime());
          
          if (dates.length >= 2) {
            // 直近の最大7件の日付に制限
            const recentDates = dates.length <= 7 ? dates : dates.slice(-7);
            
            setDateRange({
              from: recentDates[0],
              to: recentDates[recentDates.length - 1]
            });
          }
        } else {
          console.error('日付データの取得に失敗:', datesResponse.error);
          setError('日付データの取得に失敗しました');
        }
      } catch (error) {
        console.error("初期データの読み込みに失敗しました", error);
        setError('データの読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadInitialData();
  }, []);

  useEffect(() => {
    // 日付範囲が選択されていれば、サマリーデータを取得
    const fetchSummaryData = async () => {
      if (!dateRange.from || !dateRange.to) {
        setSummaryData([]);
        return;
      }

      try {
        setIsLoadingTable(true);
        setError(null);
        
        // キャッシュキーを作成
        const startDate = dateRange.from.toISOString().split('T')[0];
        const endDate = dateRange.to.toISOString().split('T')[0];
        const cacheKey = `${startDate}-${endDate}`;
        
        // キャッシュにデータがあればそれを使用
        if (dataCache.current[cacheKey]) {
          console.log('キャッシュからデータを取得');
          setSummaryData(dataCache.current[cacheKey]);
          setIsLoadingTable(false);
          return;
        }
        
        const params = {
          start_date: startDate,
          end_date: endDate
        };
        
        const response = await fetchTrendSummary(params);
        
        if (response.success) {
          // キャッシュに保存
          dataCache.current[cacheKey] = response.data;
          setSummaryData(response.data);
        } else {
          console.error('サマリーデータの取得に失敗:', response.error);
          setError('データの取得に失敗しました');
          setSummaryData([]);
        }
      } catch (error) {
        console.error('サマリーデータの取得中にエラーが発生しました:', error);
        setError('データの取得中にエラーが発生しました');
        setSummaryData([]);
      } finally {
        setIsLoadingTable(false);
      }
    };
    
    fetchSummaryData();
  }, [dateRange]);

  const handleDateRangeChange = (newRange: DateRange) => {
    setDateRange(newRange);
  };

  // 数値フォーマット関数
  const formatNumber = (value: number, fractionDigits: number = 0) => {
    if (value === undefined || value === null) return '-';
    return value.toLocaleString('ja-JP', { maximumFractionDigits: fractionDigits });
  };

  // パーセント表示用フォーマット関数を追加
  const formatPercent = (value: number) => {
    if (value === undefined || value === null) return '-';
    return `${(value * 100).toFixed(1)}%`;
  };

  // CSVダウンロード処理
  const handleDownloadCSV = () => {
    if (summaryData.length === 0) return;
    
    // CSVヘッダー
    const headers = [
      'ジャンル',
      '合計再生増加数',
      '10万再生増加個数',
      '対象動画数',
      '10万再生増加割合',
      '1万再生増加割合'
    ];
    
    // CSVデータ作成
    const csvContent = [
      headers.join(','),
      ...summaryData.map(item => [
        `"${item.genre}"`,
        item.total_view_increase,
        item.total_videos_100k_plus,
        item.total_posts,
        (item.ratio_100k_plus * 100).toFixed(1),
        (item.ratio_10k_plus * 100).toFixed(1)
      ].join(','))
    ].join('\n');
    
    // BOMを追加してExcelで文字化けしないようにする
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // ダウンロードリンク作成
    const link = document.createElement('a');
    const startDate = dateRange.from ? dateRange.from.toISOString().split('T')[0] : '';
    const endDate = dateRange.to ? dateRange.to.toISOString().split('T')[0] : '';
    link.href = URL.createObjectURL(blob);
    link.download = `trend-summary_${startDate}_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (isLoading) {
    return <div className="p-6">データを読み込み中...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">トレンドサマリー</h1>
      
      <TrendTabs />
      
      <div className="mb-6">
        <label className="text-sm font-medium mb-2 block">期間選択</label>
        <div className="flex gap-4">
          <DateRangePicker 
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            availableDates={availableDates}
          />
          
          <Button
            variant="outline"
            onClick={handleDownloadCSV}
            disabled={isLoadingTable || summaryData.length === 0}
          >
            <DownloadIcon className="mr-2 h-4 w-4" />
            CSV出力
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
          <p>{error}</p>
        </div>
      )}
      
      <Card className="p-4">
        {isLoadingTable ? (
          <div className="flex items-center justify-center h-[400px]">
            <p>データを読み込み中...</p>
          </div>
        ) : summaryData.length > 0 ? (
          <>
            <h2 className="text-xl font-medium mb-4">ジャンル別サマリー</h2>
            <DataTable 
              columns={columns} 
              data={summaryData} 
              searchPlaceholder="ジャンルで検索"
              searchColumn="genre"
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-[400px]">
            <p className="text-muted-foreground">
              {!dateRange.from || !dateRange.to
                ? '期間を選択してください'
                : 'データがありません'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
