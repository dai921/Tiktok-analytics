'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect, Option } from '@/components/ui/multi-select';
import { ImageHover } from '@/components/ui/image-hover';
import { ArrowUp, Trash2, BookmarkIcon } from 'lucide-react';
import { fetchTrendGenres } from '@/lib/api';
import { getVideoWatchlist, removeVideoFromWatchlist } from '@/lib/api/watchlist';
import { formatNumber } from '@/lib/utils';
import { GenreBadge } from '@/components/ui/badge';
import { useToast } from "@/hooks/use-toast";

// 動画ウォッチリストの型定義
interface WatchlistVideoItem {
  watchlist: {
    watchlist_id: number;
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

export default function VideoWatchlistPage() {
  const [activeTab, setActiveTab] = useState("list");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  
  // ジャンル選択関連
  const [availableGenres, setAvailableGenres] = useState<Option[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  
  // 動画データ
  const [watchlistVideos, setWatchlistVideos] = useState<WatchlistVideoItem[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<WatchlistVideoItem[]>([]);
  
  const { toast } = useToast();
  
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
          
          // APIから詳細付きウォッチリストを取得（日付パラメータはユーザーが選択した場合のみ送信）
          const result = await getVideoWatchlist(
            dateRange ? startDateStr : undefined, 
            dateRange ? endDateStr : undefined
          );
          
          console.log('API応答結果:', result);
          
          if (result.success) {
            console.log('取得したデータ数:', result.data?.length || 0);
            console.log('最初のデータ:', result.data?.[0] || 'データなし');
            
            // データがあるか確認
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
              setWatchlistVideos(result.data);
              setFilteredVideos(result.data);
              setPeriodInfo(result.period || {
                start_date: startDateStr,
                end_date: endDateStr
              });
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
            }
          } else {
            console.error('APIエラー:', result.error);
            setError('動画ウォッチリストの取得に失敗しました');
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
  
  // ジャンルフィルタリングを適用するuseEffectを単純化
  useEffect(() => {
    // ハッシュタグでフィルタリングしない - すべてのデータを表示
    console.log('全データ表示:', watchlistVideos.length);
    setFilteredVideos(watchlistVideos);
  }, [watchlistVideos]);

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
  };

  const handleDateRangeApply = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setUserSelectedDate(true);
    }
  };

  // ジャンル選択用のハンドラ
  const handleGenreChange = (selected: string[]) => {
    setSelectedGenres(selected);
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
              dateRange={dateRange || {
                start: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000), // 表示用のデフォルト値
                end: new Date()
              }}
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
              一覧表示
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
                <CardTitle className="text-[#FE2C55]">ウォッチリスト動画一覧</CardTitle>
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
                          <TableHead>サムネイル</TableHead>
                          <TableHead className="text-right">再生数</TableHead>
                          <TableHead className="text-right">再生増加数</TableHead>
                          <TableHead className="text-right">いいね数</TableHead>
                          <TableHead className="text-right">いいね増加数</TableHead>
                          <TableHead className="text-right">コメント数</TableHead>
                          <TableHead className="text-right">コメント増加数</TableHead>
                          <TableHead className="text-right">保存数</TableHead>
                          <TableHead className="text-right">保存増加数</TableHead>
                          <TableHead>アカウント名</TableHead>
                          <TableHead>アクション</TableHead>
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
                            <TableRow key={item.watchlist.watchlist_id} className="hover:bg-[#25F4EE]/5 transition-colors">
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
                                  className="p-2 text-gray-400 hover:text-[#FE2C55] transition-colors"
                                  onClick={() => handleDeleteVideo(video.video_id)}
                                  aria-label="ウォッチリストから削除"
                                >
                                  <Trash2 className="h-4 w-4" />
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
                <CardTitle className="text-[#FE2C55]">ウォッチリスト動画ランキング</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredVideos.length === 0 ? (
                  <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                    <p>ウォッチリストに動画はまだありません</p>
                  </div>
                ) : (
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>順位</TableHead>
                        <TableHead>サムネイル</TableHead>
                        <TableHead>アカウント名</TableHead>
                        <TableHead className="text-right">再生数</TableHead>
                        <TableHead className="text-right">再生増加数</TableHead>
                        <TableHead className="text-right">保存数</TableHead>
                        <TableHead className="text-right">保存増加数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* 再生増加数でソートしたランキング */}
                      {filteredVideos
                        .filter(item => item.video) // ビデオ情報があるもののみ
                        .sort((a, b) => (b.video?.play_count_increase || 0) - (a.video?.play_count_increase || 0))
                        .map((item, index) => {
                          const video = item.video;
                          if (!video) return null;
                          
                          return (
                            <TableRow key={item.watchlist.watchlist_id} className="hover:bg-[#25F4EE]/5 transition-colors">
                              <TableCell className={`py-3 ${index < 3 ? 'font-bold text-[#FE2C55]' : ''}`}>
                                {index + 1}
                              </TableCell>
                              <TableCell>
                                {video.thumbnail_url ? (
                                  <div className="relative w-[100px] h-[100px] my-1">
                                    <div className="relative w-full h-full overflow-hidden rounded border-2 border-transparent hover:border-[#FE2C55] transition-colors">
                                      <ImageHover
                                        src={video.thumbnail_url}
                                        alt="サムネイル"
                                        videoUrl={`https://www.tiktok.com/@${video.account_name}/video/${video.video_id}`}
                                        videoData={{
                                          views: video.play_count,
                                          viewsIncrease: video.play_count_increase,
                                          createdAt: video.created_at,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="w-[100px] h-[100px] bg-gray-100 rounded" />
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <span className="font-bold">{video.account_name}</span>
                                  {video.display_name && (
                                    <span className="block text-xs text-gray-500">{video.display_name}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.play_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.play_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(video.play_count_increase)}
                                  </div>
                                ) : (
                                  formatNumber(video.play_count_increase)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(video.save_count)}
                              </TableCell>
                              <TableCell className="text-right">
                                {video.save_count_increase > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 