"use client";

import { useEffect, useState } from "react";
import { TikTokStats, TikTokVideo, generateMockStats, generateMockVideos, mockApiDelay } from "@/lib/mock-data";
import Image from "next/image";

// ISR・SSG を完全に無効化（常にリクエスト時に実行）
export const dynamic = 'force-dynamic';

export default function MyAccountPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<TikTokStats | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('30d');
  const [sortField, setSortField] = useState<'viewCount' | 'viewGrowth' | 'createTime'>('viewGrowth');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // desc: 降順, asc: 昇順
  const [ngrokUrl, setNgrokUrl] = useState('');
  
  /** ---------- 認可 URL ---------- */
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : '');
    
  // ランダムな文字列を生成（ブラウザのcrypto APIを使用）
  const generateRandomState = () => {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  };
  
  const qs = new URLSearchParams({
    client_key: process.env.NEXT_PUBLIC_TT_CLIENT_KEY || 'mock-client-key',
    redirect_uri: `${baseUrl}/api/auth/tiktok/callback`,
    response_type: 'code',
    scope: ['user.info.basic', 'video.list', 'account_insights.read'].join(','),
    state: generateRandomState(),
  });
  const authorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;

  // モックデータを取得する関数
  const fetchMockData = async (period: string = reportPeriod) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 期間に応じてデータを調整する係数
      let periodMultiplier = 1.0;
      let growthMultiplier = 0.0;
      
      // 期間に応じて異なる数値を返す
      if (period === '7d') {
        periodMultiplier = 0.6; // 7日間は少なめ
        growthMultiplier = 0.02; // 増加率 2%
      } else if (period === '30d') {
        periodMultiplier = 1.0; // 30日間は標準
        growthMultiplier = 0.05; // 増加率 5%
      } else {
        periodMultiplier = 1.8; // 90日間は多め
        growthMultiplier = 0.12; // 増加率 12%
      }
      
      // わずかにランダム性を持たせる
      const randomVariation = 0.9 + Math.random() * 0.2; // 0.9〜1.1の範囲
      
      // 基本統計値
      const followerCount = Math.floor(12500 * periodMultiplier * randomVariation);
      const likeCount = Math.floor(87300 * periodMultiplier * randomVariation);
      const avgViewCount = Math.floor(5600 * periodMultiplier * randomVariation);
      const engagementRate = 4.2 * (periodMultiplier > 1 ? 0.9 : 1.1) * randomVariation;
      
      // 期間内増加分
      const followerGrowth = Math.floor(followerCount * growthMultiplier * (0.8 + Math.random() * 0.4));
      const likeGrowth = Math.floor(likeCount * growthMultiplier * (0.8 + Math.random() * 0.4));
      const viewGrowth = Math.floor(avgViewCount * 8 * growthMultiplier * (0.8 + Math.random() * 0.4));
      
      // API呼び出しをシミュレート
      const mockStats = await mockApiDelay({
        followerCount,
        followerGrowth,
        likeCount,
        likeGrowth,
        avgViewCount,
        viewGrowth,
        engagementRate
      }, 800, 1500);
      
      // 期間に応じて生成する動画数を変える
      const videoCount = period === '7d' ? 3 : period === '30d' ? 8 : 15;
      const mockVideos = await mockApiDelay(generateMockVideos(videoCount), 1200, 2000);
      
      setStats(mockStats);
      setVideos(mockVideos);
    } catch (err) {
      console.error('モックデータ取得エラー:', err);
      setError('データの取得に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // TikTok連携状態を確認するuseEffect
  useEffect(() => {
    // URLクエリパラメータからtiktok_connectedを確認
    const params = new URLSearchParams(window.location.search);
    const tiktokConnected = params.get('tiktok_connected');
    const code = params.get('code'); // TikTok認証後に返されるコード
    
    // tiktok_connected=trueまたはcodeパラメータがある場合（認証後）
    if (tiktokConnected === 'true' || code) {
      setConnected(true);
      
      // URLからクエリパラメータを削除（履歴をきれいに保つため）
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // 接続後にモックデータを取得
      fetchMockData(reportPeriod);
    }
  }, []);

  // 初回ロード時とデータ更新時にモックデータを取得
  useEffect(() => {
    if (connected) {
      fetchMockData(reportPeriod);
    }
  }, [connected, reportPeriod]);

  // レポート期間変更ハンドラー
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value;
    setReportPeriod(newPeriod);
    // 注：useEffectで自動的にfetchMockDataが呼び出されるのでここでは呼び出さない
  };

  // TikTokと連携する関数
  const handleConnect = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // ここでURLを構築
    const qs = new URLSearchParams();
    qs.append('client_key', process.env.NEXT_PUBLIC_TT_CLIENT_KEY || 'sbaweandob9d0evs2s');
    qs.append('redirect_uri', `${baseUrl}/api/auth/tiktok/callback`);
    qs.append('response_type', 'code');
    qs.append('scope', ['user.info.basic', 'video.list'].join(','));
    qs.append('state', generateRandomState());
    const generatedAuthorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;
    
    console.log('TikTok OAuth設定情報:');
    console.log('- 完全なauthorizeUrl:', generatedAuthorizeUrl);
    
    // 認証ページへリダイレクト
    window.location.href = generatedAuthorizeUrl;
  };

  // モックレポートをダウンロードする関数
  const handleDownloadReport = () => {
    // 実際のダウンロードの代わりにアラートを表示
    alert(`${reportPeriod}のレポートをダウンロードします（モック）`);
  };

  // 数値フォーマット関数
  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '—';
    return new Intl.NumberFormat('ja-JP').format(num);
  };

  const formatPercent = (value?: number) => {
    if (value === undefined || value === null) return '—';
    return `${value.toFixed(2)}%`;
  };

  // 日付フォーマット関数
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // ソート関数
  const sortVideos = (videos: TikTokVideo[], field: 'viewCount' | 'viewGrowth' | 'createTime', direction: 'asc' | 'desc') => {
    return [...videos].sort((a, b) => {
      if (field === 'viewCount') {
        return direction === 'desc' ? b.viewCount - a.viewCount : a.viewCount - b.viewCount;
      } else if (field === 'viewGrowth') {
        return direction === 'desc' ? b.viewGrowth - a.viewGrowth : a.viewGrowth - b.viewGrowth;
      } else {
        return direction === 'desc' 
          ? new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
          : new Date(a.createTime).getTime() - new Date(b.createTime).getTime();
      }
    });
  };

  // ソート切り替えハンドラー
  const handleSortChange = (field: 'viewCount' | 'viewGrowth' | 'createTime') => {
    if (field === sortField) {
      // 同じフィールドをクリックした場合、ソート方向を切り替え
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // 違うフィールドをクリックした場合、そのフィールドで降順にソート
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // 選択された期間に応じてソートされた動画を取得
  const getSortedVideos = () => {
    // ソートされた動画のリスト
    return sortVideos(videos, sortField, sortDirection);
  };

  // ngrokが起動したらURLを保存する関数
  const saveNgrokUrl = () => {
    if (ngrokUrl) {
      localStorage.setItem('ngrokUrl', ngrokUrl);
      alert('ngrok URLを保存しました。TikTok連携ボタンを押してください。');
    }
  };

  /** ---------- 以降 JSX ---------- */
  return (
    <div className="container mx-auto px-4 py-8">
      {/* ---- ページタイトル ---- */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">自アカウント分析</h1>
        <p className="text-gray-400">TikTokアカウントのパフォーマンス指標とデータ分析</p>
      </div>

      {/* ---- アカウント概要 ---- */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white mb-2">アカウント概要</h2>
        {!connected && (
          <p className="text-gray-400 text-sm mb-4">TikTokと連携すると統計データが表示されます</p>
        )}
        {connected && (
          <p className="text-gray-400 text-sm mb-4">
            期間：{reportPeriod === '7d' ? '過去7日間' : reportPeriod === '30d' ? '過去30日間' : '過去90日間'}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 mb-8">
        {/* 総フォロワー数 */}
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
          <h3 className="text-gray-400 text-sm mb-1">フォロワー数</h3>
          {isLoading ? (
            <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
          ) : (
            <>
              <p className="text-2xl font-bold text-white">{formatNumber(stats?.followerCount)}</p>
              {stats?.followerGrowth && stats.followerGrowth > 0 && (
                <p className="text-sm text-green-400 mt-1">
                  +{formatNumber(stats.followerGrowth)} <span className="text-gray-500 text-xs">期間内</span>
                </p>
              )}
            </>
          )}
        </div>
        
        {/* 総いいね数 */}
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
          <h3 className="text-gray-400 text-sm mb-1">いいね数</h3>
          {isLoading ? (
            <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
          ) : (
            <>
              <p className="text-2xl font-bold text-white">{formatNumber(stats?.likeCount)}</p>
              {stats?.likeGrowth && stats.likeGrowth > 0 && (
                <p className="text-sm text-green-400 mt-1">
                  +{formatNumber(stats.likeGrowth)} <span className="text-gray-500 text-xs">期間内</span>
                </p>
              )}
            </>
          )}
        </div>
        
        {/* 平均視聴回数 */}
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
          <h3 className="text-gray-400 text-sm mb-1">平均視聴回数/動画</h3>
          {isLoading ? (
            <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
          ) : (
            <>
              <p className="text-2xl font-bold text-white">{formatNumber(stats?.avgViewCount)}</p>
              {stats?.viewGrowth && stats.viewGrowth > 0 && (
                <p className="text-sm text-green-400 mt-1">
                  +{formatNumber(stats.viewGrowth)} <span className="text-gray-500 text-xs">視聴数増加</span>
                </p>
              )}
            </>
          )}
        </div>
        
        {/* エンゲージメント率 */}
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
          <h3 className="text-gray-400 text-sm mb-1">エンゲージメント率</h3>
          {isLoading ? (
            <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
          ) : (
            <p className="text-2xl font-bold text-white">{formatPercent(stats?.engagementRate)}</p>
          )}
        </div>
      </div>

      {/* ---- 連携 & レポート ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 連携 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">アカウント連携</h2>
          <p className="text-gray-400 mb-4">
            分析を開始するには、TikTokビジネスアカウントと連携してください。
            <br />
            <span className="text-yellow-500 text-sm">※現在はモックデータで動作します</span>
          </p>

          {connected ? (
            <div>
              <p className="text-green-400 font-semibold mb-2">✅ 連携済み</p>
              <button 
                onClick={() => fetchMockData()}
                className="bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? '更新中...' : 'データを更新'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleConnect}
                className="bg-[#FE2C55] text-white py-2 px-4 rounded-md hover:bg-[#FE2C55]/90 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? '連携中...' : 'TikTokと連携する'}
              </button>
            </div>
          )}
        </div>

        {/* レポート */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">レポート生成</h2>
          <p className="text-gray-400 mb-4">
            期間を選択してアカウントパフォーマンスレポートを生成します。
            <br />
            <span className="text-yellow-500 text-sm">※現在はモックデータで動作します</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <select 
              className="bg-gray-800 text-white rounded p-2 border border-gray-700"
              disabled={!connected || isLoading}
              value={reportPeriod}
              onChange={handlePeriodChange}
            >
              <option value="7d">過去7日間</option>
              <option value="30d">過去30日間</option>
              <option value="90d">過去90日間</option>
            </select>
            
            <button
              disabled={!connected || isLoading}
              onClick={handleDownloadReport}
              className={`py-2 px-4 rounded-md transition-colors ${
                connected && !isLoading
                  ? 'bg-[#FE2C55] text-white hover:bg-[#FE2C55]/90'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? '読み込み中...' : 'レポート生成'}
            </button>
          </div>
        </div>
      </div>

      {/* モック統計の詳細表示 */}
      {connected && stats && videos.length > 0 && (
        <div className="mt-8 bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
            <h2 className="text-xl font-bold text-white">
              投稿パフォーマンス
              <span className="ml-2 bg-[#FE2C55] text-white text-xs px-2 py-1 rounded-full">
                {reportPeriod === '7d' ? '過去7日間' : reportPeriod === '30d' ? '過去30日間' : '過去90日間'}
              </span>
            </h2>
            
            <div className="text-sm text-gray-400 mt-2 sm:mt-0">
              ソート: 
              <button 
                onClick={() => handleSortChange('viewGrowth')}
                className={`ml-2 px-3 py-1 rounded-md transition-colors ${
                  sortField === 'viewGrowth' 
                    ? 'bg-[#FE2C55] text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                期間内増加量
                {sortField === 'viewGrowth' && (
                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
              <button 
                onClick={() => handleSortChange('viewCount')}
                className={`ml-2 px-3 py-1 rounded-md transition-colors ${
                  sortField === 'viewCount' 
                    ? 'bg-[#FE2C55] text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                総視聴回数
                {sortField === 'viewCount' && (
                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
              <button 
                onClick={() => handleSortChange('createTime')}
                className={`ml-2 px-3 py-1 rounded-md transition-colors ${
                  sortField === 'createTime' 
                    ? 'bg-[#FE2C55] text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                投稿日
                {sortField === 'createTime' && (
                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                )}
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="text-xs bg-gray-900 text-gray-300">
                <tr>
                  <th className="px-6 py-4 text-left">投稿日</th>
                  <th className="px-6 py-4 text-left">タイトル</th>
                  <th className="px-6 py-4 text-right">総視聴回数</th>
                  <th className="px-6 py-4 text-right">期間内増加量</th>
                  <th className="px-6 py-4 text-right">いいね数</th>
                  <th className="px-6 py-4 text-right">コメント数</th>
                  <th className="px-6 py-4 text-right">シェア数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {getSortedVideos().map((video, index) => {
                  // 期間内の増加率を計算（視覚効果用）
                  const growthRate = video.viewGrowth / video.viewCount;
                  let growthClass = 'text-gray-400'; // デフォルト
                  let growthIcon = '';
                  
                  if (growthRate > 0.5) {
                    growthClass = 'text-green-400 font-medium';
                    growthIcon = '🔥'; // 急上昇
                  } else if (growthRate > 0.2) {
                    growthClass = 'text-green-500';
                    growthIcon = '↑'; // 上昇
                  } else if (growthRate < 0.05) {
                    growthClass = 'text-gray-500';
                  }

                  // 背景色を交互に変える
                  const rowBgClass = index % 2 === 0 ? 'bg-[#1a1a1a]' : 'bg-[#242424]';
                  
                  return (
                    <tr key={video.id} className={`${rowBgClass} hover:bg-gray-800 transition-colors`}>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                        {formatDate(video.createTime)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white font-medium">
                          {video.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap text-white">
                        {formatNumber(video.viewCount)}
                      </td>
                      <td className={`px-6 py-4 text-right whitespace-nowrap ${growthClass}`}>
                        {formatNumber(video.viewGrowth)} {growthIcon}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                        {formatNumber(video.likeCount)}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                        {formatNumber(video.commentCount)}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                        {formatNumber(video.shareCount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* データ件数表示 */}
          <div className="mt-4 text-sm text-gray-400">
            合計 {videos.length} 件の投稿
          </div>
        </div>
      )}

      <div className="mb-4 mt-4">
        <label className="block text-gray-400 text-sm mb-2">
          ngrok URL（開発環境用）
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={ngrokUrl}
            onChange={(e) => setNgrokUrl(e.target.value)}
            placeholder="https://xxxx.ngrok.io"
            className="bg-gray-800 text-white rounded p-2 border border-gray-700 flex-grow"
          />
          <button
            onClick={saveNgrokUrl}
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-500 transition-colors"
          >
            保存
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          ※ Docker起動後にngrokで取得したURLを入力してください
        </p>
      </div>
    </div>
  );
}