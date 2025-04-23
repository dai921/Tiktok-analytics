'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DataTable } from "@/components/ui/trend-data-table";
import type { DateRange } from "react-day-picker";
import type { ColumnDef } from "@tanstack/react-table";
import { Info } from "lucide-react";
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { fetchTrendGenres } from '@/lib/api';

interface ProductTrend {
  id: string;
  name: string;
  viewsIncrease: number;
  over100kViews: number;
  postCount: number;
  [key: string]: string | number;
}

interface RelatedVideo {
  id: string;
  thumbnail: string;
  title: string;
  accountName: string;
  views: number;
  likes: number;
  comments: number;
}

interface TableRow {
  getValue: (key: string) => any;
}

// 指標の表示名を取得する関数
const getMetricLabel = (metricKey: string) => {
  const labels: Record<string, string> = {
    viewsIncrease: '再生増加数',
    over100kViews: '10万再生以上個数',
    postCount: '投稿数',
  };
  return labels[metricKey] || metricKey;
};

export default function ProductTrendsPage() {
  const [activeTab, setActiveTab] = useState("ranking");
  const [dateRange, setDateRange] = useState<DateRange>();
  const [metric, setMetric] = useState<string>('viewsIncrease');
  const [productData, setProductData] = useState<ProductTrend[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableGenres, setAvailableGenres] = useState<Option[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ジャンルデータを取得するuseEffectを追加
  useEffect(() => {
    const loadGenres = async () => {
      try {
        setIsLoading(true);
        const genresResponse = await fetchTrendGenres();
        
        if (genresResponse.success) {
          // ジャンルをOption形式に変換
          const genreOptions = genresResponse.data.map(genre => ({
            value: genre,
            label: genre
          }));
          
          setAvailableGenres(genreOptions);
          
          // デフォルトですべてのジャンルを選択
          if (genreOptions.length > 0) {
            const initialSelected = genreOptions.map(option => option.value);
            setSelectedGenres(initialSelected);
          }
        } else {
          setError('ジャンルデータの取得に失敗しました');
        }
      } catch (error) {
        console.error("ジャンルデータの読み込みに失敗しました", error);
        setError('ジャンルデータの読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadGenres();
  }, []);

  // 商材ランキングのカラム定義を修正
  const productColumns: ColumnDef<ProductTrend>[] = [
    {
      accessorKey: 'rank',
      header: '順位',
      size: 80,
    },
    {
      accessorKey: 'name',
      header: '商材名',
      size: 200,
    },
    {
      id: 'metricValue',
      accessorFn: (row) => row[metric],
      header: getMetricLabel(metric),
      cell: ({ row }: { row: TableRow }) => formatNumber(row.getValue('metricValue')),
      size: 120,
    },
  ];

  // 関連動画のカラム定義
  const videoColumns: ColumnDef<RelatedVideo>[] = [
    {
      accessorKey: 'thumbnail',
      header: 'サムネイル',
      cell: ({ row }: { row: TableRow }) => (
        <img 
          src={row.getValue('thumbnail')} 
          alt={row.getValue('title')} 
          className="w-16 h-16 object-cover rounded"
        />
      ),
    },
    {
      accessorKey: 'title',
      header: 'タイトル',
      enableSorting: true,
    },
    {
      accessorKey: 'accountName',
      header: 'アカウント名',
      enableSorting: true,
    },
    {
      accessorKey: 'views',
      header: '再生数',
      enableSorting: true,
      cell: ({ row }: { row: TableRow }) => formatNumber(row.getValue('views')),
    },
    {
      accessorKey: 'likes',
      header: 'いいね数',
      enableSorting: true,
      cell: ({ row }: { row: TableRow }) => formatNumber(row.getValue('likes')),
    },
  ];

  // 数値フォーマット用ヘルパー関数
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ja-JP').format(num);
  };

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
  };

  const handleProductClick = (productId: string) => {
    setSelectedProduct(productId);
    // ここで関連動画を取得するAPIを呼び出す
  };

  return (
    <div className="container mx-auto p-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold whitespace-nowrap">商材トレンド分析</h1>
        <div className="w-[280px]">
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            displayMode
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking">商材ランキング</TabsTrigger>
          <TabsTrigger value="graph">トレンドグラフ</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* 左側: 商材ランキング（2カラム分） */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-col space-y-4 pb-2">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle>商材ランキング</CardTitle>
                  <div className="flex items-center gap-2">
                    {/* 指標選択タブ */}
                    <div className="flex rounded-md border bg-muted/50">
                      <button
                        className={`px-3 py-1 text-sm transition-colors ${
                          metric === 'viewsIncrease' ? 'bg-primary text-primary-foreground' : ''
                        }`}
                        onClick={() => setMetric('viewsIncrease')}
                      >
                        再生増加数
                      </button>
                      <button
                        className={`px-3 py-1 text-sm transition-colors ${
                          metric === 'over100kViews' ? 'bg-primary text-primary-foreground' : ''
                        }`}
                        onClick={() => setMetric('over100kViews')}
                      >
                        10万再生以上
                      </button>
                      <button
                        className={`px-3 py-1 text-sm transition-colors ${
                          metric === 'postCount' ? 'bg-primary text-primary-foreground' : ''
                        }`}
                        onClick={() => setMetric('postCount')}
                      >
                        投稿数
                      </button>
                    </div>
                  </div>
                </div>
                <div className="w-full">
                  <MultiSelect 
                    options={availableGenres}
                    selected={selectedGenres}
                    onChange={(newSelected) => setSelectedGenres(newSelected)}
                    placeholder={isLoading ? "ジャンルを取得中..." : "ジャンルで絞り込み"}
                    emptyMessage={error ? "ジャンルが見つかりません" : "ジャンルを取得中..."}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={productColumns}
                  data={productData}
                  onRowClick={(row) => handleProductClick(row.id)}
                />
              </CardContent>
            </Card>

            {/* 右側: 関連動画ランキング（3カラム分） */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>関連動画ランキング TOP10</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedProduct ? (
                  <DataTable
                    columns={videoColumns}
                    data={relatedVideos}
                    searchColumn="title"
                    searchPlaceholder="動画タイトルで検索..."
                  />
                ) : (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground bg-muted/50 rounded-lg">
                    <Info className="h-4 w-4" />
                    <p>
                      左の商材ランキングから商材名をクリックすると、関連する動画のランキングが表示されます。
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="graph">
          <Card>
            <CardHeader>
              <CardTitle>トレンドグラフ</CardTitle>
            </CardHeader>
            <CardContent>
              {/* ここにトレンドグラフを実装 */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 