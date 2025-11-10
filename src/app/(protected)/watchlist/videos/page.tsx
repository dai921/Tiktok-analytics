'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { ImageHover } from '@/components/ui/image-hover';
import { ArrowUp, Trash2, BookmarkIcon, TrendingUp } from 'lucide-react';
import { fetchTrendGenres } from '@/lib/api';
import { getVideoWatchlist, removeVideoFromWatchlist, getVideoWatchlistTrends } from '@/lib/api/watchlist';
import { formatNumber } from '@/lib/utils';
import { GenreBadge } from '@/components/ui/badge';
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// 動画ウォッチリストの型定義
interface WatchlistVideoItem {
  watchlist: {
    id: number;
    email: string;
    video_id: string;
    watchlist_name: string | null;
    created_at: string;
    updated_at: string;
  };
  video: {
    video_id: string;
    thumbnail_url: string;
    created_at: string;
    play_count: number;
    play_count_increase: number;
    account_name: string;
    display_name: string;
    content_type: string;
    likes_count: number;
    comment_count: number;
    save_count: number;
    likes_count_increase: number;
    comment_count_increase: number;
    save_count_increase: number;
    hashtags: string[];
    caption: string;
  } | null;
}

interface PeriodInfo {
  start_date: string;
  end_date: string;
}

// トレンドデータの型定義
interface TrendDataPoint {
  date: string;
  play_count_increase: number;
  likes_count_increase: number;
  comment_count_increase: number;
  save_count_increase: number;
}

interface VideoTrendData {
  video_id: string;
  account_name: string;
  trends: TrendDataPoint[];
}

// 指標の型定義
type MetricType = 'play_count_increase' | 'likes_count_increase' | 'comment_count_increase' | 'save_count_increase';

export default function VideoWatchlistPage() {
  const [activeTab, setActiveTab] = useState("list");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  
  // // ジャンル選択関連
  // const [availableGenres, setAvailableGenres] = useState<Option[]>([]);
  // const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  
  // 動画データ
  const [watchlistVideos, setWatchlistVideos] = useState<WatchlistVideoItem[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<WatchlistVideoItem[]>([]);

  // 指標選択
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('play_count_increase');
  
  // トレンドデータ
  const [trendData, setTrendData] = useState<VideoTrendData[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  
  const { toast } = useToast();
  
  // ジャンルデータを取得するuseEffectを追加
  // useEffect(() => {
  //   const loadGenres = async () => {
  //     try {
  //       setIsLoading(true);
  //       const genresResponse = await fetchTrendGenres();
        
  //       if (genresResponse.success) {
  //         // ジャンルをOption形式に変換
  //         const genreOptions = genresResponse.data.map(genre => ({
  //           value: genre,
  //           label: genre
  //         }));
          
  //         setAvailableGenres(genreOptions);
          
  //         // デフォルトですべてのジャンルを選択
  //         if (genreOptions.length > 0) {
  //           const initialSelected = genreOptions.map(option => option.value);
  //           setSelectedGenres(initialSelected);
  //         }
  //       } else {
  //         setError('ジャンルデータの取得に失敗しました');
  //       }
  //     } catch (error) {
  //       console.error("ジャンルデータの読み込みに失敗しました", error);
  //       setError('ジャンルデータの読み込みに失敗しました');
  //     } finally {
  //       setIsLoading(false);
  //     }
  //   };
    
  //   loadGenres();
  // }, []);

  // データを取得するuseEffect
  useEffect(() => {
    if (!dataLoaded || userSelectedDate) {
      const loadWatchlistVideos = async () => {
        try {
          setIsLoading(true);
          setError(null);
          
          // 日付形式をYYYY-MM-DDに変換
          let startDateStr = '';
          let endDateStr = '';
          
          if (dateRange) {
            startDateStr = dateRange.start.toISOString().split('T')[0];
            endDateStr = dateRange.end.toISOString().split('T')[0];
          }

          const [watchlistResult, trendResult] = await Promise.allSettled([
            getVideoWatchlist(
              dateRange ? startDateStr : undefined, 
              dateRange ? endDateStr : undefined
            ),
            getVideoWatchlistTrends(
              dateRange ? startDateStr : undefined, 
              dateRange ? endDateStr : undefined
            )
          ]);
          
          if (watchlistResult.status === 'fulfilled') {
            const result = watchlistResult.value;
            console.log('API応答結果:', result);
            
            if (result.success) {
              console.log('取得したデータ数:', result.data?.length || 0);
              console.log('最初のデータ:', result.data?.[0] || 'データなし');
              
              if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                setWatchlistVideos(result.data);
                setFilteredVideos(result.data);
                
                if (result.period) {
                  setPeriodInfo(result.period);
                  
                  if (!userSelectedDate) {
                    setDateRange({
                      start: new Date(result.period.start_date),
                      end: new Date(result.period.end_date)
                    });
                    setTempDateRange({
                      start: new Date(result.period.start_date),
                      end: new Date(result.period.end_date)
                    });
                  }
                } else {
                  setPeriodInfo({
                    start_date: startDateStr,
                    end_date: endDateStr
                  });
                }
                
                setDataLoaded(true);
                setUserSelectedDate(false);
              } else {
                console.warn('APIからデータが返されましたが、データが空です');
                setWatchlistVideos([]);
                setFilteredVideos([]);
                setPeriodInfo({
                  start_date: startDateStr,
                  end_date: endDateStr
                });
                setTrendData([]);
              }
            } else {
              console.error('APIエラー:', result.error);
              setError('動画ウォッチリストの取得に失敗しました');
            }
          } else {
            console.error("API呼び出しエラー:", watchlistResult.reason);
            setError('動画ウォッチリストの取得に失敗しました');
          }

          if (trendResult.status === 'fulfilled') {
            if (trendResult.value.success && trendResult.value.data) {
              setTrendData(trendResult.value.data);
            }
          } else {
            console.error('トレンドデータ取得エラー:', trendResult.reason);
          }
        } catch (err) {
          console.error("API呼び出しエラー:", err);
          setError('動画ウォッチリストの取得に失敗しました');
        } finally {
          setIsLoading(false);
        }
      };

      loadWatchlistVideos();
    }
  }, [dataLoaded, userSelectedDate, dateRange]);
  
  // // ジャンルフィルタリングを適用するuseEffectを単純化
  // useEffect(() => {
  //   // ハッシュタグでフィルタリングしない - すべてのデータを表示
  //   console.log('全データ表示:', watchlistVideos.length);
  //   setFilteredVideos(watchlistVideos);
  // }, [watchlistVideos]);

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
  };

  const handleDateRangeApply = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setUserSelectedDate(true);
    }
  };

  // // ジャンル選択用のハンドラ
  // const handleGenreChange = (selected: string[]) => {
  //   setSelectedGenres(selected);
  // };

  // 指標変更ハンドラ
  const handleMetricChange = (value: string) => {
    setSelectedMetric(value as MetricType);
  };

  // ビデオ選択ハンドラ
  const handleVideoSelect = (videoId: string) => {
    setSelectedVideoId(videoId);
  };

  const sortedVideos = useMemo(() => {
    return [...filteredVideos]
      .filter(item => item.video)
      .sort((a, b) => {
        const aValue = a.video?.[`${selectedMetric}`] || 0;
        const bValue = b.video?.[`${selectedMetric}`] || 0;
        return bValue - aValue;
      })
      .slice(0, 10);
  }, [filteredVideos, selectedMetric]);

  const topVideoIds = useMemo(
    () => sortedVideos.map(item => item.video?.video_id).filter(Boolean) as string[],
    [sortedVideos]
  );

  const topVideosTrends = useMemo(
    () => trendData.filter(item => topVideoIds.includes(item.video_id)),
    [trendData, topVideoIds]
  );

  const allUniqueDates = useMemo(() => {
    const allDates = new Set<string>();
    topVideosTrends.forEach(videoTrend => {
      videoTrend.trends.forEach(trend => {
        allDates.add(trend.date);
      });
    });
    return Array.from(allDates).sort();
  }, [topVideosTrends]);

  const formattedGraphData = useMemo(() => {
    return allUniqueDates.map(date => {
      const dataPoint: Record<string, number | string> = { date };
      topVideosTrends.forEach((videoTrend, index) => {
        const rankLabel = `${index + 1}位`;
        const trendForDate = videoTrend.trends.find(t => t.date === date);
        dataPoint[rankLabel] = trendForDate ? trendForDate[selectedMetric] : 0;
      });
      return dataPoint;
    });
  }, [allUniqueDates, topVideosTrends, selectedMetric]);

  // 指標の表示名を取得
  const getMetricDisplayName = (metric: MetricType): string => {
    switch (metric) {
      case 'play_count_increase': return '再生数増加';
      case 'likes_count_increase': return 'いいね数増加';
      case 'comment_count_increase': return 'コメント数増加';
      case 'save_count_increase': return '保存数増加';
      default: return '';
    }
  };

  // 動画を削除する関数
  const handleDeleteVideo = async (videoId: string) => {
    // 確認ダイアログを表示
    if (window.confirm('この動画をウォッチリストから削除しますか？')) {
      try {
        const result = await removeVideoFromWatchlist(videoId);
        
        if (result.success) {
          // 削除成功時、リストから該当動画を削除
          setWatchlistVideos(prevVideos => 
            prevVideos.filter(item => item.watchlist.video_id !== videoId)
          );
          toast({
            title: "削除完了",
            description: "動画をウォッチリストから削除しました",
            variant: "default",
          });
        } else {
          toast({
            title: "エラー",
            description: "削除中にエラーが発生しました",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('動画削除エラー:', error);
        toast({
          title: "エラー",
          description: "削除処理中にエラーが発生しました",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading && !dataLoaded) {
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
      <h1 className="text-3xl font-bold text-white mb-6">動画ウォッチリスト</h1>
      
      <div className="space-y-4">
        {/* フィルターエリア */}
        <div className="flex gap-4 items-center flex-wrap">
          {/* <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">ジャンルフィルタ:</label>
            <MultiSelect
              options={availableGenres}
              selected={selectedGenres}
              onChange={handleGenreChange}
              className="border rounded p-1 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE]"
              placeholder="すべてのジャンル"
            />
          </div> */}
          <div className="w-[280px]">
            <DateRangePicker
              dateRange={dateRange || (periodInfo ? {
                start: new Date(periodInfo.start_date),
                end: new Date(periodInfo.end_date)
              } : {
                start: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000), // 表示用のデフォルト値
                end: new Date()
              })}
              onDateRangeChange={handleDateRangeChange}
              onApply={handleDateRangeApply}
            />
          </div>
        </div>

        {/* タブエリア */}
        <Tabs defaultValue="list" className="w-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="border-b border-[#25F4EE]/20">
            <TabsTrigger 
              value="list" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              動画一覧
            </TabsTrigger>
            <TabsTrigger 
              value="ranking" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              ランキング
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <Card>
              <CardHeader>
                <CardTitle>ウォッチリスト動画一覧</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredVideos.length === 0 ? (
                  <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                    <p>ウォッチリストに動画はまだありません</p>
                  </div>
                ) : (
                  <>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2 px-2">サムネイル</TableHead>
                          <TableHead className="text-xs text-right">再生数</TableHead>
                          <TableHead className="text-xs text-right">再生増加数</TableHead>
                          <TableHead className="text-xs text-right">いいね数</TableHead>
                          <TableHead className="text-xs text-right">いいね増加数</TableHead>
                          <TableHead className="text-xs text-right">コメント数</TableHead>
                          <TableHead className="text-xs text-right">コメント増加数</TableHead>
                          <TableHead className="text-xs text-right">保存数</TableHead>
                          <TableHead className="text-xs text-right">保存増加数</TableHead>
                          <TableHead className="text-xs py-2 px-2">アカウント名</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVideos.map((item, index) => {
                          const video = item.video;
                          // ビデオ情報がない場合はスキップ
                          if (!video) {
                            console.log(`${index}番目のデータにvideo情報がありません:`, item);
                            return null;
                          }
                          
                          return (
                            <TableRow key={item.watchlist.id} className="hover:bg-[#25F4EE]/5 transition-colors">
                              <TableCell>
                                {video.thumbnail_url ? (
                                  <div className="relative w-[120px] h-[120px] my-1 mx-auto">
                                    <div className="relative w-full h-full overflow-hidden rounded border-2 border-transparent hover:border-[#FE2C55] transition-colors">
                                      <ImageHover
                                        src={video.thumbnail_url}
                                        alt="サムネイル"
                                        videoUrl={`https://www.tiktok.com/@${video.account_name}/video/${video.video_id}`}
                                        videoData={{
                                          views: video.play_count,
                                          viewsIncrease: video.play_count_increase,
                                          createdAt: video.created_at,
                                          accountName: video.account_name,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-[120px] h-[120px] bg-gray-100 rounded" />
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.play_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.play_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(video.play_count_increase)}
                                  </div>
                                ) : (
                                  formatNumber(video.play_count_increase)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.likes_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.likes_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(video.likes_count_increase)}
                                  </div>
                                ) : (
                                  formatNumber(video.likes_count_increase)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.comment_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.comment_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(video.comment_count_increase)}
                                  </div>
                                ) : (
                                  formatNumber(video.comment_count_increase)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.save_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.save_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(video.save_count_increase)}
                                  </div>
                                ) : (
                                  formatNumber(video.save_count_increase)
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <span className="font-bold">{video.account_name}</span>
                                  {video.display_name && video.display_name !== video.account_name && (
                                    <span className="block text-xs text-gray-500">{video.display_name}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <button
                                  className="py-1 px-1 bg-[#FE2C55] hover:bg-[#D91847] text-white rounded-md text-xs font-medium flex items-center justify-center transition-colors"
                                  onClick={() => handleDeleteVideo(video.video_id)}
                                  aria-label="リストから削除"
                                >
                                  リストから削除
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ranking">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>ウォッチリスト動画ランキング(最大10件)</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">指標:</span>
                    <Select onValueChange={handleMetricChange} defaultValue={selectedMetric}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="指標を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="play_count_increase">再生数増加</SelectItem>
                        <SelectItem value="likes_count_increase">いいね数増加</SelectItem>
                        <SelectItem value="comment_count_increase">コメント数増加</SelectItem>
                        <SelectItem value="save_count_increase">保存数増加</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredVideos.length === 0 ? (
                  <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                    <p>ウォッチリストに動画はまだありません</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ランキングテーブル */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs py-2 px-2">順位</TableHead>
                            <TableHead className="text-xs py-2 px-2">サムネイル</TableHead>
                            <TableHead className="text-xs text-right py-2 px-2">再生増加数</TableHead>
                            <TableHead className="text-xs text-right py-2 px-2">いいね増加数</TableHead>
                            <TableHead className="text-xs text-right py-2 px-2">コメント増加数</TableHead>
                            <TableHead className="text-xs text-right py-2 px-2">保存増加数</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedVideos.map((item, index) => {
                            const video = item.video;
                            if (!video) return null;
                            
                            return (
                              <TableRow 
                                key={item.watchlist.id} 
                                className={`hover:bg-[#25F4EE]/5 transition-colors cursor-pointer ${selectedVideoId === video.video_id ? 'bg-[#25F4EE]/10' : ''}`}
                                onClick={() => handleVideoSelect(video.video_id)}
                              >
                                <TableCell className="py-2">
                                  {index + 1}
                                </TableCell>
                                <TableCell>
                                  {video.thumbnail_url ? (
                                    <div className="relative w-[80px] h-[80px] my-1">
                                      <div className="relative w-full h-full overflow-hidden rounded border-2 border-transparent hover:border-[#FE2C55] transition-colors">
                                        <ImageHover
                                          src={video.thumbnail_url}
                                          alt="サムネイル"
                                          videoUrl={`https://www.tiktok.com/@${video.account_name}/video/${video.video_id}`}
                                          videoData={{
                                            views: video.play_count,
                                            viewsIncrease: video.play_count_increase,
                                            createdAt: video.created_at,
                                            accountName: video.account_name,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-[80px] h-[80px] bg-gray-100 rounded" />
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {video.play_count_increase > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.play_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.play_count_increase)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {video.likes_count_increase > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.likes_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.likes_count_increase)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {video.comment_count_increase > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.comment_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.comment_count_increase)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {video.save_count_increase > 0 ? (
                                    <div className="flex items-center justify-end gap-1 text-green-600 text-sm">
                                      <ArrowUp className="h-3 w-3" />
                                      {formatNumber(video.save_count_increase)}
                                    </div>
                                  ) : (
                                    formatNumber(video.save_count_increase)
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* 推移グラフ */}
                    <div className="h-[400px] border border-gray-200 dark:border-gray-800 rounded-md p-4">
                      <div className="h-full flex flex-col">
                        <div className="mb-2">
                          <h3 className="text-sm font-medium">
                            上位10動画の{getMetricDisplayName(selectedMetric)}推移
                          </h3>
                        </div>
                        <div className="flex-grow">
                          {trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={formattedGraphData}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                <XAxis 
                                  dataKey="date" 
                                  tickFormatter={(value) => value.split('-').slice(1).join('/')}
                                />
                                <YAxis />
                                <Tooltip 
                                  labelFormatter={(value) => `日付: ${value}`}
                                  formatter={(value, name) => [formatNumber(Number(value)), name]}
                                />
                                <Legend />
                                {topVideosTrends.map((videoTrend, index) => {
                                  // 鮮やかで見分けやすい10色のカラーパレット
                                  const colors = [
                                    '#FF3B30', // 赤（1位）
                                    '#34C759', // 緑（2位）
                                    '#007AFF', // 青（3位）
                                    '#FF9500', // オレンジ（4位）
                                    '#5856D6', // 紫（5位）
                                    '#FF2D55', // ピンク（6位）
                                    '#00C7BE', // ティール（7位）
                                    '#AF52DE', // マゼンタ（8位）
                                    '#FFCC00', // 黄色（9位）
                                    '#8E8E93'  // グレー（10位）
                                  ];
                                  const color = colors[index % colors.length];
                                  const rankLabel = `${index + 1}位`;
                                  
                                  return (
                                    <Line 
                                      key={videoTrend.video_id}
                                      type="monotone" 
                                      dataKey={rankLabel}
                                      stroke={color}
                                      name={rankLabel}
                                      dot={{ r: 3 }}
                                      activeDot={{ r: 6 }}
                                    />
                                  );
                                })}
                              </LineChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <p className="text-gray-400">トレンドデータが利用できません</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
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
