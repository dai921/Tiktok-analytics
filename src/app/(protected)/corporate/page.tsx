'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUp, Search, ChevronRight, Calendar } from "lucide-react";
import { ImageHover } from '@/components/ui/image-hover';
import { formatNumber } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
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
        {/* 左サイドバー */}
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

        {/* メインコンテンツ */}
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
              <div>
                {/* ジャンル表示と再生数表示アイコン */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">ジャンル</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-medium">
                      {selectedGenre}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <ArrowUp className="h-4 w-4" />
                    <span>再生数の上位動画を表示</span>
                  </div>
                </div>

                {/* タブ */}
                <Tabs value={activePurpose} onValueChange={handlePurposeChange} className="w-full">
                  <TabsList className="grid w-48 grid-cols-2 mb-6">
                    <TabsTrigger value="marketing">集客</TabsTrigger>
                    <TabsTrigger value="recruitment">採用</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="marketing">
                    {renderVideoGrid()}
                  </TabsContent>
                  
                  <TabsContent value="recruitment">
                    {renderVideoGrid()}
                  </TabsContent>
                </Tabs>
              </div>
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

  // 動画グリッドを描画する関数
  function renderVideoGrid() {
    if (isLoadingVideos) {
      return (
        <div className="grid grid-cols-3 gap-6">
          {[...Array(9)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="w-full h-48" />
              <CardContent className="p-4">
                <Skeleton className="h-4 mb-2" />
                <Skeleton className="h-3 mb-1" />
                <Skeleton className="h-3" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-6">
        {videos.slice(0, 9).map((video, index) => (
          <Card key={index} className="overflow-hidden hover:shadow-lg transition-shadow">
            {/* サムネイルエリア */}
            <div className="relative">
              {video.thumbnail_url ? (
                <div className="relative w-full h-48 overflow-hidden">
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
                  
                  {/* 動画時間 */}
                  <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                    {video.duration || '06:46'}
                  </div>
                  
                  {/* ランキング番号 */}
                  <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full font-bold">
                    #{index + 1}
                  </div>
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400">No Image</span>
                </div>
              )}
            </div>

            {/* カード情報 */}
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-2 line-clamp-2">
                {video.title || `${selectedGenre}の${activePurpose === 'marketing' ? '集客' : '採用'}成功事例 ${index + 1}`}
              </h3>
              
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span className="font-medium">{video.account_name}</span>
                <span>
                  {video.created_at
                    ? (() => {
                        const d = new Date(video.created_at);
                        return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
                      })()
                    : ''}
                </span>
              </div>
              
              <div className="text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <span>再生数</span>
                  <span className="font-semibold text-green-600">
                    {formatNumber(video.play_count_increase)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {videos.length === 0 && (
          <div className="col-span-3 text-center py-12">
            <p className="text-gray-500">
              {activePurpose === 'recruitment' ? '採用' : '集客'}動画がありません
            </p>
          </div>
        )}
      </div>
    );
  }
}