'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUp, Search, ChevronRight, Calendar } from "lucide-react";
import { ImageHover } from '@/components/ui/image-hover';
import { formatNumber } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// TikTokカラーの定義
const TIKTOK_COLORS = {
  pink: '#FE2C55',
  aqua: '#25F4EE',
  black: '#000000',
  white: '#FFFFFF',
};

// 企業ジャンルの型定義
interface CorporateGenre {
  account_type: string;
  recruitment_count: number;
  marketing_count: number;
  total_count: number;
}

// 動画データの型定義
interface CorporateVideo {
  id: string;
  thumbnail_url: string;
  url: string;
  play_count: number;
  play_count_increase: number;
  likes_count_increase: number;
  created_at: string;
  account_name: string;
  display_name?: string;
  account_type: string;
  second_account_type: string;
  title?: string;
  duration?: string;
}

type PurposeType = 'recruitment' | 'marketing';

// 期間選択の選択肢
const periodOptions = [
  { value: '7', label: '直近7日間' },
  { value: '14', label: '直近14日間' },
  { value: '30', label: '直近30日間' },
  { value: '90', label: '直近90日間' }
];

export default function CorporatePage() {
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ジャンル関連の状態
  const [genres, setGenres] = useState<CorporateGenre[]>([]);
  const [filteredGenres, setFilteredGenres] = useState<CorporateGenre[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [activePurpose, setActivePurpose] = useState<PurposeType>('marketing');
  
  // 動画関連の状態
  const [videos, setVideos] = useState<CorporateVideo[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);

  // ジャンル検索のフィルタリング処理を修正
  useEffect(() => {
    let processedGenres = genres;
    
    // 検索フィルタリング
    if (searchQuery.trim() !== '') {
      processedGenres = genres.filter(genre => 
        genre.account_type.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // ソート処理：「その他」を最後に、それ以外は total_count の降順
    const sortedGenres = processedGenres.sort((a, b) => {
      // 「その他」は最後に
      if (a.account_type === 'その他' && b.account_type !== 'その他') return 1;
      if (b.account_type === 'その他' && a.account_type !== 'その他') return -1;
      
      // 両方とも「その他」でない場合は total_count の降順
      return b.total_count - a.total_count;
    });
    
    setFilteredGenres(sortedGenres);
  }, [searchQuery, genres]);

  // 企業ジャンル一覧を取得
  const loadCorporateGenres = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/corporate-genres`);
      const result = await response.json();
      
      if (result.success) {
        // 取得後にソート処理を追加
        const sortedData = result.data.sort((a: CorporateGenre, b: CorporateGenre) => {
          // 「その他」は最後に
          if (a.account_type === 'その他' && b.account_type !== 'その他') return 1;
          if (b.account_type === 'その他' && a.account_type !== 'その他') return -1;
          
          // 両方とも「その他」でない場合は total_count の降順
          return b.total_count - a.total_count;
        });
        
        setGenres(sortedData);
      } else {
        setError('企業ジャンル情報の取得に失敗しました');
      }
    } catch (err) {
      console.error("企業ジャンルAPI呼び出しエラー:", err);
      setError('企業ジャンル情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 企業動画を取得
  const loadCorporateVideos = async (genreType: string, purpose: PurposeType) => {
    try {
      setIsLoadingVideos(true);
      
      const params = new URLSearchParams();
      params.append('account_type', genreType);
      params.append('purpose', purpose === 'recruitment' ? '採用' : '集客');
      params.append('limit', '9'); // 3x3グリッド
      params.append('days', selectedPeriod);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/corporate-videos-by-genre?${params.toString()}`);
      const result = await response.json();
      
      if (result.success) {
        setVideos(result.data);
      } else {
        setError('企業動画の取得に失敗しました');
      }
    } catch (err) {
      console.error("企業動画API呼び出しエラー:", err);
      setError('企業動画の取得に失敗しました');
    } finally {
      setIsLoadingVideos(false);
    }
  };

  // 期間変更時の処理
  useEffect(() => {
    loadCorporateGenres();
  }, [selectedPeriod]);

  // ジャンル選択時の動画ロード
  useEffect(() => {
    if (selectedGenre) {
      loadCorporateVideos(selectedGenre, activePurpose);
    }
  }, [selectedGenre, activePurpose, selectedPeriod]);

  const handleGenreSelect = (genreType: string) => {
    setSelectedGenre(genreType);
    setActivePurpose('marketing'); // デフォルトで集客タブを選択（画像に合わせて）
  };

  const handlePurposeChange = (purpose: string) => {
    setActivePurpose(purpose as PurposeType);
  };

  // 動画時間をフォーマット
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex">
          <div className="w-80 bg-white border-r">
            <Skeleton className="h-20 m-4" />
            <div className="space-y-2 px-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          </div>
          <div className="flex-1 p-6">
            <Skeleton className="h-8 w-[200px] mb-6" />
            <div className="grid grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-[300px]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* 左サイドバー（以前の状態を維持） */}
        <div className="w-80 bg-white border-r border-gray-200 min-h-screen">
          {/* サイドバーヘッダー */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">企業アカウントのジャンル</h2>
              <span className="text-sm text-gray-500">{filteredGenres.length}件</span>
            </div>
            
            {/* 検索ボックス */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="ジャンルを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </div>

          {/* ジャンル一覧 */}
          <div className="overflow-y-auto max-h-[calc(100vh-140px)]">
            {filteredGenres.map((genre, index) => {
              const isSelected = selectedGenre === genre.account_type;
              
              return (
                <div
                  key={index}
                  className={cn(
                    "p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50",
                    isSelected && "bg-blue-50 border-l-4 border-l-blue-500"
                  )}
                  onClick={() => handleGenreSelect(genre.account_type)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{genre.account_type}</span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              );
            })}
            
            {filteredGenres.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                {searchQuery ? '検索結果がありません' : 'ジャンルがありません'}
              </div>
            )}
          </div>
        </div>

        {/* メインコンテンツ（右側をダッシュボード風に変更） */}
        <div className="flex-1">
          {/* ヘッダー */}
          <div className="bg-white border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Corporate</h1>
                <p className="text-gray-600 mt-1">
                  ジャンルを選択すると「集客」「採用」のタブごとに、指定期間の再生数上位動画が表示されます。
                </p>
              </div>
              
              {/* 期間選択 */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* コンテンツエリア */}
          <div className="p-6">
            {selectedGenre ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <div className="flex items-center gap-2">
                      <span>動画一覧:</span>
                      <span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-medium">
                        {selectedGenre}
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* タブ */}
                  <Tabs value={activePurpose} onValueChange={handlePurposeChange} className="w-full">
                    <TabsList className="border-b border-[#25F4EE]/20 mb-4">
                      <TabsTrigger 
                        value="marketing" 
                        className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
                      >
                        集客
                      </TabsTrigger>
                      <TabsTrigger 
                        value="recruitment" 
                        className="data-[state=active]:border-b-2 data-[state=active]:border-[#FE2C55] data-[state=active]:text-[#FE2C55]"
                      >
                        採用
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="marketing">
                      {renderVideoTable()}
                    </TabsContent>
                    
                    <TabsContent value="recruitment">
                      {renderVideoTable()}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="text-gray-400 mb-2">
                    <ChevronRight className="h-12 w-12 mx-auto" />
                  </div>
                  <p className="text-gray-500 text-lg">企業ジャンルを選択してください</p>
                  <p className="text-gray-400 text-sm mt-1">左のリストから選択すると動画が表示されます</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // 動画テーブルを描画する関数（ダッシュボード風テーブル）
  function renderVideoTable() {
    if (isLoadingVideos) {
      return (
        <div className="space-y-2">
          {[...Array(9)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      );
    }

    return (
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
          {videos.slice(0, 9).map((video, index) => (
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
                          accountName: video.account_name,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-[120px] h-[120px] bg-gray-100 rounded flex items-center justify-center">
                    <span className="text-gray-400 text-xs">No Image</span>
                  </div>
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
                  <div className="text-xs text-gray-500 mt-1">
                    {video.account_type} | {video.second_account_type}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {videos.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-4">
                {activePurpose === 'recruitment' ? '採用' : '集客'}動画がありません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }
}