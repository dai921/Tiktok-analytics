'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ArrowUp } from "lucide-react";
import { CorporateAccountStats } from '@/types/corporate';
import { ImageHover } from '@/components/ui/image-hover';
import { fetchCorporateAccountStats } from '@/lib/api/corporate';
import { formatNumber } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AccountTypeBadge } from '@/components/ui/badge';

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

export default function CorporatePage() {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(),
  });
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('viewsIncrease');
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [corporateAccountStats, setCorporateAccountStats] = useState<CorporateAccountStats[]>([]);
  const [displayLimit, setDisplayLimit] = useState(15);
  
  // 指標ごとにデータをキャッシュするための状態
  const [cachedAccountStats, setCachedAccountStats] = useState<Record<MetricKey, CorporateAccountStats[]>>({
    viewsIncrease: [],
    over100kViews: [],
    postCount: []
  });

  useEffect(() => {
    if (!dataLoaded || userSelectedDate) {
      const loadCorporateAccountStats = async () => {
        try {
          console.log("企業アカウント統計API呼び出し開始:", { userSelectedDate, dataLoaded, metric });
          setIsLoading(true);
          setError(null);
          
          // キャッシュ内にすでにデータがあるか確認
          if (cachedAccountStats[metric]?.length > 0 && userSelectedDate) {
            console.log("キャッシュからデータを使用:", metric);
            setCorporateAccountStats(cachedAccountStats[metric]);
            setIsLoading(false);
            return;
          }
          
          const result = await fetchCorporateAccountStats(
            userSelectedDate ? dateRange.start.toISOString().split('T')[0] : null,
            userSelectedDate ? dateRange.end.toISOString().split('T')[0] : null,
            metric // 現在選択中の指標を送信
          );

          console.log("企業アカウント統計APIレスポンス:", result);
          setCorporateAccountStats(result.data);
          
          // 結果をキャッシュに保存
          setCachedAccountStats(prev => ({
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
          console.error("企業アカウント統計API呼び出しエラー:", err);
          setError('企業アカウント統計情報の取得に失敗しました');
        } finally {
          setIsLoading(false);
        }
      };

      loadCorporateAccountStats();
    } else {
      console.log("企業アカウント統計API呼び出しがスキップされました:", { userSelectedDate, dataLoaded, metric });
    }
  }, [userSelectedDate, dataLoaded, dateRange, metric, cachedAccountStats]);

  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
  };

  const handleDateRangeApply = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setUserSelectedDate(true);
      setDisplayLimit(15);
      setCachedAccountStats({
        viewsIncrease: [],
        over100kViews: [],
        postCount: []
      });
      setDataLoaded(false);
    }
  };

  // 日付フォーマット用の関数
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
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
      <h1 className="text-2xl font-bold mb-6">企業アカウント分析</h1>

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
          <div className="w-[280px]">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              onApply={handleDateRangeApply}
            />
          </div>
        </div>

        {/* ランキングエリア */}
        <div className="flex gap-6">
          {/* 左側: ランキングテーブル */}
          <div className="w-1/3">
            <Card>
              <CardHeader>
                <CardTitle>アカウントタイプランキング</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-2 px-2">順位</TableHead>
                      <TableHead className="text-xs py-2 px-2">アカウントタイプ</TableHead>
                      <TableHead className="text-xs py-2 px-2 text-right">{getMetricLabel(metric)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* その他以外のアカウントタイプを表示 */}
                    {corporateAccountStats
                      .filter(stat => stat.account_type && stat.account_type.trim() !== '' && stat.account_type !== 'その他')
                      .slice(0, displayLimit)
                      .map((stat, index) => {
                        const metricValue = {
                          viewsIncrease: Number(stat.total_play_count_increase) || 0,
                          over100kViews: Number(stat.videos_over_100k) || 0,
                          postCount: Number(stat.total_posts) || 0
                        }[metric];
                        
                        const isSelected = selectedAccountType === stat.account_type;
                        
                        return (
                          <TableRow 
                            key={index} 
                            className={cn(
                              "cursor-pointer transition-colors",
                              isSelected ? "bg-[#25F4EE]/5 hover:bg-[#25F4EE]/10" : "hover:bg-[#25F4EE]/5"
                            )}
                            onClick={() => setSelectedAccountType(stat.account_type)}
                          >
                            <TableCell className="py-3">
                              {index + 1}
                            </TableCell>
                            <TableCell className="py-3">
                              <AccountTypeBadge accountType={stat.account_type} />
                            </TableCell>
                            <TableCell className="py-3 text-right">{formatNumber(metricValue)}</TableCell>
                          </TableRow>
                        );
                      })}
                    
                    {/* その他カテゴリが存在する場合、参考記録として表示 */}
                    {corporateAccountStats.find(stat => stat.account_type === 'その他') && (
                      <>
                        {/* 区切り線 */}
                        <TableRow>
                          <TableCell colSpan={3} className="py-2">
                            <div className="border-t border-dashed border-gray-200 my-1"></div>
                          </TableCell>
                        </TableRow>
                        
                        {/* 参考記録として「その他」を表示 */}
                        {(() => {
                          const otherStat = corporateAccountStats.find(stat => stat.account_type === 'その他')!;
                          const metricValue = {
                            viewsIncrease: Number(otherStat.total_play_count_increase) || 0,
                            over100kViews: Number(otherStat.videos_over_100k) || 0,
                            postCount: Number(otherStat.total_posts) || 0
                          }[metric];
                          
                          const isSelected = selectedAccountType === otherStat.account_type;
                          
                          return (
                            <TableRow 
                              key="other-reference"
                              className={cn(
                                "cursor-pointer transition-colors",
                                isSelected ? "bg-[#25F4EE]/5 hover:bg-[#25F4EE]/10" : "hover:bg-[#25F4EE]/5"
                              )}
                              onClick={() => setSelectedAccountType(otherStat.account_type)}
                            >
                              <TableCell className="py-3">
                                <span className="text-xs"></span>
                              </TableCell>
                              <TableCell className="py-3">
                                <AccountTypeBadge accountType={otherStat.account_type} />
                              </TableCell>
                              <TableCell className="py-3 text-right">{formatNumber(metricValue)}</TableCell>
                            </TableRow>
                          );
                        })()}
                      </>
                    )}
                  </TableBody>
                </Table>
                
                {/* さらに読み込むボタン */}
                {(() => {
                  const filteredAccountTypes = corporateAccountStats.filter(stat => 
                    stat.account_type && stat.account_type.trim() !== '' && stat.account_type !== 'その他'
                  );
                  return filteredAccountTypes.length > displayLimit ? (
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
                  {selectedAccountType ? (
                    <div className="flex items-center gap-2">
                      <span>関連動画:</span>
                      <AccountTypeBadge accountType={selectedAccountType} />
                    </div>
                  ) : 'アカウントタイプを選択してください'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedAccountType ? (
                  <div data-account-type-videos-table>
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
                        {corporateAccountStats.find(stat => stat.account_type === selectedAccountType)?.top_videos
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
                              <div>
                                <span className="font-bold">{video.account_name}</span>
                                {video.display_name && (
                                  <span className="block text-xs text-gray-500">{video.display_name}</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!corporateAccountStats.find(stat => stat.account_type === selectedAccountType)?.top_videos || 
                          corporateAccountStats.find(stat => stat.account_type === selectedAccountType)?.top_videos?.length === 0) && (
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
                    <p className="text-gray-500">アカウントタイプを選択すると、関連動画が表示されます</p>
                    <p className="text-[#FE2C55] mt-2">← 左のリストから選択してください</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}