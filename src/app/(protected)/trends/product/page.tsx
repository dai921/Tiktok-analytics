'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DataTable } from "@/components/ui/trend-data-table";
import type { DateRange } from "react-day-picker";
import type { ColumnDef } from "@tanstack/react-table";
import { Info, ArrowUp } from "lucide-react";
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { fetchTrendGenres } from '@/lib/api';
import { ProductStats } from '@/types/product';
import { ImageHover } from '@/components/ui/image-hover';
import { fetchProductStats, fetchProductTrends } from '@/lib/api/product';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { VideoStats, ProductTrendData, ProductTrendResponse } from '@/types/product';
import { TableHeaderCell } from '@/components/dashboard/data-table/table-header-cell';
import { GenreBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { GENRE_COLORS, DEFAULT_GENRE_COLOR } from '@/lib/constants';

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

// TikTokカラーの定義
const TIKTOK_COLORS = {
  pink: '#FE2C55',
  aqua: '#25F4EE',
  black: '#000000',
  white: '#FFFFFF',
};

// 指標の表示名を取得する関数
const getMetricLabel = (metricKey: string) => {
  const labels: Record<string, string> = {
    viewsIncrease: '再生増加数',
    over100kViews: '10万再生以上個数',
    postCount: '投稿数',
  };
  return labels[metricKey] || metricKey;
};

// 前処理用のデータ型を定義
interface PreprocessedData {
  date: string;
  [key: string]: string | number; // 商品名をキーとして値を持つ
}

export default function ProductPage() {
  const [activeTab, setActiveTab] = useState("ranking");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(),
  });
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('viewsIncrease');
  const [productData, setProductData] = useState<ProductTrend[]>([]);
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableGenres, setAvailableGenres] = useState<Option[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [trendData, setTrendData] = useState<ProductTrendData[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [topProducts, setTopProducts] = useState<string[]>([]);
  const [graphDataLoaded, setGraphDataLoaded] = useState(false);
  const [topProductsByMetric, setTopProductsByMetric] = useState<Record<MetricKey, string[]>>({
    viewsIncrease: [],
    over100kViews: [],
    postCount: []
  });
  
  // 指標ごとにデータをキャッシュするための状態を追加
  const [cachedProductStats, setCachedProductStats] = useState<Record<MetricKey, ProductStats[]>>({
    viewsIncrease: [],
    over100kViews: [],
    postCount: []
  });
  
  const [cachedTrendData, setCachedTrendData] = useState<Record<MetricKey, ProductTrendData[]>>({
    viewsIncrease: [],
    over100kViews: [],
    postCount: []
  });

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
    if (!dataLoaded || userSelectedDate) {
      const loadProductStats = async () => {
        try {
          console.log("API呼び出し開始:", { userSelectedDate, dataLoaded, metric });
          setIsLoading(true);
          setError(null);
          
          // キャッシュ内にすでにデータがあるか確認
          if (cachedProductStats[metric]?.length > 0 && userSelectedDate) {
            console.log("キャッシュからデータを使用:", metric);
            setProductStats(cachedProductStats[metric]);
            setIsLoading(false);
            return;
          }
          
          const result = await fetchProductStats(
            userSelectedDate ? dateRange.start.toISOString().split('T')[0] : null,
            userSelectedDate ? dateRange.end.toISOString().split('T')[0] : null,
            selectedGenres,
            metric // 現在選択中の指標を送信
          );
          
          console.log("APIレスポンス:", result);
          setProductStats(result.data);
          
          // 結果をキャッシュに保存
          setCachedProductStats(prev => ({
            ...prev,
            [metric]: result.data
          }));
          
          // ユーザーが選択していない場合のみ、バックエンドから返された日付範囲を設定
          if (!userSelectedDate && !dataLoaded) {
            console.log("ユーザー選択なし、dateRange確認:", result.dateRange);
            if (result.dateRange) {
              console.log("バックエンドから受け取った日付範囲:", result.dateRange);
              const start = new Date(result.dateRange.startDate);
              const end = new Date(result.dateRange.endDate);
              console.log("変換された日付範囲:", { start, end });
              setDateRange({
                start,
                end
              });
            } else {
              console.log("dateRangeなし");
            }
          }
          
          setDataLoaded(true);
        } catch (err) {
          console.error("API呼び出しエラー:", err);
          setError('商品統計情報の取得に失敗しました');
        } finally {
          setIsLoading(false);
        }
      };

      loadProductStats();
    } else {
      console.log("API呼び出しがスキップされました:", { userSelectedDate, dataLoaded, metric });
    }
  }, [userSelectedDate, dataLoaded, dateRange, selectedGenres, metric, cachedProductStats]);

  // トレンドグラフ用のデータを取得するuseEffect
  useEffect(() => {
    if (activeTab === 'graph' && (!graphDataLoaded || userSelectedDate)) {
      const loadTrendData = async () => {
        try {
          setIsLoadingTrends(true);
          setTrendError(null);
          
          // キャッシュ内にすでにデータがあるか確認
          if (cachedTrendData[metric]?.length > 0 && userSelectedDate) {
            console.log("キャッシュからトレンドデータを使用:", metric);
            setTrendData(cachedTrendData[metric]);
            setIsLoadingTrends(false);
            return;
          }
          
          const result = await fetchProductTrends(
            userSelectedDate ? dateRange.start.toISOString().split('T')[0] : null,
            userSelectedDate ? dateRange.end.toISOString().split('T')[0] : null,
            selectedGenres,
            metric // 現在選択中の指標を送信
          ) as ProductTrendResponse;
          
          setTrendData(result.data);
          
          // 結果をキャッシュに保存
          setCachedTrendData(prev => ({
            ...prev,
            [metric]: result.data
          }));
          
          // APIから返された指標別トップ商品の設定
          if (result.topProductsByMetric) {
            setTopProductsByMetric({
              viewsIncrease: result.topProductsByMetric.viewsIncrease || [],
              over100kViews: result.topProductsByMetric.over100kViews || [],
              postCount: result.topProductsByMetric.postCount || []
            });
          }
          
          // APIから返されたすべての商品の中からカテゴリが空白でない商品をフィルタ
          const filteredProducts = result.products.filter((product: string) => {
            // 商品情報をproductStatsから取得してカテゴリがあるか確認
            const productInfo = productStats.find(stat => stat.product === product);
            return productInfo && productInfo.product_category && productInfo.product_category.trim() !== '';
          });
          
          // すべての商品リストを保存
          setTopProducts(filteredProducts);
          
          if (!userSelectedDate && result.dateRange) {
            setDateRange({
              start: new Date(result.dateRange.startDate),
              end: new Date(result.dateRange.endDate)
            });
          }
          setGraphDataLoaded(true);
        } catch (err) {
          console.error("トレンドデータの取得に失敗しました:", err);
          setTrendError('トレンドデータの取得に失敗しました');
        } finally {
          setIsLoadingTrends(false);
        }
      };

      loadTrendData();
    }
  }, [activeTab, graphDataLoaded, userSelectedDate, dateRange, selectedGenres, productStats, metric, cachedTrendData]);

  // 現在の指標に基づいて表示すべき商品リストを取得する関数
  const getCurrentTopProducts = () => {
    if (!trendData.length) return [];
    
    // APIから返された指標別のトップ商品リストから現在の指標に対応するものを返す
    if (trendData[0]?.product && topProductsByMetric && topProductsByMetric[metric]?.length > 0) {
      return topProductsByMetric[metric]
        .filter(product => {
          // 商品情報をproductStatsから取得してカテゴリがあるか確認
          const productInfo = productStats.find(stat => stat.product === product);
          return productInfo && productInfo.product_category && productInfo.product_category.trim() !== '';
        });
    }
    
    // フォールバック：トレンドデータから直接計算（APIが対応していない場合）
    // 全商品の一覧を取得
    const allProducts = trendData
      .reduce((acc, item) => {
        if (!acc.includes(item.product)) {
          acc.push(item.product);
        }
        return acc;
      }, [] as string[]);
    
    // すべての商品の中で、現在の指標に基づいて最も値が高い順に並べる
    const sortedProducts = [...allProducts].sort((a, b) => {
      // 各商品の最新日付のデータを見つける
      const aData = [...trendData]
        .filter(item => item.product === a)
        .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0];
      
      const bData = [...trendData]
        .filter(item => item.product === b)
        .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())[0];
      
      if (!aData || !bData) return 0;
      
      return bData.metrics[metric] - aData.metrics[metric];
    });
    
    // カテゴリ情報がある商品のみをフィルタリングして返す
    return sortedProducts
      .filter(product => {
        const productInfo = productStats.find(stat => stat.product === product);
        return productInfo && productInfo.product_category && productInfo.product_category.trim() !== '';
      })
      .slice(0, 10);
  };

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
  };

  const handleDateRangeApply = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setUserSelectedDate(true);
      // 日付変更時にキャッシュをクリア
      setCachedProductStats({
        viewsIncrease: [],
        over100kViews: [],
        postCount: []
      });
      setCachedTrendData({
        viewsIncrease: [],
        over100kViews: [],
        postCount: []
      });
      setDataLoaded(false);
      setGraphDataLoaded(false);
    }
  };

  const handleProductClick = (productId: string) => {
    setSelectedProduct(productId);
    // ここで関連動画を取得するAPIを呼び出す
  };

  // 日付フォーマット用の関数
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // ジャンル選択用のハンドラを修正
  const handleGenreChange = (selected: string[]) => {
    setSelectedGenres(selected);
    // ジャンル変更時にデータを再ロードするためのフラグをリセット
    setDataLoaded(false);
    setGraphDataLoaded(false);
    // ジャンル変更時にキャッシュをクリア
    setCachedProductStats({
      viewsIncrease: [],
      over100kViews: [],
      postCount: []
    });
    setCachedTrendData({
      viewsIncrease: [],
      over100kViews: [],
      postCount: []
    });
  };

  // 指標変更ハンドラを修正
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMetric = e.target.value as MetricKey;
    setMetric(newMetric);
    
    // 指標変更時にデータを再取得
    if (cachedProductStats[newMetric]?.length === 0) {
      // ランキングデータがキャッシュにない場合は再読み込み
      setDataLoaded(false);
    }
    
    if (activeTab === 'graph' && cachedTrendData[newMetric]?.length === 0) {
      // トレンドデータがキャッシュにない場合はグラフデータの再読み込み
      setGraphDataLoaded(false);
    }
  };

  // グラフ表示用データの前処理関数を更新
  const preprocessTrendData = (trendData: ProductTrendData[], topProducts: string[]): PreprocessedData[] => {
    // 日付の一覧を取得（重複を排除）
    const uniqueDates = Array.from(new Set(trendData.map(item => item.date))).sort();
    
    // 日付ごとにデータを整形
    return uniqueDates.map(date => {
      // 初期オブジェクトに日付を設定
      const dataPoint: PreprocessedData = { date };
      
      // 各商品のデータを追加
      topProducts.forEach(product => {
        // その日付のその商品のデータを検索
        const productData = trendData.find(item => item.date === date && item.product === product);
        // データがあれば現在選択されている指標の値を設定、なければ0を設定
        dataPoint[product] = productData 
          ? productData.metrics[metric] 
          : 0;
      });
      
      return dataPoint;
    });
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
      <h1 className="text-2xl font-bold mb-6">PR動画商材トレンド</h1>

      <div className="space-y-4">
        {/* フィルターエリア */}
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">表示指標:</label>
            <select 
              value={metric}
              onChange={handleMetricChange}
              className="border rounded p-1 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE]"
            >
              <option value="viewsIncrease">総再生増加数</option>
              <option value="over100kViews">10万再生以上個数</option>
              <option value="postCount">投稿数</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">ジャンルフィルタ:</label>
            <MultiSelect
              options={availableGenres}
              selected={selectedGenres}
              onChange={handleGenreChange}
              className="border rounded p-1 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE]"
              placeholder="すべてのジャンル"
            />
          </div>
          <div className="w-[280px]">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              onApply={handleDateRangeApply}
            />
          </div>
        </div>

        {/* タブエリア */}
        <Tabs defaultValue="ranking" className="w-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="border-b border-[#25F4EE]/20">
            <TabsTrigger 
              value="ranking" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              ランキング
            </TabsTrigger>
            <TabsTrigger 
              value="graph" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              トレンドグラフ
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ranking">
            <div className="flex gap-6">
              {/* 左側: ランキングテーブル */}
              <div className="w-1/3">
                <Card >
                  <CardHeader>
                    <CardTitle>商材トレンド</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2 px-2">順位</TableHead>
                          <TableHead className="text-xs py-2 px-2">商材名</TableHead>
                          <TableHead className="text-xs py-2 px-2 text-right">{getMetricLabel(metric)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productStats
                          .filter(stat => stat.product && stat.product.trim() !== '')
                          .slice(0, 15)
                          .map((stat, index) => {
                            const metricValue = {
                              viewsIncrease: Number(stat.total_play_count_increase) || 0,
                              over100kViews: Number(stat.videos_over_100k) || 0,
                              postCount: Number(stat.total_posts) || 0
                            }[metric];
                            
                            const isSelected = selectedProduct === stat.product;
                            
                            return (
                              <TableRow 
                                key={index} 
                                className={cn(
                                  "cursor-pointer transition-colors",
                                  isSelected ? "bg-[#25F4EE]/5 hover:bg-[#25F4EE]/10" : "hover:bg-[#25F4EE]/5"
                                )}
                                onClick={() => setSelectedProduct(stat.product)}
                              >
                                <TableCell className={cn(
                                  "py-3",
                                )}>
                                  {index + 1}
                                </TableCell>
                                <TableCell className="py-3">
                                  <GenreBadge 
                                    genre={stat.product} 
                                    categoryForColor={stat.product_category}
                                  />
                                </TableCell>
                                <TableCell className="py-3 text-right">{formatNumber(metricValue)}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* 右側: 関連動画 */}
              <div className="w-2/3">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedProduct ? (
                        <div className="flex items-center gap-2">
                          <span>関連動画:</span>
                          {productStats.find(stat => stat.product === selectedProduct) && (
                            <GenreBadge 
                              genre={selectedProduct} 
                              categoryForColor={productStats.find(stat => stat.product === selectedProduct)?.product_category}
                            />
                          )}
                        </div>
                      ) : '商材を選択してください'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedProduct ? (
                      <div data-product-videos-table>
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs py-2 px-2">サムネイル</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">再生増加数</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">いいね増加数</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">投稿日</TableHead>
                              <TableHead className="text-xs py-2 px-2">アカウント名</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productStats.find(stat => stat.product === selectedProduct)?.top_videos
                              ?.sort((a, b) => Number(b.play_count_increase) - Number(a.play_count_increase))
                              .map((video, index) => (
                              <TableRow key={index} className="hover:bg-[#25F4EE]/5 transition-colors">
                                <TableCell>
                                  {video.thumbnail_url ? (
                                    <div className="relative w-[120px] h-[120px] my-1 mx-auto">
                                      <div className="relative w-full h-full overflow-hidden rounded border-2 border-transparent hover:border-[#FE2C55] transition-colors">
                                        <ImageHover
                                          src={video.thumbnail_url}
                                          alt="サムネイル"
                                          videoUrl={video.url}
                                          videoData={{
                                            views: Number(video.play_count) ?? 0,
                                            viewsIncrease: Number(video.play_count_increase) ?? 0,
                                            ten_days_increase: 0,
                                            createdAt: video.created_at,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-[120px] h-[120px] bg-gray-100 rounded" />
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {Number(video.play_count_increase) > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.play_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.play_count_increase)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {Number(video.likes_count_increase) > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.likes_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.likes_count_increase)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {video.created_at
                                    ? (() => {
                                        const d = new Date(video.created_at);
                                        const yy = String(d.getFullYear()).slice(-2);
                                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                                        const dd = String(d.getDate()).padStart(2, '0');
                                        return `${yy}/${mm}/${dd}`;
                                      })()
                                    : ''}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <span className="font-bold">{video.account_name}</span>
                                    {video.display_name && (
                                      <span className="block text-xs text-gray-500">{video.display_name}</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!productStats.find(stat => stat.product === selectedProduct)?.top_videos || 
                              productStats.find(stat => stat.product === selectedProduct)?.top_videos?.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-4">
                                  関連動画がありません
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                        <p className="text-gray-500">商材を選択すると、関連動画が表示されます</p>
                        <p className="text-[#FE2C55] mt-2">← 左のリストから選択してください</p>
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
                <CardTitle>トレンドグラフ({getMetricLabel(metric)})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingTrends ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Skeleton className="h-[350px] w-full" />
                  </div>
                ) : trendError ? (
                  <div className="text-red-500 p-4">{trendError}</div>
                ) : trendData.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                    <p className="text-gray-500">データがありません</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {getCurrentTopProducts().map((product, index) => {
                        // 商品カテゴリ情報を取得
                        const productInfo = productStats.find(stat => stat.product === product);
                        const colorKey = productInfo?.product_category || product;
                        const colors = GENRE_COLORS[colorKey as keyof typeof GENRE_COLORS] || DEFAULT_GENRE_COLOR;
                        
                        return (
                          <div key={product} className="flex items-center gap-1">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: colors.text }}
                            />
                            <GenreBadge 
                              genre={product} 
                              categoryForColor={productInfo?.product_category}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart
                        data={preprocessTrendData(trendData, getCurrentTopProducts())}
                        margin={{ top: 5, right: 30, left: 40, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={formatDate}
                          type="category"
                          label={{ value: '日付', position: 'insideBottomRight', offset: -10 }}
                        />
                        <YAxis 
                          width={60}
                          tickFormatter={(value) => formatNumber(value)}
                          tick={{ fontSize: 12 }}
                          tickMargin={10}
                        />
                        <Tooltip 
                          formatter={(value, name) => [formatNumber(Number(value)), name]}
                          labelFormatter={(label) => formatDate(label.toString())}
                          itemSorter={(item) => {
                            // valueがundefinedでないことを確認してから数値に変換
                            if (item.value === undefined) return 0;
                            const numValue = Number(item.value);
                            // 降順（大きい値を上に）にするために負の値を返す
                            return -numValue;
                          }}
                        />
                        <Legend />
                        {getCurrentTopProducts().map((product, index) => {
                          // 商品カテゴリ情報を取得して色を決定
                          const productInfo = productStats.find(stat => stat.product === product);
                          const colorKey = productInfo?.product_category || product;
                          // GenreBadgeと同じロジックでconstants.tsから色を取得
                          const colors = GENRE_COLORS[colorKey as keyof typeof GENRE_COLORS] || DEFAULT_GENRE_COLOR;
                          
                          return (
                            <Line
                              key={product}
                              type="monotone"
                              dataKey={product} // product名をdataKeyに設定
                              name={product}
                              stroke={colors.text}
                              activeDot={{ r: 8 }}
                              strokeWidth={2}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 