'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageHover } from '@/components/ui/image-hover';
import { 
  getAccountBookmarks, 
  removeAccountFromBookmarks, 
  getAccountBookmarksWithDetails, 
  getAccountVideos,
  getAccountTrends,
  BookmarkAccountItem,
  AccountTrendData,
  TrendDataPoint,
  AccountVideo,
  PeriodInfo
} from '@/lib/api/watchlist';
import { cn, formatNumber } from '@/lib/utils';
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

type MetricType = 'play_count_increase' | 'likes_count_increase' | 'comment_count_increase' | 'save_count_increase';

// 指標の表示名を取得する関数
const getMetricDisplayName = (metric: MetricType): string => {
  const displayNames: Record<MetricType, string> = {
    play_count_increase: '再生増加数',
    likes_count_increase: 'いいね増加数',
    comment_count_increase: 'コメント増加数',
    save_count_increase: '保存増加数'
  };
  return displayNames[metric] || metric;
};

// アカウントタイプの表示名を取得する関数
const getAccountTypeDisplayName = (accountType?: string | null): string => {
  if (!accountType) return '-';
  
  const displayNames: Record<string, string> = {
    affi: 'アフィリエイト',
    // 他のタイプも必要に応じて追加できます
  };
  
  return displayNames[accountType] || accountType;
};

export default function AccountWatchlistPage() {
  // ステート定義
  const [activeTab, setActiveTab] = useState("list");
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<BookmarkAccountItem[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accountVideos, setAccountVideos] = useState<AccountVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [selectedAccountType, setSelectedAccountType] = useState<string | null>(null);

  // ランキング関連のステート
  const [metric, setMetric] = useState<MetricType>('play_count_increase');
  const [trendData, setTrendData] = useState<AccountTrendData[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  // 日付範囲関連のステート
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(new Date().setDate(new Date().getDate() - 7)),
    end: new Date(),
  });
  const [tempDateRange, setTempDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [userSelectedDate, setUserSelectedDate] = useState(false);
  const [period, setPeriod] = useState<PeriodInfo | null>(null);

  const initialDateSet = useRef<boolean>(false);

  // アカウント一覧を読み込む
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // APIからアカウントの詳細情報を取得
        const startDate = userSelectedDate ? dateRange.start.toISOString().split('T')[0] : undefined;
        const endDate = userSelectedDate ? dateRange.end.toISOString().split('T')[0] : undefined;
        
        const response = await getAccountBookmarksWithDetails(startDate, endDate);
        
        if (response.success) {
          setAccounts(response.data);
          
          // 日付範囲情報を保存
          if (response.period) {
            setPeriod(response.period);
            
            // ユーザーが日付を選択していない場合はAPIから返された日付を使用
            if (!userSelectedDate && response.period.start_date && response.period.end_date && !initialDateSet.current) {
              initialDateSet.current = true;
              setDateRange({
                start: new Date(response.period.start_date),
                end: new Date(response.period.end_date)
              });
            }
          }
          
          // アカウントタイプの一覧を抽出（フィルタリング用）
          const types = Array.from(new Set(
            response.data
              .filter((item: BookmarkAccountItem) => item.account && item.account.account_type)
              .map((item: BookmarkAccountItem) => item.account!.account_type as string)
          ));
          setAccountTypes(types);
          
          // トレンドデータを読み込む
          loadTrendData(startDate, endDate);
        } else {
          setError('アカウント情報の取得に失敗しました');
        }
      } catch (err) {
        console.error("アカウント情報取得エラー:", err);
        setError('アカウント情報の取得中にエラーが発生しました');
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, [userSelectedDate]);

  // トレンドデータを読み込む
  const loadTrendData = async (startDate?: string, endDate?: string) => {
    try {
      setIsLoadingTrends(true);
      setTrendError(null);
      
      const response = await getAccountTrends(startDate, endDate);
      
      if (response.success) {
        setTrendData(response.data);
        
        // 日付範囲情報を更新（期間が返されている場合）
        if (response.period && (!period || !userSelectedDate)) {
          setPeriod(response.period);
        }
      } else {
        setTrendError('トレンドデータの取得に失敗しました');
      }
    } catch (err) {
      console.error("トレンドデータ取得エラー:", err);
      setTrendError('トレンドデータの取得中にエラーが発生しました');
    } finally {
      setIsLoadingTrends(false);
    }
  };

  // アカウント選択時のハンドラ
  const handleAccountSelect = (accountName: string) => {
    setSelectedAccount(accountName);
    loadAccountVideos(accountName);
  };

  // アカウントの動画を読み込む
  const loadAccountVideos = async (accountName: string) => {
    try {
      setIsLoadingVideos(true);
      
      // 日付範囲の取得
      const startDate = userSelectedDate ? dateRange.start.toISOString().split('T')[0] : 
                        period ? period.start_date : undefined;
      const endDate = userSelectedDate ? dateRange.end.toISOString().split('T')[0] : 
                      period ? period.end_date : undefined;
      
      const response = await getAccountVideos(accountName, startDate, endDate);
      
      if (response.success) {
        setAccountVideos(response.data);
      } else {
        console.error('アカウント動画の取得に失敗しました');
        setAccountVideos([]);
      }
    } catch (err) {
      console.error("アカウント動画取得エラー:", err);
      setAccountVideos([]);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  // アカウント削除ハンドラ
  const handleDeleteAccount = async (accountName: string) => {
    try {
      const response = await removeAccountFromBookmarks(accountName);
      if (response.success) {
        // 成功したら一覧から削除
        setAccounts(prevAccounts => prevAccounts.filter(
          item => item.bookmark.account_name !== accountName
        ));
        
        // 選択中のアカウントを削除した場合はリセット
        if (selectedAccount === accountName) {
          setSelectedAccount(null);
          setAccountVideos([]);
        }
      } else {
        setError('アカウントの削除に失敗しました');
      }
    } catch (err) {
      console.error("アカウント削除エラー:", err);
      setError('アカウント削除中にエラーが発生しました');
    }
  };

  // 日付範囲変更ハンドラ
  const handleDateRangeChange = (newRange: { start: Date; end: Date }) => {
    setTempDateRange(newRange);
  };

  // 日付範囲適用ハンドラ
  const handleDateRangeApply = () => {
    if (tempDateRange) {
      setDateRange(tempDateRange);
      setUserSelectedDate(true);
    }
  };

  // アカウントタイプ変更ハンドラ
  const handleAccountTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedAccountType(value === "all" ? null : value);
  };

  // 指標変更ハンドラ
  const handleMetricChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMetric(e.target.value as MetricType);
  };

  // フィルタリングされたアカウント一覧を取得
  const getFilteredAccounts = () => {
    if (!selectedAccountType) return accounts;
    
    return accounts.filter(item => 
      item.account && item.account.account_type === selectedAccountType
    );
  };

  // 現在の指標でソートされたアカウント一覧を取得
  const getRankedAccounts = () => {
    // トレンドデータの集計値でソート
    return [...trendData]
      .map(account => {
        // 各アカウントの指標の総計を計算
        const totalMetricValue = account.trends.reduce(
          (sum, point) => sum + point[metric], 0
        );
        
        // アカウント情報を取得
        const accountInfo = accounts.find(
          a => a.account && a.account.account_name === account.account_name
        );
        
        return {
          account_name: account.account_name,
          display_name: account.display_name || account.account_name,
          account_type: accountInfo?.account?.account_type || null,
          metric_value: totalMetricValue
        };
      })
      .sort((a, b) => b.metric_value - a.metric_value)
      .slice(0, 10);
  };

  // グラフ表示用のデータを加工
  const getFormattedGraphData = () => {
    // ランキング上位のアカウント一覧
    const topAccounts = getRankedAccounts().slice(0, 5).map(a => a.account_name);
    
    // すべての日付を取得
    const allDates = Array.from(
      new Set(trendData.flatMap(account => account.trends.map(t => t.date)))
    ).sort();
    
    // 日付ごとにデータを整形
    return allDates.map(date => {
      const dataPoint: Record<string, string | number> = { date };
      
      // 各アカウントのデータを追加
      topAccounts.forEach(accountName => {
        const accountData = trendData.find(a => a.account_name === accountName);
        if (accountData) {
          const pointForDate = accountData.trends.find(t => t.date === date);
          dataPoint[accountName] = pointForDate ? pointForDate[metric] : 0;
        }
      });
      
      return dataPoint;
    });
  };

  // 日付フォーマット用の関数
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-[300px] mb-6" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full mb-4" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">アカウントウォッチリスト</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">エラー:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">アカウントウォッチリスト</h1>
      
      {/* フィルターエリア */}
      <div className="flex gap-4 items-center mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap">アカウントタイプ:</label>
          <select 
            value={selectedAccountType || "all"}
            onChange={handleAccountTypeChange}
            className="border rounded p-1 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE]"
          >
            <option value="all">すべて</option>
            {accountTypes.map(type => (
              <option key={type} value={type}>{getAccountTypeDisplayName(type)}</option>
            ))}
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
      
      {/* タブエリア */}
      <Tabs defaultValue="list" className="w-full" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="border-b border-[#25F4EE]/20">
          <TabsTrigger 
            value="list" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
          >
            アカウント一覧
          </TabsTrigger>
          <TabsTrigger 
            value="ranking" 
            className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
          >
            ランキング
          </TabsTrigger>
        </TabsList>

        {/* アカウント一覧タブ */}
        <TabsContent value="list">
          <div className="flex gap-6">
            {/* 左側: アカウント一覧 */}
            <div className="w-1/2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-[#FE2C55]">お気に入りアカウント一覧</CardTitle>
                </CardHeader>
                <CardContent>
                  {getFilteredAccounts().length === 0 ? (
                    <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                      <p>ウォッチリストにアカウントはまだありません</p>
                    </div>
                  ) : (
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2 px-2">アカウント名</TableHead>
                          <TableHead className="text-xs text-right py-2 px-1">再生増加数</TableHead>
                          <TableHead className="text-xs text-right py-2 px-1">いいね増加数</TableHead>
                          <TableHead className="text-xs text-right py-2 px-1">コメント増加数</TableHead>
                          <TableHead className="text-xs text-right py-2 px-1">保存増加数</TableHead>  
                          <TableHead className="text-xs py-2 px-2">タイプ</TableHead>
                          <TableHead className="w-6 p-0"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredAccounts().map((item, index) => {
                          const accountData = item.account;
                          const isSelected = selectedAccount === accountData?.account_name;
                          
                          // トレンドデータからこのアカウントの合計値を計算
                          const accountTrend = trendData.find(
                            td => td.account_name === accountData?.account_name
                          );
                          
                          const totalPlayIncrease = accountTrend 
                            ? accountTrend.trends.reduce((sum, t) => sum + t.play_count_increase, 0)
                            : accountData?.total_play_increase || 0;
                          const totalLikesIncrease = accountTrend 
                            ? accountTrend.trends.reduce((sum, t) => sum + t.likes_count_increase, 0)
                            : accountData?.total_likes_increase || 0;
                          const totalCommentIncrease = accountTrend 
                            ? accountTrend.trends.reduce((sum, t) => sum + t.comment_count_increase, 0)
                            : accountData?.total_comments_increase || 0;
                          const totalSaveIncrease = accountTrend 
                            ? accountTrend.trends.reduce((sum, t) => sum + t.save_count_increase, 0)
                            : accountData?.total_saves_increase || 0;
                          
                          return (
                            <TableRow 
                              key={index} 
                              className={cn(
                                "cursor-pointer transition-colors",
                                isSelected ? "bg-[#25F4EE]/5 hover:bg-[#25F4EE]/10" : "hover:bg-[#25F4EE]/5"
                              )}
                              onClick={() => handleAccountSelect(accountData?.account_name || '')}
                            >
                              <TableCell>
                                <div>
                                  <span className="font-bold">{accountData?.account_name}</span>
                                  {accountData?.display_name && (
                                    <span className="block text-xs text-gray-500">{accountData.display_name}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {totalPlayIncrease > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(totalPlayIncrease)}
                                  </div>
                                ) : (
                                  formatNumber(totalPlayIncrease)
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {totalLikesIncrease > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(totalLikesIncrease)}
                                  </div>
                                ) : (
                                  formatNumber(totalLikesIncrease)
                                )}
                              </TableCell><TableCell className="text-right">
                                {totalCommentIncrease > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(totalCommentIncrease)}
                                  </div>
                                ) : (
                                  formatNumber(totalCommentIncrease)
                                )}
                              </TableCell><TableCell className="text-right">
                                {totalSaveIncrease > 0 ? (
                                  <div className="flex items-center justify-end gap-1 text-green-600">
                                    <ArrowUp className="h-3 w-3" />
                                    {formatNumber(totalSaveIncrease)}
                                  </div>
                                ) : (
                                  formatNumber(totalSaveIncrease)
                                )}
                              </TableCell>
                              <TableCell>{getAccountTypeDisplayName(accountData?.account_type)}</TableCell>
                              <TableCell　className="w-10 px-1">
                                <Button
                                  className="py-1 px-1 bg-[#FE2C55] hover:bg-[#D91847] text-white rounded-md text-xs font-medium flex items-center justify-center transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAccount(accountData?.account_name || '');
                                  }}
                                >
                                  リストから削除
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* 右側: アカウント動画 */}
            <div className="w-1/2">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedAccount ? `${selectedAccount}の動画` : 'アカウントを選択してください'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingVideos ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-[120px] w-full" />
                      ))}
                    </div>
                  ) : selectedAccount ? (
                    accountVideos.length > 0 ? (
                      <div>
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead>サムネイル</TableHead>
                              <TableHead className="text-right">再生増加数</TableHead>
                              <TableHead className="text-right">いいね増加数</TableHead>
                              <TableHead className="text-right">投稿日</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {accountVideos.map((video, index) => (
                              <TableRow key={index}>
                                <TableCell>
                                  {video.thumbnail_url ? (
                                    <div className="relative w-[120px] h-[120px] my-1 mx-auto">
                                      <div className="relative w-full h-full overflow-hidden rounded border-2 border-transparent hover:border-[#FE2C55] transition-colors">
                                        <ImageHover
                                          src={video.thumbnail_url ?? ''}
                                          alt="サムネイル"
                                          videoUrl={video.url ?? ''}
                                          videoData={{
                                            views: video.play_count,
                                            viewsIncrease: video.play_count_increase,
                                            ten_days_increase: 0,
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
                                  {video.likes_count_increase > 0 ? (
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
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="bg-[#2a2a2a] p-8 rounded-md text-center text-gray-400">
                        <p>このアカウントの動画情報がありません</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                      <p className="text-gray-500">アカウントを選択すると、関連動画が表示されます</p>
                      <p className="text-xs text-[#FE2C55] mt-2">← 左のリストから選択してください</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ランキングタブ */}
        <TabsContent value="ranking">
          <div className="space-y-6">
            {/* 指標選択 */}
            <div className="flex items-center gap-2">
              <label className="text-sm whitespace-nowrap">表示指標:</label>
              <select 
                value={metric}
                onChange={handleMetricChange}
                className="border rounded p-1 focus:border-[#25F4EE] focus:ring-1 focus:ring-[#25F4EE]"
              >
                <option value="play_count_increase">再生増加数</option>
                <option value="likes_count_increase">いいね増加数</option>
                <option value="comment_count_increase">コメント増加数</option>
                <option value="save_count_increase">保存増加数</option>
              </select>
            </div>
            
            {/* ランキングとグラフ表示 */}
            <div className="flex gap-6">
              {/* 左側: ランキング */}
              <div className="w-1/3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-[#FE2C55]">
                      {getMetricDisplayName(metric)}ランキング
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>順位</TableHead>
                          <TableHead>アカウント名</TableHead>
                          <TableHead className="text-right">{getMetricDisplayName(metric)}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getRankedAccounts().map((item, index) => (
                          <TableRow 
                            key={index}
                            className="hover:bg-[#25F4EE]/5 transition-colors"
                          >
                            <TableCell className={cn(
                              "py-3",
                              index < 3 && "font-bold text-[#FE2C55]"
                            )}>
                              {index + 1}
                            </TableCell>
                            <TableCell className="py-3">
                              <div>
                                <span className="font-bold">{item.account_name}</span>
                                {item.display_name !== item.account_name && (
                                  <span className="block text-xs text-gray-500">{item.display_name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              {formatNumber(item.metric_value)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {trendData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-4">
                              データがありません
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              
              {/* 右側: トレンドグラフ */}
              <div className="w-2/3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-[#FE2C55]">
                      トレンドグラフ ({getMetricDisplayName(metric)})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTrends ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : trendError ? (
                      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                        <strong className="font-bold">エラー:</strong>
                        <span className="block sm:inline"> {trendError}</span>
                      </div>
                    ) : trendData.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                        <p className="text-gray-500">データがありません</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {getRankedAccounts().slice(0, 5).map((account, index) => (
                            <div key={account.account_name} className="flex items-center gap-1">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: ['#FE2C55', '#25F4EE', '#4CAF50', '#FF9800', '#9C27B0'][index % 5] }}
                              />
                              <span>{account.account_name}</span>
                            </div>
                          ))}
                        </div>
                        <ResponsiveContainer width="100%" height={400}>
                          <LineChart
                            data={getFormattedGraphData()}
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
                            />
                            <Legend />
                            {getRankedAccounts().slice(0, 5).map((account, index) => (
                              <Line
                                key={account.account_name}
                                type="monotone"
                                dataKey={account.account_name}
                                name={account.account_name}
                                stroke={['#FE2C55', '#25F4EE', '#4CAF50', '#FF9800', '#9C27B0'][index % 5]}
                                activeDot={{ r: 8 }}
                                strokeWidth={2}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 