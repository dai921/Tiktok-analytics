"use client";

import { useEffect, useState } from "react";
import { TikTokStats, TikTokVideo } from "@/types/my-account";
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
  
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
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
    scope: ['user.info.basic', 'video.list'].join(','),
    state: generateRandomState(),
  });
  const authorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;

  // バックエンドAPIからデータを取得する関数
  const fetchApiData = async (period: string = reportPeriod) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      console.log(`[DEBUG] 認証トークン: ${token.substring(0, 10)}...（残りは安全のため省略）`);
      console.log(`[DEBUG] API URL: ${API_BASE_URL}/api/tiktok/stats?period=${period}`);
      
      // アカウント統計情報の取得
      const statsResponse = await fetch(`${API_BASE_URL}/api/tiktok/stats?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`[DEBUG] 統計情報レスポンスステータス: ${statsResponse.status} ${statsResponse.statusText}`);
      
      if (!statsResponse.ok) {
        // レスポンスの詳細を取得
        let errorDetail = '';
        try {
          const errorData = await statsResponse.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await statsResponse.text() || `ステータスコード: ${statsResponse.status}`;
        }
        console.error(`[ERROR] 統計情報取得エラー詳細: ${errorDetail}`);
        throw new Error(`統計情報の取得に失敗しました: ${statsResponse.status} - ${errorDetail}`);
      }
      
      const statsData = await statsResponse.json();
      console.log('[DEBUG] 取得した統計データ:', statsData);
      setStats(statsData);
      
      // 動画リストの取得
      console.log(`[DEBUG] 動画リスト取得 URL: ${API_BASE_URL}/api/tiktok/videos?period=${period}`);
      const videosResponse = await fetch(`${API_BASE_URL}/api/tiktok/videos?period=${period}`, {
        headers: {
          'Authorization': `Bearer ${token}` // 認証ヘッダーを追加
        }
      });
      
      console.log(`[DEBUG] 動画リストレスポンスステータス: ${videosResponse.status} ${videosResponse.statusText}`);
      
      if (!videosResponse.ok) {
        // レスポンスの詳細を取得
        let errorDetail = '';
        try {
          const errorData = await videosResponse.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await videosResponse.text() || `ステータスコード: ${videosResponse.status}`;
        }
        console.error(`[ERROR] 動画リスト取得エラー詳細: ${errorDetail}`);
        throw new Error(`動画情報の取得に失敗しました: ${videosResponse.status} - ${errorDetail}`);
      }
      
      const videosData = await videosResponse.json();
      console.log('[DEBUG] 取得した動画データ:', videosData);
      setVideos(videosData);
      
    } catch (err) {
      console.error('[ERROR] APIデータ取得エラー:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました。再度お試しください。');
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
    
    // コードがある場合はバックエンドに送信して認証を完了する
    if (code) {
      const completeAuth = async () => {
        setIsLoading(true);
        try {
          const response = await fetch('/api/auth/tiktok/complete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code }),
          });
          
          if (!response.ok) {
            throw new Error('認証の完了に失敗しました');
          }
          
          const data = await response.json();
          if (data.success) {
            setConnected(true);
            
            // URLからクエリパラメータを削除（履歴をきれいに保つため）
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
            
            // 接続後にAPIデータを取得
            await fetchApiData(reportPeriod);
          } else {
            setError(data.error || 'TikTokとの連携に失敗しました');
          }
        } catch (err) {
          console.error('認証完了エラー:', err);
          setError(err instanceof Error ? err.message : 'TikTokとの連携に失敗しました。再度お試しください。');
        } finally {
          setIsLoading(false);
        }
      };
      
      completeAuth();
    } else if (tiktokConnected === 'true') {
      setConnected(true);
      
      // URLからクエリパラメータを削除（履歴をきれいに保つため）
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // 接続状態を確認
      const checkConnection = async () => {
        try {
          const response = await fetch('/api/auth/tiktok/status');
          const data = await response.json();
          
          if (data.connected) {
            setConnected(true);
            fetchApiData(reportPeriod);
          } else {
            setConnected(false);
            setError('TikTokとの連携が無効です。再度連携してください。');
          }
        } catch (err) {
          console.error('接続状態確認エラー:', err);
          setError('接続状態の確認に失敗しました。再度お試しください。');
        }
      };
      
      checkConnection();
    } else {
      // 初回アクセス時は接続状態を確認
      const checkInitialConnection = async () => {
        try {
          const response = await fetch('/api/auth/tiktok/status');
          const data = await response.json();
          
          if (data.connected) {
            setConnected(true);
            fetchApiData(reportPeriod);
          }
        } catch (err) {
          console.error('初期接続状態確認エラー:', err);
        }
      };
      
      checkInitialConnection();
    }
  }, []);

  // 期間が変更されたらデータを再取得
  useEffect(() => {
    if (connected) {
      fetchApiData(reportPeriod);
    }
  }, [connected, reportPeriod]);

  // レポート期間変更ハンドラー
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPeriod = e.target.value;
    setReportPeriod(newPeriod);
    // 注：useEffectで自動的にfetchApiDataが呼び出されるのでここでは呼び出さない
  };

  // TikTokと連携する関数
  const handleConnect = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // ---- 既存のOAuth認証処理（コメントアウト） ----
      /*
      // ここでURLを構築
      const qs = new URLSearchParams();
      qs.append('client_key', process.env.NEXT_PUBLIC_TT_CLIENT_KEY || 'sbaweandob9d0evs2s');
      qs.append('redirect_uri', `${baseUrl}/api/auth/tiktok/callback`);
      qs.append('response_type', 'code');
      qs.append('scope', ['user.info.basic', 'video.list'].join(','));
      qs.append('state', generateRandomState());
      const generatedAuthorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;
      
      // 認証ページへリダイレクト
      window.location.href = generatedAuthorizeUrl;
      */
      
      // ---- 既存APIからデータを直接取得 ----
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.error('[ERROR] 認証トークンがありません');
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      console.log(`[DEBUG] 連携処理開始 - 認証トークン: ${token.substring(0, 10)}...`);
      console.log(`[DEBUG] 統計情報取得 URL: ${API_BASE_URL}/api/tiktok/stats?period=${reportPeriod}`);
      
      // アカウント統計情報の取得
      const statsResponse = await fetch(`${API_BASE_URL}/api/tiktok/stats?period=${reportPeriod}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`[DEBUG] 統計情報レスポンスステータス: ${statsResponse.status} ${statsResponse.statusText}`);
      
      if (!statsResponse.ok) {
        // レスポンスの詳細を取得
        let errorDetail = '';
        try {
          const errorData = await statsResponse.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await statsResponse.text() || `ステータスコード: ${statsResponse.status}`;
        }
        console.error(`[ERROR] 統計情報取得エラー詳細: ${errorDetail}`);
        throw new Error(`統計情報の取得に失敗しました: ${statsResponse.status} - ${errorDetail}`);
      }
      
      const statsData = await statsResponse.json();
      console.log('[DEBUG] 取得した統計データ:', statsData);
      setStats(statsData);
      
      // 動画リストの取得
      console.log(`[DEBUG] 動画リスト取得 URL: ${API_BASE_URL}/api/tiktok/videos?period=${reportPeriod}`);
      
      const videosResponse = await fetch(`${API_BASE_URL}/api/tiktok/videos?period=${reportPeriod}`, {
        headers: {
          'Authorization': `Bearer ${token}`,  // 認証ヘッダーを追加
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`[DEBUG] 動画リストレスポンスステータス: ${videosResponse.status} ${videosResponse.statusText}`);
      
      if (!videosResponse.ok) {
        // レスポンスの詳細を取得
        let errorDetail = '';
        try {
          const errorData = await videosResponse.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await videosResponse.text() || `ステータスコード: ${videosResponse.status}`;
        }
        console.error(`[ERROR] 動画リスト取得エラー詳細: ${errorDetail}`);
        throw new Error(`動画情報の取得に失敗しました: ${videosResponse.status} - ${errorDetail}`);
      }
      
      const videosData = await videosResponse.json();
      console.log('[DEBUG] 取得した動画データ:', videosData);
      setVideos(videosData);
      
      // 連携成功とマーク
      setConnected(true);
      console.log('[DEBUG] 連携成功');
      
      // エラーをクリア
      setError(null);
    } catch (err) {
      console.error('[ERROR] TikTok連携エラー:', err);
      setError(err instanceof Error ? err.message : 'TikTokとの連携に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // レポートをダウンロードする関数
  const handleDownloadReport = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      console.log(`[DEBUG] レポート生成 URL: ${API_BASE_URL}/api/tiktok/report?period=${reportPeriod}`);
      
      // PDFレポート生成APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/tiktok/report?period=${reportPeriod}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log(`[DEBUG] レポート生成レスポンスステータス: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // レスポンスの詳細を取得
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await response.text() || `ステータスコード: ${response.status}`;
        }
        console.error(`[ERROR] レポート生成エラー詳細: ${errorDetail}`);
        throw new Error(`レポート生成に失敗しました: ${response.status} - ${errorDetail}`);
      }
      
      // Blobとしてレスポンスを取得
      const blob = await response.blob();
      console.log(`[DEBUG] レポートBlobサイズ: ${blob.size} bytes`);
      
      // ダウンロードリンクを作成
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiktok-report-${reportPeriod}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // クリーンアップ
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error('[ERROR] レポートダウンロードエラー:', err);
      setError(err instanceof Error ? err.message : 'レポートの生成に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
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
          </p>

          {connected ? (
            <div>
              <p className="text-green-400 font-semibold mb-2">✅ 連携済み</p>
              <button 
                onClick={() => fetchApiData()}
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

      {/* 統計の詳細表示 */}
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
    </div>
  );
}