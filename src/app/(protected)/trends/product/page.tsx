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
import { ProductStats } from '@/types/product';
import { fetchProductStats } from '@/lib/api/product';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductTrend {
  rank: number;
  name: string;
  viewsIncrease: number;
  over100kViews: number;
  postCount: number;
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

type MetricKey = 'viewsIncrease' | 'over100kViews' | 'postCount';

// 指標の表示名を取得する関数
const getMetricLabel = (metricKey: string) => {
  const labels: Record<string, string> = {
    viewsIncrease: '再生増加数',
    over100kViews: '10万再生以上個数',
    postCount: '投稿数',
  };
  return labels[metricKey] || metricKey;
};

export default function ProductPage() {
  const [activeTab, setActiveTab] = useState("ranking");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date(),
  });
  const [metric, setMetric] = useState<MetricKey>('viewsIncrease');
  const [productData, setProductData] = useState<ProductTrend[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableGenres, setAvailableGenres] = useState<Option[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);

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

  useEffect(() => {
    const loadProductStats = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const stats = await fetchProductStats(
          dateRange.start.toISOString().split('T')[0],
          dateRange.end.toISOString().split('T')[0]
        );
        console.log('productStats:', stats);
        setProductStats(stats);
      } catch (err) {
        setError('商品統計情報の取得に失敗しました');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProductStats();
  }, [dateRange]);

  const getProductColumns = (metric: MetricKey): ColumnDef<ProductTrend>[] => [
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
      accessorKey: metric,
      header: getMetricLabel(metric),
      cell: ({ row }) => formatNumber(row.getValue(metric)),
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

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setDateRange(newRange);
  };

  const handleProductClick = (productId: string) => {
    setSelectedProduct(productId);
    // ここで関連動画を取得するAPIを呼び出す
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-8 w-[200px] mb-4" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-[200px]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">PR動画トレンド</h1>

      <div className="space-y-4">
        {/* フィルターエリア */}
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">表示指標:</label>
            <select 
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricKey)}
              className="border rounded p-1"
            >
              <option value="viewsIncrease">総再生増加数</option>
              <option value="over100kViews">10万再生以上個数</option>
              <option value="postCount">投稿数</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">ジャンルフィルタ:</label>
            <select 
              className="border rounded p-1"
            >
              <option value="all">すべてのジャンル</option>
              {availableGenres.map(genre => (
                <option key={genre.value} value={genre.value}>
                  {genre.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[280px]">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          </div>
        </div>

        {/* タブエリア */}
        <Tabs defaultValue="ranking" className="w-full">
          <TabsList>
            <TabsTrigger value="ranking">ランキング</TabsTrigger>
            <TabsTrigger value="graph">トレンドグラフ</TabsTrigger>
            <TabsTrigger value="data">数値データ</TabsTrigger>
          </TabsList>

          <TabsContent value="ranking">
            <div className="flex gap-6">
              {/* 左側: ランキングテーブル */}
              <div className="w-1/2">
                <Card>
                  <CardHeader>
                    <CardTitle>商材トレンド</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={getProductColumns(metric)}
                      data={productStats
                        .filter(stat => stat.product && stat.product.trim() !== '')
                        .map((stat, index) => ({
                          rank: index + 1,
                          name: stat.product,
                          viewsIncrease: Number(stat.total_play_count_increase) || 0,
                          over100kViews: Number(stat.videos_over_100k) || 0,
                          postCount: Number(stat.total_posts) || 0
                        }))}
                      onRowClick={(row) => setSelectedProduct(row.name)}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* 右側: 関連動画 */}
              <div className="w-1/2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedProduct ? `${selectedProduct}の関連動画` : '関連動画'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedProduct ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>アカウント</TableHead>
                            <TableHead>再生増加数</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {productStats
                            .find(stat => stat.product === selectedProduct)
                            ?.top_videos.map((video) => (
                              <TableRow key={video.url}>
                                <TableCell>{video.account_name}</TableCell>
                                <TableCell>
                                  {formatNumber(video.play_count_increase)}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        商材を選択すると、関連動画が表示されます
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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

          <TabsContent value="data">
            <Card>
              <CardHeader>
                <CardTitle>数値データ</CardTitle>
              </CardHeader>
              <CardContent>
                {/* ここに数値データを実装 */}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 