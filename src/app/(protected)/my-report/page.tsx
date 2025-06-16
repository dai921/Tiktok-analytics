"use client";

import { useEffect, useState } from "react";
import { TikTokStats, TikTokVideo } from "@/types/my-report";
import Image from "next/image";
import { DateRangePicker } from "@/components/ui/date-range-picker";

// ISR・SSG を完全に無効化（常にリクエスト時に実行）
export const dynamic = 'force-dynamic';

// TikTokアカウント情報の型定義
interface TikTokAccount {
  id: string;
  openId: string;
  displayName: string;
  linkedAt: string;
}

export default function MyAccountPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<TikTokStats | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('30d');
  const [sortField, setSortField] = useState<'viewCount' | 'viewGrowth' | 'createTime'>('viewGrowth');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // desc: 降順, asc: 昇順
  const [activeTab, setActiveTab] = useState<'stats' | 'videos'>('stats'); // 追加：タブUIのstate
  
  // アカウント情報関連の状態
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<TikTokAccount | null>(null);
  
  // 日付選択用の状態
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30日前
    end: new Date() // 今日
  });
  
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

  // 連携済みアカウント一覧を取得する関数
  const fetchConnectedAccounts = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      // TikTok連携状態を確認
      const response = await fetch(`${API_BASE_URL}/api/tiktok/connection/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await response.text() || `ステータスコード: ${response.status}`;
        }
        console.error(`[ERROR] TikTok連携状態取得エラー詳細: ${errorDetail}`);
        return;
      }
      
      const statusData = await response.json();
      console.log('[INFO] 取得したTikTok連携状態:', statusData);
      
      if (statusData.connected && statusData.account) {
        // アカウント情報を設定
        const account = {
          id: statusData.account.id || '1',
          openId: statusData.account.openId || statusData.account.open_id || 'unknown',
          displayName: statusData.account.displayName || statusData.account.display_name || 'TikTokアカウント',
          linkedAt: statusData.account.linkedAt || statusData.account.linked_at || new Date().toISOString()
        };
        
        console.log('[INFO] アカウント情報:', account);
        setAccounts([account]);
        setActiveAccount(account);
        setConnected(true);
        
        // アカウントの統計データと動画データを取得
        await fetchApiData(reportPeriod, account.openId);
      } else {
        setConnected(false);
      }
    } catch (err) {
      console.error('[ERROR] TikTok連携状態取得エラー:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // アカウントを切り替える関数
  const handleAccountChange = async (account: TikTokAccount) => {
    setIsLoading(true);
    setActiveAccount(account);
    await fetchApiData(reportPeriod, account.openId);
    setIsLoading(false);
  };

  // TikTokと連携する関数
  const handleConnect = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // セッション情報を使ってデータを取得
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      // 連携状態を設定してDBからデータを取得
      fetchConnectedAccounts();
      
    } catch (err) {
      console.error('[ERROR] 連携処理エラー:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  // バックエンドAPIからデータを取得する関数
  const fetchApiData = async (period: string = reportPeriod, openId?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      // openIdパラメータを追加（指定されている場合）
      const openIdParam = openId ? `&open_id=${openId}` : '';
      
      console.log(`[DEBUG] 認証トークン: ${token.substring(0, 10)}...（残りは安全のため省略）`);
      console.log(`[DEBUG] API URL: ${API_BASE_URL}/api/tiktok/stats?period=${period}${openIdParam}`);
      
      // アカウント統計情報の取得
      const statsResponse = await fetch(`${API_BASE_URL}/api/tiktok/stats?period=${period}${openIdParam}`, {
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
      
      // 動画リストの取得
      console.log(`[DEBUG] 動画リスト取得 URL: ${API_BASE_URL}/api/tiktok/videos?period=${period}${openIdParam}`);
      const videosResponse = await fetch(`${API_BASE_URL}/api/tiktok/videos?period=${period}${openIdParam}`, {
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
      
      // thumbnailUrlをオブジェクト型に変換
      const videosWithObjThumbnail = videosData.map((video: any) => ({
        ...video,
        thumbnailUrl: video.thumbnailUrl
          ? { url: video.thumbnailUrl, valueType: 'IMAGE' }
          : null,
      }));
      
      // 統計データを計算・拡張
      if (statsData && videosWithObjThumbnail && videosWithObjThumbnail.length > 0) {
        // 総再生数を計算
        const totalPlayCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.viewCount || 0), 0);
        // 総コメント数を計算
        const commentCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.commentCount || 0), 0);
        // 総シェア数を計算（保存数として代用）
        const saveCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.shareCount || 0), 0);
        
        // statsDataに拡張データを追加
        statsData.totalPlayCount = totalPlayCount;
        statsData.commentCount = commentCount;
        statsData.saveCount = saveCount;
        statsData.videosCount = videosWithObjThumbnail.length;
      }
      
      setStats(statsData);
      setVideos(videosWithObjThumbnail);
      
    } catch (err) {
      console.error('[ERROR] APIデータ取得エラー:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // TikTok連携状態を確認するuseEffect
  useEffect(() => {
    // 初期表示時にデータ取得を実行
    const initializeData = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
          console.warn('[WARN] 認証トークンがありません');
          return;
        }
        
        // TikTok連携状態を確認
        const statusResponse = await fetch(`${API_BASE_URL}/api/tiktok/connection/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log('[INFO] TikTok連携状態:', statusData);
          
          if (statusData.connected && statusData.account) {
            // アカウント情報を設定
            const account = {
              id: statusData.account.id || '1',
              openId: statusData.account.openId || statusData.account.open_id || 'unknown',
              displayName: statusData.account.displayName || statusData.account.display_name || 'TikTokアカウント',
              linkedAt: statusData.account.linkedAt || statusData.account.linked_at || new Date().toISOString()
            };
            
            setAccounts([account]);
            setActiveAccount(account);
            setConnected(true);
            
            // アカウントの統計データと動画データを取得
            await fetchApiData(reportPeriod, account.openId);
          }
        } else {
          console.warn('[WARN] TikTok連携状態取得エラー:', statusResponse.status);
        }
      } catch (err) {
        console.error('[ERROR] 初期化エラー:', err);
      }
    };
    
    // URLクエリパラメータからtiktok_connectedを確認
    const params = new URLSearchParams(window.location.search);
    const tiktokConnected = params.get('tiktok_connected');
    const code = params.get('code'); // TikTok認証後に返されるコード
    
    // テスト環境ではコードは無視
    if (code) {
      console.log('[TEST] 認証コードは無視します:', code);
      initializeData();
    } else if (tiktokConnected === 'true') {
      setConnected(true);
      
      // URLからクエリパラメータを削除（履歴をきれいに保つため）
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      initializeData();
    } else {
      // 初回アクセス時は初期化関数を実行
      initializeData();
    }
  }, []);

  // 日付範囲が変わったときにデータを再取得
  useEffect(() => {
    if (connected && dateRange.start && dateRange.end && activeAccount) {
      // 日付範囲から期間を計算
      const diffTime = Math.abs(dateRange.end.getTime() - dateRange.start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // 期間に近い事前定義された期間を使用するか、カスタム期間を使用
      let period = 'custom';
      if (diffDays <= 7) {
        period = '7d';
      } else if (diffDays <= 30) {
        period = '30d';
      } else if (diffDays <= 90) {
        period = '90d';
      }
      
      // カスタム期間の場合、APIにstart_dateとend_dateを渡す必要があるかもしれません
      // 現在のAPIが期間のみをサポートしている場合は、最も近い事前定義期間を使用
      setReportPeriod(period);
      fetchApiData(period, activeAccount.openId);
    }
  }, [connected, dateRange, activeAccount]);

  // 日付範囲変更ハンドラー
  const handleDateRangeChange = (newDateRange: { start: Date; end: Date }) => {
    setDateRange(newDateRange);
  };

  // 連携を解除する関数
  const handleDisconnect = async () => {
    if (!activeAccount) return;
    
    if (!confirm(`本当に「${activeAccount.displayName}」アカウントとの連携を解除しますか？`)) {
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }

      // TikTok連携解除APIを呼び出す
      const response = await fetch(`${API_BASE_URL}/api/tiktok/connection/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ openId: activeAccount.openId })
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await response.text() || `ステータスコード: ${response.status}`;
        }
        throw new Error(`連携解除に失敗しました: ${response.status} - ${errorDetail}`);
      }

      // 連携済みアカウント一覧を再取得
      await fetchConnectedAccounts();
      
      // アカウントが残っていなければ、連携解除状態にする
      if (accounts.length <= 1) {
        setConnected(false);
        setActiveAccount(null);
        setStats(null);
        setVideos([]);
      }
      
      setError(null);
    } catch (err) {
      console.error('[ERROR] TikTok連携解除エラー:', err);
      setError(err instanceof Error ? err.message : '連携解除に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // レポートをダウンロードする関数
  const handleDownloadReport = async () => {
    if (!activeAccount) return;
    
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }
      
      // 日付範囲をクエリパラメータとして追加
      const startDateParam = dateRange.start.toISOString().split('T')[0];
      const endDateParam = dateRange.end.toISOString().split('T')[0];
      const openIdParam = `&open_id=${activeAccount.openId}`;
      
      console.log(`[DEBUG] レポート生成 URL: ${API_BASE_URL}/api/tiktok/report?period=${reportPeriod}&start_date=${startDateParam}&end_date=${endDateParam}${openIdParam}`);
      
      // PDFレポート生成APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/tiktok/report?period=${reportPeriod}&start_date=${startDateParam}&end_date=${endDateParam}${openIdParam}`, {
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
      a.download = `tiktok-report-${activeAccount.displayName}-${startDateParam}-to-${endDateParam}.pdf`;
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

  // 期間表示用の日付フォーマット関数
  const formatDateRange = () => {
    const start = dateRange.start.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
    const end = dateRange.end.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
    return `${start} 〜 ${end}`;
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

  // タブ切り替えハンドラー
  const handleTabChange = (tab: 'stats' | 'videos') => {
    setActiveTab(tab);
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
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* ---- 連携 & レポート（上部に移動） ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 連携 */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">アカウント連携</h2>
          <p className="text-gray-400 mb-4">
            複数アカウントを登録したい場合はブラウザで別のアカウントでログインしてから連携ボタンを押してください。
          </p>

          {connected ? (
            <div className="flex flex-col space-y-4">
              <p className="text-green-400 font-semibold mb-2">
                ✅ 連携済み
                {activeAccount && (
                  <span className="ml-2 text-white">
                    （現在のアカウント: {activeAccount.displayName || '名称未設定'}）
                    {stats?.account_type && (
                      <span className="ml-2 px-2 py-1 bg-gray-800 rounded-md text-sm">
                        {stats.account_type}
                        {stats.account_type === 'アフィリエイト' && stats?.mainly_video_type && (
                          <span className="ml-1 text-gray-400">({stats.mainly_video_type})</span>
                        )}
                      </span>
                    )}
                  </span>
                )}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleConnect}
                  className="bg-[#FE2C55] text-white py-2 px-4 rounded-md hover:bg-[#FE2C55]/90 transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? '処理中...' : '別アカウントを追加'}
                </button>
                <button
                  onClick={handleDisconnect}
                  className="bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                  disabled={isLoading || !activeAccount}
                >
                  {isLoading ? '処理中...' : '連携を解除'}
                </button>
              </div>
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

          <div className="flex flex-col space-y-4">
            <div className="w-full">
              <DateRangePicker 
                dateRange={dateRange}
                onDateRangeChange={handleDateRangeChange}
              />
            </div>
            
            <button
              disabled={!connected || isLoading || !activeAccount}
              onClick={handleDownloadReport}
              className={`py-2 px-4 rounded-md transition-colors ${
                connected && !isLoading && activeAccount
                  ? 'bg-[#FE2C55] text-white hover:bg-[#FE2C55]/90'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? '読み込み中...' : 'レポート生成'}
            </button>
          </div>
        </div>
      </div>

      {/* 期間表示 */}
      {connected && activeAccount && (
        <p className="text-gray-400 text-sm mb-4">
          期間：{formatDateRange()}
        </p>
      )}

      {/* ---- タブナビゲーション ---- */}
      {connected && activeAccount && (
        <div className="mb-6">
          <div className="border-b border-gray-800">
            <nav className="flex -mb-px">
              <button
                onClick={() => handleTabChange('stats')}
                className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'stats'
                    ? 'border-[#FE2C55] text-[#FE2C55]'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                アカウント統計
              </button>
              <button
                onClick={() => handleTabChange('videos')}
                className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                  activeTab === 'videos'
                    ? 'border-[#FE2C55] text-[#FE2C55]'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                投稿動画一覧
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* ---- タブコンテンツ ---- */}
      {connected && activeAccount && (
        <>
          {/* 統計タブ */}
          {activeTab === 'stats' && (
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
              
              {/* 投稿数 */}
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
                <h3 className="text-gray-400 text-sm mb-1">投稿数</h3>
                {isLoading ? (
                  <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{formatNumber(stats?.videosCount || videos.length || 0)}</p>
                )}
              </div>
              
              {/* 総再生数 */}
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
                <h3 className="text-gray-400 text-sm mb-1">総再生数</h3>
                {isLoading ? (
                  <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-white">{formatNumber(stats?.totalPlayCount || (stats?.avgViewCount ?? 0) * (stats?.videosCount || 1))}</p>
                    {stats?.viewGrowth && stats.viewGrowth > 0 && (
                      <p className="text-sm text-green-400 mt-1">
                        +{formatNumber(stats.viewGrowth)} <span className="text-gray-500 text-xs">期間内</span>
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
              
              {/* 総コメント数 */}
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
                <h3 className="text-gray-400 text-sm mb-1">コメント数</h3>
                {isLoading ? (
                  <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{formatNumber(stats?.commentCount || 0)}</p>
                )}
              </div>
              
              {/* 総保存数 */}
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800 shadow-md">
                <h3 className="text-gray-400 text-sm mb-1">保存数</h3>
                {isLoading ? (
                  <div className="h-6 w-20 bg-gray-700 animate-pulse rounded"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{formatNumber(stats?.saveCount || 0)}</p>
                )}
              </div>
            </div>
          )}
          
          {/* 投稿パフォーマンスタブ */}
          {activeTab === 'videos' && videos.length > 0 && (
            <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <h2 className="text-xl font-bold text-white">
                  投稿パフォーマンス
                  <span className="ml-2 bg-[#FE2C55] text-white text-xs px-2 py-1 rounded-full">
                    {formatDateRange()}
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
                    再生増加数
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
                    総再生回数
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
                      <th className="px-6 py-4 text-left">サムネイル</th>
                      <th className="px-6 py-4 text-left">タイトル</th>
                      <th className="px-6 py-4 text-right">再生回数</th>
                      <th className="px-6 py-4 text-right">再生増加数</th>
                      <th className="px-6 py-4 text-right">いいね数</th>
                      <th className="px-6 py-4 text-right">いいね増加数</th>
                      <th className="px-6 py-4 text-right">コメント数</th>
                      <th className="px-6 py-4 text-right">コメント増加数</th>
                      <th className="px-6 py-4 text-right">シェア数</th>
                      <th className="px-6 py-4 text-right">シェア増加数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {getSortedVideos().map((video, index) => {
                      // ここでログ出力
                      console.log('thumbnailUrl.url:', video.thumbnailUrl?.url);

                      // 伸び率による視覚効果は一律で緑色の矢印に統一
                      const growthClass = 'text-green-500';
                      const growthIcon = '↑';

                      // 背景色を交互に変える
                      const rowBgClass = index % 2 === 0 ? 'bg-[#1a1a1a]' : 'bg-[#242424]';
                      
                      return (
                        <tr key={video.id} className={`${rowBgClass} hover:bg-gray-800 transition-colors`}>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                            {formatDate(video.createTime)}
                          </td>
                          <td className="px-6 py-4">
                            {video.thumbnailUrl ? (
                              <Image
                                src={video.thumbnailUrl.url ?? ""}
                                alt={video.title}
                                width={80}
                                height={45}
                                className="rounded-md object-cover"
                              />
                            ) : (
                              <div className="w-20 h-12 bg-gray-800 rounded-md flex items-center justify-center text-gray-500">
                                <span className="text-xs">No Image</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-white font-medium">
                              {video.title}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-white">
                            {formatNumber(video.viewCount)}
                          </td>
                          <td className={`px-6 py-4 text-right whitespace-nowrap ${video.viewGrowth >= 1 ? 'text-green-500' : 'text-gray-300'}`}>
                            {formatNumber(video.viewGrowth)}
                            {video.viewGrowth >= 1 && ' ↑'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                            {formatNumber(video.likeCount)}
                          </td>
                          <td className={`px-6 py-4 text-right whitespace-nowrap ${video.likeGrowth >= 1 ? 'text-green-500' : 'text-gray-300'}`}>
                            {formatNumber(video.likeGrowth)}
                            {video.likeGrowth >= 1 && ' ↑'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                            {formatNumber(video.commentCount)}
                          </td>
                          <td className={`px-6 py-4 text-right whitespace-nowrap ${video.commentGrowth >= 1 ? 'text-green-500' : 'text-gray-300'}`}>
                            {formatNumber(video.commentGrowth)}
                            {video.commentGrowth >= 1 && ' ↑'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-gray-300">
                            {formatNumber(video.shareCount)}
                          </td>
                          <td className={`px-6 py-4 text-right whitespace-nowrap ${video.shareGrowth >= 1 ? 'text-green-500' : 'text-gray-300'}`}>
                            {formatNumber(video.shareGrowth)}
                            {video.shareGrowth >= 1 && ' ↑'}
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
        </>
      )}
    </div>
  );
}