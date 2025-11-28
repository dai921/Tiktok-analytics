'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ArrowUp, Hash } from "lucide-react";
import { HashtagStats, VideoType } from '@/types/hashtag';
import { ImageHover } from '@/components/ui/image-hover';
import { fetchHashtagStats, fetchHashtagTrends } from '@/lib/api/hashtag';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import type { HashtagVideoStats } from '@/types/hashtag';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getAccountTypeColor } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface HashtagTrend {  
  rank: number;
  hashtag: string;
  viewsIncrease: number;
  over100kViews: number;
  postCount: number;
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

// 動画タイプのラベルを取得する関数
const getVideoTypeLabel = (videoType: VideoType) => {
  const labels: Record<VideoType, string> = {
    affiliate: 'アフィ系動画',
    corporate: '企業系動画',
    influencer: 'インフルエンサー系動画',
  };
  return labels[videoType];
};

// アカウントタイプに基づくバッジコンポーネント
const AccountTypeBadge: React.FC<{ accountType: string; videoType: VideoType }> = ({ accountType, videoType }) => {
  const context = videoType === 'affiliate' ? 'affiliate' : 
                  videoType === 'corporate' ? 'corporate' : 
                  videoType === 'influencer' ? 'influencer' : 'all';
  
  const colors = getAccountTypeColor(accountType, context);
  
  return (
    <Badge
      variant="outline"
      className="text-xs whitespace-nowrap"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {accountType}
    </Badge>
  );
};

const MAX_RANGE_DAYS = 62;

export default function HashtagsPage() {
  const [activeTab, setActiveTab] = useState<VideoType>("affiliate");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(),
  });
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('postCount');
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hashtagStats, setHashtagStats] = useState<HashtagStats[]>([]);
  const [displayLimit, setDisplayLimit] = useState(15);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [exportDateRange, setExportDateRange] = useState<{ start: Date; end: Date }>(() => ({
    start: new Date(),
    end: new Date(),
  }));
  const [exportTempDateRange, setExportTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [exportRangeError, setExportRangeError] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const { isAdmin } = useAuth();
  
  // 指標ごとにデータをキャッシュするための状態を追加
  const [cachedHashtagStats, setCachedHashtagStats] = useState<Record<string, HashtagStats[]>>({});

  useEffect(() => {
    if (!dataLoaded || userSelectedDate) {
      const loadHashtagStats = async () => {
        try {
          setIsLoading(true);
          setError(null);

          const cacheKey = `${metric}_${activeTab}`;
          if (cachedHashtagStats[cacheKey]?.length > 0 && userSelectedDate) {
            setHashtagStats(cachedHashtagStats[cacheKey]);
            setIsLoading(false);
            return;
          }

          const result = await fetchHashtagStats(
            userSelectedDate ? dateRange.start.toISOString().split('T')[0] : null,
            userSelectedDate ? dateRange.end.toISOString().split('T')[0] : null,
            metric,
            activeTab
          );

          setHashtagStats(result.data);
          setCachedHashtagStats((prev) => ({
            ...prev,
            [`${metric}_${activeTab}`]: result.data,
          }));

          if (!userSelectedDate && !dataLoaded && result.dateRange) {
            setDateRange({
              start: new Date(result.dateRange.startDate),
              end: new Date(result.dateRange.endDate),
            });
          }

          setDataLoaded(true);
        } catch (err) {
          console.error('ハッシュタグデータ取得エラー:', err);
          setError('ハッシュタグトレンドの取得に失敗しました');
        } finally {
          setIsLoading(false);
        }
      };

      loadHashtagStats();
    } else {
      console.log('API呼び出しスキップ:', { userSelectedDate, dataLoaded, metric, activeTab });
    }
  }, [userSelectedDate, dataLoaded, dateRange, metric, activeTab, cachedHashtagStats]);

  const isRangeWithinLimit = (range?: { start: Date; end: Date }) => {
    if (!range?.start || !range?.end) return true;
    const diffMs = Math.abs(range.end.getTime() - range.start.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= MAX_RANGE_DAYS;
  };

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
    if (rangeError) {
      setRangeError(null);
    }
  };

  const handleDateRangeApply = (range?: { start: Date; end: Date }) => {
    const appliedRange = range || tempDateRange;
    if (!appliedRange) return;
    if (!isRangeWithinLimit(appliedRange)) {
      setRangeError(`CSV出力は最大${MAX_RANGE_DAYS}日までです。`);
      return;
    }
    setRangeError(null);
    setDateRange(appliedRange);
    setUserSelectedDate(true);
    setDisplayLimit(15);
    setCachedHashtagStats({});
    setDataLoaded(false);
  };
  const handleTabChange = (value: string) => {
    const newTab = value as VideoType;
    console.log(`タブ変更: ${activeTab} → ${newTab}`);
    setActiveTab(newTab);
    setDisplayLimit(15);
    setDataLoaded(false);
    setSelectedHashtag(null);
  };

  // 指標変更ハンドラ
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const oldMetric = metric;
    const newMetric = e.target.value as MetricKey;
    console.log(`指標変更: ${oldMetric} → ${newMetric}`);
    setMetric(newMetric);
    setDisplayLimit(15);
    setDataLoaded(false);
  };
  const formatDateForCsv = (value?: Date) => {
    if (!value || Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatExportDateLabel = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear().toString().slice(-2);
    return `${year}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const handleExportDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setExportTempDateRange(newRange);
    if (exportRangeError) {
      setExportRangeError(null);
    }
  };

  const handleExportDateRangeApply = (range?: { start: Date; end: Date }) => {
    const appliedRange = range || exportTempDateRange;
    if (!appliedRange) return;
    if (!isRangeWithinLimit(appliedRange)) {
      setExportRangeError(`CSV出力は最大${MAX_RANGE_DAYS}日までです。`);
      return;
    }
    setExportRangeError(null);
    setExportDateRange(appliedRange);
  };

  const handleOpenExportDialog = () => {
    // ページで表示中の日付範囲をデフォルトとして設定
    setExportTempDateRange(dateRange);
    setExportDateRange(dateRange);
    setExportRangeError(null);
    setExportError(null);
    setIsExportDialogOpen(true);
  };

  const handleExportConfirm = () => {
    const selectedRange = exportTempDateRange || exportDateRange;
    if (!selectedRange?.start || !selectedRange?.end) {
      setExportRangeError('出力期間を選択してください。');
      return;
    }
    if (!isRangeWithinLimit(selectedRange)) {
      setExportRangeError(`CSV出力は最大${MAX_RANGE_DAYS}日までです。`);
      return;
    }
    setExportRangeError(null);
    setExportDateRange(selectedRange);
    setIsExportDialogOpen(false);
    handleExportCsv(selectedRange);
  };

  const handleExportCsv = async (range?: { start: Date; end: Date }) => {
    const selectedRange = range || exportTempDateRange || exportDateRange;
    if (!selectedRange?.start || !selectedRange?.end) {
      setExportError('出力期間を選択してください。');
      return;
    }
    if (!isRangeWithinLimit(selectedRange)) {
      setExportError(`CSV出力は最大${MAX_RANGE_DAYS}日までです。`);
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const start = selectedRange.start.toISOString().split('T')[0];
      const end = selectedRange.end.toISOString().split('T')[0];
      const escapeForCsv = (value: string | number) => {
        const str = String(value ?? '')
          .replace(/\r?\n|\r/g, ' ')
          .replace(/"/g, '""');
        return `"${str}"`;
      };

      const metricsForExport: { key: MetricKey; label: string }[] = [
        { key: 'viewsIncrease', label: '再生数増加' },
        { key: 'over100kViews', label: '10万再生超え本数' },
        { key: 'postCount', label: '投稿数' },
      ];

      const limit = Math.min(Math.max(hashtagStats.length, 10), 150);
      const trendResponse = await fetchHashtagTrends(
        start,
        end,
        metric,
        activeTab,
        limit
      );
      const dailyData = trendResponse?.data || [];
      if (!dailyData.length) {
        setExportError('出力対象のデータがありません。');
        return;
      }

      const uniqueDates = Array.from(new Set(dailyData.map((item) => item.date))).sort();

      const rows = hashtagStats
        .filter((stat) => stat.hashtag && stat.hashtag.trim() !== '')
        .map((stat) => {
          const perDateValues = uniqueDates.flatMap((date) => {
            const record = dailyData.find(
              (item) => item.hashtag === stat.hashtag && item.date === date,
            );
            return metricsForExport.map((m) => Number(record?.metrics?.[m.key] ?? 0) || 0);
          });

          return [
            stat.hashtag,
            getVideoTypeLabel(activeTab),
            ...perDateValues,
          ];
        });

      const header = ['ハッシュタグ', '動画タイプ', ...uniqueDates.flatMap((date) =>
        metricsForExport.map((m) => `${formatExportDateLabel(date)} ${m.label}`)
      )];

      const csvContent = [
        '﻿' + header.map(escapeForCsv).join(','),
        ...rows.map((row) => row.map(escapeForCsv).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
      anchor.href = url;
      anchor.download = `hashtags-trends-daily-${start}-to-${end}-${timestamp}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setExportError(error instanceof Error ? error.message : 'CSV出力に失敗しました。');
    } finally {
      setIsExporting(false);
    }
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
      <h1 className="text-2xl font-bold mb-6">ハッシュタグトレンド</h1>

      <div className="space-y-4">
        {/* フィルターエリア */}
        <div className="flex gap-4 items-center flex-wrap">
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
          <div className="w-[280px]">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              onApply={handleDateRangeApply}
            />
            {rangeError && <p className="mt-1 text-xs text-red-500">{rangeError}</p>}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {exportError && <span className="text-xs text-red-500">{exportError}</span>}
            <Button
              type="button"
              onClick={handleOpenExportDialog}
              disabled={isExporting || !hashtagStats.length}
              className="bg-[#FE2C55] hover:bg-[#e6264c] text-white"
            >
              {isExporting ? 'CSV出力中...' : 'CSV出力'}
            </Button>
          </div>
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>CSV出力期間を選択</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <DateRangePicker
                  dateRange={exportTempDateRange || exportDateRange}
                  onDateRangeChange={handleExportDateRangeChange}
                  onApply={handleExportDateRangeApply}
                />
                {exportRangeError && (
                  <p className="text-xs text-red-500">{exportRangeError}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                  キャンセル
                </Button>
                <Button onClick={handleExportConfirm} disabled={isExporting}>
                  {isExporting ? 'CSV出力中...' : 'CSV出力'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* タブエリア */}
        <Tabs value={activeTab} className="w-full" onValueChange={handleTabChange}>
          <TabsList className="border-b border-[#25F4EE]/20">
            <TabsTrigger 
              value="affiliate" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              アフィ系動画
            </TabsTrigger>
            <TabsTrigger 
              value="corporate" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              企業系動画
            </TabsTrigger>
            <TabsTrigger 
              value="influencer" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
            >
              インフルエンサー系動画
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            <div className="flex gap-6">
              {/* 左側: ランキングテーブル */}
              <div className="w-1/3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Hash className="h-5 w-5" />
                      ハッシュタグランキング
                      <span className="text-sm font-normal text-gray-500">
                        ({getVideoTypeLabel(activeTab)})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2 px-2">順位</TableHead>
                          <TableHead className="text-xs py-2 px-2">ハッシュタグ</TableHead>
                          <TableHead className="text-xs py-2 px-2 text-right whitespace-nowrap">{getMetricLabel(metric)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hashtagStats
                          .filter(stat => stat.hashtag && stat.hashtag.trim() !== '')
                          .slice(0, displayLimit)
                          .map((stat, index) => {
                            const metricValue = {
                              viewsIncrease: Number(stat.total_play_count_increase) || 0,
                              over100kViews: Number(stat.videos_over_100k) || 0,
                              postCount: Number(stat.total_posts) || 0
                            }[metric];
                            
                            const isSelected = selectedHashtag === stat.hashtag;
                            
                            return (
                              <TableRow 
                                key={index} 
                                className={cn(
                                  "cursor-pointer transition-colors",
                                  isSelected ? "bg-[#25F4EE]/5 hover:bg-[#25F4EE]/10" : "hover:bg-[#25F4EE]/5"
                                )}
                                onClick={() => setSelectedHashtag(stat.hashtag)}
                              >
                                <TableCell className="py-3">
                                  {index + 1}
                                </TableCell>
                                <TableCell className="py-3">
                                  <div className="flex items-center gap-2">
                                    <Hash className="h-4 w-4 text-[#FE2C55]" />
                                    <div className="font-medium text-sm line-clamp-2">
                                      {stat.hashtag}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="py-3 text-right">{formatNumber(metricValue)}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                    
                    {/* さらに読み込むボタン */}
                    {(() => {
                      const filteredHashtags = hashtagStats.filter(stat => 
                        stat.hashtag && stat.hashtag.trim() !== ''
                      );
                      return filteredHashtags.length > displayLimit ? (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() => setDisplayLimit(prev => prev + 15)}
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                          >
                            さらに15件読み込む
                          </button>
                        </div>
                      ) : null;
                    })()}
                  </CardContent>
                </Card>
              </div>

              {/* 右側: 関連動画 */}
              <div className="w-2/3">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedHashtag ? (
                        <div className="flex items-center gap-2">
                          <span>関連動画:</span>
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-[#FE2C55]" />
                            <span className="font-medium">
                              {hashtagStats.find(stat => stat.hashtag === selectedHashtag)?.hashtag}
                            </span>
                          </div>
                        </div>
                      ) : 'ハッシュタグを選択してください'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedHashtag ? (
                      <div data-hashtag-videos-table>
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs py-2 px-2">サムネイル</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">再生増加数</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">いいね増加数</TableHead>
                              <TableHead className="text-xs py-2 px-2 text-right">投稿日</TableHead>
                              <TableHead className="text-xs py-2 px-2">アカウント</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {hashtagStats.find(stat => stat.hashtag === selectedHashtag)?.top_videos
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
                                            viewsIncrease: Number(video.play_count_increase_2d) ?? 0,
                                            ten_days_increase: Number(video.ten_days_increase) ?? 0,
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
                                  <div className="space-y-1">
                                    <div>
                                      <span className="font-bold">{video.account_name}</span>
                                      {video.display_name && (
                                        <span className="block text-xs text-gray-500">{video.display_name}</span>
                                      )}
                                    </div>
                                    {video.account_type && (
                                      <AccountTypeBadge 
                                        accountType={video.account_type} 
                                        videoType={activeTab}
                                      />
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                            {(!hashtagStats.find(stat => stat.hashtag === selectedHashtag)?.top_videos || 
                              hashtagStats.find(stat => stat.hashtag === selectedHashtag)?.top_videos?.length === 0) && (
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
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Hash className="h-6 w-6 text-gray-400" />
                          <p className="text-gray-500">ハッシュタグを選択すると、関連動画が表示されます</p>
                        </div>
                        <p className="text-[#FE2C55] mt-2">← 左のリストから選択してください</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
