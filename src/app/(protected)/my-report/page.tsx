"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
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
  accountType?: string;
  mainlyVideoType?: string;
}
const toStartOfDay = (date: Date): Date => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const toEndOfDay = (date: Date): Date => {
  const clone = new Date(date);
  clone.setHours(23, 59, 59, 999);
  return clone;
};

const formatDateForFileName = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function MyAccountPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<TikTokStats | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sortField, setSortField] = useState<'viewCount' | 'viewGrowth' | 'createTime'>('createTime');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // desc: 降順, asc: 昇順
  const [activeTab, setActiveTab] = useState<'stats' | 'videos'>('stats'); // 追加：タブUIのstate
  
  // アカウント情報関連の状態
  const [accounts, setAccounts] = useState<TikTokAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<TikTokAccount | null>(null);
  const [videoLimit, setVideoLimit] = useState<number>(100);
  const videoLimitOptions = [50, 100, 150, 200, 250, 300];
  
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<TikTokAccount | null>(null);
  const [isCsvExporting, setIsCsvExporting] = useState(false);
  
  const monthPresets = useMemo(() => {
    const presets: { key: string; label: string; range: { start: Date; end: Date } }[] = [];
    const today = new Date();
    for (let i = 0; i < 6; i += 1) {
      const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const startDate = toStartOfDay(base);
      const endDate = toEndOfDay(new Date(base.getFullYear(), base.getMonth() + 1, 0));
      const key = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      const label = `${startDate.getFullYear()}年${startDate.getMonth() + 1}月`;
      presets.push({ key, label, range: { start: startDate, end: endDate } });
    }
    return presets;
  }, []);

  const fallbackEnd = toEndOfDay(new Date());
  const fallbackStart = toStartOfDay(new Date(fallbackEnd));
  fallbackStart.setDate(fallbackStart.getDate() - 29);
  const defaultRange = { start: fallbackStart, end: fallbackEnd };
  const initialRange = monthPresets[0]?.range ?? defaultRange;

  const [reportMode, setReportMode] = useState<'monthly' | 'custom'>('monthly');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(monthPresets[0]?.key ?? '');
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(initialRange);
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date }>(initialRange);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
  /** ---------- 認可 URL ---------- */
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
    redirect_uri: `${API_BASE_URL}/api/auth/tiktok/callback`, // バックエンドAPIに変更
    response_type: 'code',
    scope: ['user.info.basic', 'user.info.stats', 'video.list'].join(','),
    state: generateRandomState(),
  });
  const authorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;

  const mapAccountResponse = (account: any): TikTokAccount => ({
    id: account?.id || account?.openId || account?.open_id || '1',
    openId: account?.openId || account?.open_id || 'unknown',
    displayName: account?.displayName || account?.display_name || 'TikTokアカウント',
    linkedAt: account?.linkedAt || account?.linked_at || new Date().toISOString(),
    accountType: account?.accountType || account?.account_type,
    mainlyVideoType: account?.mainlyVideoType || account?.mainly_video_type,
  });

  // 連携済みアカウント一覧を取得する関数
  const fetchConnectedAccounts = async (): Promise<void> => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        setAccounts([]);
        setActiveAccount(null);
        setConnected(false);
        setStats(null);
        setVideos([]);
        return;
      }

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
        setError('TikTok連携状態の取得に失敗しました。再度お試しください。');
        return;
      }

      const statusData = await response.json();
      console.log('[INFO] 取得したTikTok連携状態:', statusData);

      const rawAccounts: any[] = Array.isArray(statusData.accounts)
        ? statusData.accounts
        : statusData.account
          ? [statusData.account]
          : [];

      const accountsData: TikTokAccount[] = rawAccounts.map(mapAccountResponse);
      setAccounts(accountsData);
      setConnected(accountsData.length > 0);

      if (accountsData.length === 0) {
        setActiveAccount(null);
        setStats(null);
        setVideos([]);
        return;
      }

      setActiveAccount((prev) => {
        if (prev) {
          const preserved = accountsData.find((account) => account.openId === prev.openId);
          if (preserved) {
            return preserved;
          }
        }
        return accountsData[0];
      });
      setError(null);
    } catch (err) {
      console.error('[ERROR] TikTok連携状態取得エラー:', err);
      setError('TikTok連携状態の取得に失敗しました。再度お試しください。');
    }
  };

  // アカウントを切り替える関数
  const handleAccountChange = (account: TikTokAccount) => {
    setActiveAccount(account);
  };

  const handleAccountSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const openId = event.target.value;
    const account = accounts.find((item) => item.openId === openId);
    if (account) {
      handleAccountChange(account);
    }
  };

  // TikTokと連携する関数
  const handleConnect = async (e: React.MouseEvent) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      setError('認証情報がありません。再ログインしてください。');
      return;
    }

    if (connected) {
      const proceed = confirm('すでにTikTokと連携済みです。別のアカウントを追加しますか？');
      if (!proceed) {
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/tiktok/auth-url`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });


      if (!res.ok) {
        let errorDetail = '';
        try {
          const errorData = await res.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await res.text() || `ステータスコード: ${res.status}`;
        }
        throw new Error(`認可URLの取得に失敗しました: ${res.status} - ${errorDetail}`);
      }
      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch (err) {
      console.error('[ERROR] OAuth遷移エラー:', err);
      setError('TikTok連携画面への遷移に失敗しました。しばらく待ってからもう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  // バックエンドAPIからデータを取得する関数
  // バックエンドAPIからデータを取得する関数
  const fetchApiData = async (
    openId?: string,
    limit: number = videoLimit,
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }

      if (!API_BASE_URL) {
        setError('APIのエンドポイントが設定されていません。');
        return;
      }

      const activeRange = dateRange;
      const startIso = formatDateForFileName(toStartOfDay(activeRange.start));
      const endIso = formatDateForFileName(toEndOfDay(activeRange.end));
      const periodParam = reportMode === 'custom' ? 'custom' : 'monthly';

      const statsUrl = new URL(`${API_BASE_URL}/api/tiktok/stats`);
      statsUrl.searchParams.set('period', periodParam);
      statsUrl.searchParams.set('start_date', startIso);
      statsUrl.searchParams.set('end_date', endIso);
      if (openId) statsUrl.searchParams.set('open_id', openId);

      const videosUrl = new URL(`${API_BASE_URL}/api/tiktok/videos`);
      videosUrl.searchParams.set('period', periodParam);
      videosUrl.searchParams.set('start_date', startIso);
      videosUrl.searchParams.set('end_date', endIso);
      if (openId) videosUrl.searchParams.set('open_id', openId);
      videosUrl.searchParams.set('limit', String(limit));

      console.log('[DEBUG] 統計情報取得 URL:', statsUrl.toString());

      const statsResponse = await fetch(statsUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[DEBUG] 統計情報レスポンスステータス: ${statsResponse.status} ${statsResponse.statusText}`);

      if (!statsResponse.ok) {
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

      console.log('[DEBUG] 動画リスト取得 URL:', videosUrl.toString());
      const videosResponse = await fetch(videosUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[DEBUG] 動画リストレスポンスステータス: ${videosResponse.status} ${videosResponse.statusText}`);

      if (!videosResponse.ok) {
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

      const normalizeThumbnail = (thumbnail: any) => {
        if (!thumbnail) return null;

        if (typeof thumbnail === 'string') {
          return { valueType: 'IMAGE', url: thumbnail };
        }

        if (typeof thumbnail === 'object') {
          const nestedUrl =
            typeof thumbnail.url === 'string'
              ? thumbnail.url
              : typeof thumbnail.url === 'object' && thumbnail.url !== null
                ? thumbnail.url.url
                : null;

          if (typeof nestedUrl === 'string' && nestedUrl.length > 0) {
            return { valueType: thumbnail.valueType ?? 'IMAGE', url: nestedUrl };
          }
        }

        return null;
      };

      const videosWithObjThumbnail = videosData.map((video: any) => {
        const rawThumbnail =
          video?.thumbnailUrl ??
          (video as Record<string, any>)?.thumbnail_url ??
          (video as Record<string, any>)?.coverImageUrl ??
          (video as Record<string, any>)?.cover_image_url;

        return {
          ...video,
          thumbnailUrl: normalizeThumbnail(rawThumbnail),
        };
      });

      if (statsData && videosWithObjThumbnail && videosWithObjThumbnail.length > 0) {
        const totalPlayCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.viewCount || 0), 0);
        const commentCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.commentCount || 0), 0);
        const saveCount = videosWithObjThumbnail.reduce((sum: number, video: TikTokVideo) => sum + (video.shareCount || 0), 0);

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
      setIsLoading(true);
      try {
        await fetchConnectedAccounts();
      } catch (err) {
        console.error('[ERROR] 初期化エラー:', err);
      } finally {
        setIsLoading(false);
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
    if (!connected || !activeAccount) {
      return;
    }

    fetchApiData(activeAccount.openId, videoLimit);
  }, [connected, activeAccount, dateRange, reportMode, videoLimit, selectedMonthKey]);

  // 日付範囲変更ハンドラー
  // 日付範囲変更ハンドラー
  const handleDateRangeChange = (newDateRange: { start: Date; end: Date }) => {
    setReportMode('custom');
    setCustomDateRange(newDateRange);
    setDateRange(newDateRange);
  };

  // 連携を解除する関数
  const disconnectAccount = async (account: TikTokAccount): Promise<boolean> => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/api/tiktok/connection/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ openId: account.openId })
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await response.text() || `ステータスコード: ${response.status}`;
        }
        throw new Error(`アカウント連携解除に失敗しました: ${response.status} - ${errorDetail}`);
      }

      let handled = false;
      try {
        const result = await response.json();
        if (result && Array.isArray(result.accounts)) {
          const normalized = result.accounts.map(mapAccountResponse);
          setAccounts(normalized);
          setConnected(normalized.length > 0);

          if (normalized.length === 0) {
            setActiveAccount(null);
            setStats(null);
            setVideos([]);
          } else {
            const nextActive = normalized.find((item) => item.openId === activeAccount?.openId && item.openId !== account.openId)
              || normalized[0];
            setActiveAccount(nextActive);
          }
          handled = true;
        }
      } catch (parseError) {
        console.warn('[WARN] disconnect response parse failed:', parseError);
      }

      if (!handled) {
        await fetchConnectedAccounts();
      }

      setError(null);
      return true;
    } catch (err) {
      console.error('[ERROR] TikTok連携解除エラー:', err);
      setError(err instanceof Error ? err.message : '連携解除に失敗しました。再度お試しください。');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectClick = () => {
    if (!activeAccount) return;
    setDisconnectTarget(activeAccount);
    setIsDisconnectModalOpen(true);
  };

  const handleCancelDisconnect = () => {
    setIsDisconnectModalOpen(false);
    setDisconnectTarget(null);
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;
    const succeeded = await disconnectAccount(disconnectTarget);
    if (succeeded) {
      setIsDisconnectModalOpen(false);
      setDisconnectTarget(null);
    }
  };

  const handleDownloadReport = async () => {
    if (!activeAccount) return;

    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }

      if (!API_BASE_URL) {
        setError('APIのエンドポイントが設定されていません。');
        return;
      }

      const activeRange = dateRange;
      const startIso = formatDateForFileName(toStartOfDay(activeRange.start));
      const endIso = formatDateForFileName(toEndOfDay(activeRange.end));
      const periodParam = reportMode === 'custom' ? 'custom' : 'monthly';

      const url = new URL(`${API_BASE_URL}/api/tiktok/report`);
      url.searchParams.set('period', periodParam);
      url.searchParams.set('start_date', startIso);
      url.searchParams.set('end_date', endIso);
      url.searchParams.set('open_id', activeAccount.openId);

      console.log(`[DEBUG] レポート生成 URL: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[DEBUG] レポート生成レスポンスステータス: ${response.status} ${response.statusText}`);

      if (!response.ok) {
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

      const blob = await response.blob();
      console.log(`[DEBUG] レポートBlobサイズ: ${blob.size} bytes`);

      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `tiktok-report-${activeAccount.displayName}-${startIso}-to-${endIso}.pptx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[ERROR] レポートダウンロードエラー:', err);
      setError(err instanceof Error ? err.message : 'レポートの生成に失敗しました。再度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!activeAccount) return;

    setIsCsvExporting(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }

      if (!API_BASE_URL) {
        setError('APIのエンドポイントが設定されていません。');
        return;
      }

      const activeRange = dateRange;
      const startIso = formatDateForFileName(toStartOfDay(activeRange.start));
      const endIso = formatDateForFileName(toEndOfDay(activeRange.end));
      const periodParam = reportMode === 'custom' ? 'custom' : 'monthly';

      const url = new URL(`${API_BASE_URL}/api/tiktok/videos/export`);
      url.searchParams.set('period', periodParam);
      url.searchParams.set('start_date', startIso);
      url.searchParams.set('end_date', endIso);
      url.searchParams.set('open_id', activeAccount.openId);
      url.searchParams.set('limit', String(videoLimit));

      console.log('[DEBUG] CSVエクスポート URL:', url.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`[DEBUG] CSVエクスポートレスポンス: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorDetail = '';
        try {
          const errorData = await response.json();
          errorDetail = JSON.stringify(errorData);
        } catch (e) {
          errorDetail = await response.text() || `ステータスコード: ${response.status}`;
        }
        console.error(`[ERROR] CSVエクスポートエラー詳細: ${errorDetail}`);
        throw new Error(`CSVのダウンロードに失敗しました: ${response.status} - ${errorDetail}`);
      }

      const blob = await response.blob();
      console.log(`[DEBUG] CSVエクスポートBlobサイズ: ${blob.size} bytes`);

      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `tiktok-videos-${activeAccount.displayName}-${startIso}-to-${endIso}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[ERROR] CSVダウンロードエラー:', err);
      setError(err instanceof Error ? err.message : 'CSVのダウンロードに失敗しました。再度お試しください。');
    } finally {
      setIsCsvExporting(false);
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

  // 1. ソート対象の拡張とプルダウン化
  const sortOptions = [
    { value: 'viewGrowth', label: '再生増加数' },
    { value: 'viewCount', label: '総再生回数' },
    { value: 'likeGrowth', label: 'いいね増加数' },
    { value: 'commentGrowth', label: 'コメント増加数' },
    { value: 'shareGrowth', label: 'シェア増加数' },
    { value: 'createTime', label: '投稿日' },
  ];

  const handleSortSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortField(e.target.value as typeof sortField);
    setSortDirection('desc'); // プルダウン選択時は降順にリセット
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

  // 選択された期間に応じてソートされた動画を取得
  const getSortedVideos = () => {
    // ソートされた動画のリスト
    return sortVideos(videos, sortField, sortDirection);
  };

  // タブ切り替えハンドラー
  const handleTabChange = (tab: 'stats' | 'videos') => {
    setActiveTab(tab);
  };

  // モーダルの状態管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<TikTokVideo | null>(null);
  const [viewRates, setViewRates] = useState({
    twoSecondRate: 0,
    sixSecondRate: 0,
    fullViewRate: 0
  });

  // 連携解除確認用モーダル
  const DisconnectConfirmModal = ({ isOpen, onClose, onConfirm, accountName }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    accountName?: string | null;
  }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md border border-gray-800 shadow-xl">
          <h3 className="text-lg font-semibold text-white mb-3">連携を解除しますか？</h3>
          <p className="text-gray-300 text-sm leading-relaxed mb-1">
            {accountName ? `「${accountName}」との連携を解除すると、これまで取得したデータもすべて削除されます。` : '連携を解除すると、これまで取得したデータもすべて削除されます。'}
          </p>
          <p className="text-gray-500 text-xs">※ この操作は取り消せません。</p>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
              disabled={isLoading}
            >
              連携を解除する
            </button>
          </div>
        </div>
      </div>
    );
  };

  // モーダルコンポーネント
  const ViewRateModal = ({ isOpen, onClose, video, onSave }: {
    isOpen: boolean;
    onClose: () => void;
    video: TikTokVideo | null;
    onSave: (rates: { twoSecondRate: number; sixSecondRate: number; fullViewRate: number }) => void;
  }) => {
    if (!isOpen || !video) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-[#1a1a1a] rounded-lg p-6 w-full max-w-md">
          <h3 className="text-xl font-bold text-white mb-4">視聴率データの追加</h3>
          <p className="text-gray-400 mb-4">{video.title}</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">2秒視聴率 (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={viewRates.twoSecondRate}
                onChange={(e) => setViewRates(prev => ({
                  ...prev,
                  twoSecondRate: parseFloat(e.target.value) || 0
                }))}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-md border border-gray-700"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">6秒視聴率 (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={viewRates.sixSecondRate}
                onChange={(e) => setViewRates(prev => ({
                  ...prev,
                  sixSecondRate: parseFloat(e.target.value) || 0
                }))}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-md border border-gray-700"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-1">フル視聴率 (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={viewRates.fullViewRate}
                onChange={(e) => setViewRates(prev => ({
                  ...prev,
                  fullViewRate: parseFloat(e.target.value) || 0
                }))}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-md border border-gray-700"
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={() => {
                onSave(viewRates);
                onClose();
              }}
              className="px-4 py-2 bg-[#FE2C55] text-white rounded-md hover:bg-[#FE2C55]/90 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 動画データの行をクリックしたときの処理
  const handleVideoRowClick = (video: TikTokVideo) => {
    setSelectedVideo(video);
    setViewRates({
      twoSecondRate: video.viewRates?.twoSecondRate || 0,
      sixSecondRate: video.viewRates?.sixSecondRate || 0,
      fullViewRate: video.viewRates?.fullViewRate || 0
    });
    setIsModalOpen(true);
  };

  // 視聴率データの保存処理
  const handleSaveViewRates = async (rates: { twoSecondRate: number; sixSecondRate: number; fullViewRate: number }) => {
    if (!selectedVideo) return;

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('認証情報がありません。再ログインしてください。');
        return;
      }

      // APIエンドポイントにデータを送信
      const response = await fetch(`${API_BASE_URL}/api/tiktok/videos/${selectedVideo.id}/view-rates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rates)
      });

      if (!response.ok) {
        throw new Error('視聴率データの保存に失敗しました');
      }

      // 成功したら、ローカルの動画データを更新
      setVideos(prevVideos => prevVideos.map(video => 
        video.id === selectedVideo.id
          ? { ...video, viewRates: rates }
          : video
      ));
    } catch (err) {
      console.error('[ERROR] 視聴率データ保存エラー:', err);
      setError(err instanceof Error ? err.message : '視聴率データの保存に失敗しました');
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

              {accounts.length > 1 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 space-y-2 sm:space-y-0">
                  <span className="text-sm text-gray-400">表示するアカウント</span>
                  <select
                    value={activeAccount?.openId ?? ''}
                    onChange={handleAccountSelectChange}
                    className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE2C55]"
                  >
                    {accounts.map((accountItem) => (
                      <option key={accountItem.openId} value={accountItem.openId}>
                        {accountItem.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleConnect}
                  className="bg-[#FE2C55] text-white py-2 px-4 rounded-md hover:bg-[#FE2C55]/90 transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? '処理中...' : '別アカウントを追加'}
                </button>
                <button
                  onClick={handleDisconnectClick}
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
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={reportMode === 'monthly'}
                  onChange={() => {
                    setReportMode('monthly');
                    const preset = monthPresets.find((item) => item.key === selectedMonthKey);
                    if (preset) {
                      setDateRange(preset.range);
                    }
                  }}
                />
                <span className="text-sm text-gray-300">月次レポート</span>
              </label>
              {reportMode === 'monthly' && (
                <select
                  value={selectedMonthKey}
                  onChange={(event) => {
                    const key = event.target.value;
                    setSelectedMonthKey(key);
                    const preset = monthPresets.find((item) => item.key === key);
                    if (preset) {
                      setDateRange(preset.range);
                    }
                  }}
                  className="w-full bg-gray-900 border border-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#FE2C55]"
                >
                  {monthPresets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  checked={reportMode === 'custom'}
                  onChange={() => {
                    setReportMode('custom');
                    setDateRange(customDateRange);
                  }}
                />
                <span className="text-sm text-gray-300">カスタム期間レポート</span>
              </label>
              {reportMode === 'custom' && (
                <div className="w-full">
                  <DateRangePicker
                    dateRange={customDateRange}
                    onDateRangeChange={handleDateRangeChange}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                disabled={!connected || isLoading || !activeAccount || isCsvExporting}
                onClick={handleDownloadReport}
                className={`py-2 px-4 rounded-md transition-colors ${
                  connected && !isLoading && !isCsvExporting && activeAccount
                    ? 'bg-[#FE2C55] text-white hover:bg-[#FE2C55]/90'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? '読み込み中...' : 'レポート生成'}
              </button>

              <button
                disabled={!connected || isCsvExporting || !activeAccount || isLoading}
                onClick={handleDownloadCsv}
                className={`py-2 px-4 rounded-md transition-colors ${
                  connected && !isCsvExporting && !isLoading && activeAccount
                    ? 'bg-[#66E6D7] text-[#14373F] hover:bg-[#5fd7c9]'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isCsvExporting ? 'CSV出力中...' : 'CSVをダウンロード'}
              </button>
            </div>
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center mt-4 sm:mt-0">
                  <div className="text-sm text-gray-400 flex items-center">
                    表示件数:
                    <select
                      value={videoLimit}
                      onChange={(e) => setVideoLimit(Number(e.target.value))}
                      className="ml-2 px-2 py-1 rounded-md bg-gray-800 text-white text-sm border border-gray-700"
                    >
                      {videoLimitOptions.map((option) => (
                        <option key={option} value={option}>{option}件</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-sm text-gray-400 flex items-center">
                    ソート:
                    <select
                      value={sortField}
                      onChange={handleSortSelect}
                      className="ml-2 px-2 py-1 rounded-md bg-gray-800 text-white text-sm border border-gray-700"
                    >
                      {sortOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
                      className="ml-2 px-2 py-1 rounded-md bg-gray-700 text-white text-xs border border-gray-600"
                      title="ソート順の切り替え"
                    >
                      {sortDirection === 'desc' ? '降' : '昇'}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-[11px] bg-gray-900 text-gray-300">
                    <tr>
                      <th className="px-6 py-4 text-left whitespace-nowrap">投稿日</th>
                      <th className="px-6 py-4 text-left whitespace-nowrap">サムネイル</th>
                      <th className="px-6 py-4 text-left whitespace-nowrap">タイトル</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">再生回数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">再生増加数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">いいね数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">いいね増加数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">コメント数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">コメント増加数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">シェア数</th>
                      <th className="px-6 py-4 text-right whitespace-nowrap">シェア増加数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {getSortedVideos().map((video, index) => {
                      // ここでログ出力
                      // 伸び率による視覚効果は一律で緑色の矢印に統一
                      const growthClass = 'text-green-500';
                      const growthIcon = '↑';

                      // 背景色を交互に変える
                      const rowBgClass = index % 2 === 0 ? 'bg-[#1a1a1a]' : 'bg-[#242424]';
                      
                      return (
                        <tr 
                          key={video.id} 
                          className={`${rowBgClass} hover:bg-gray-800 transition-colors cursor-pointer`}
                          onClick={() => handleVideoRowClick(video)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                            {formatDate(video.createTime)}
                          </td>
                          <td className="px-6 py-4">
                            {(() => {
                              const thumbSrc = video.thumbnailUrl?.url;

                              if (typeof thumbSrc === 'string' && thumbSrc.length > 0) {
                                return (
                                  <Image
                                    src={thumbSrc}
                                    alt={video.title}
                                    width={80}
                                    height={45}
                                    className="rounded-md object-cover"
                                    unoptimized
                                    referrerPolicy="no-referrer"
                                  />
                                );
                              }

                              return (
                                <div className="w-20 h-12 bg-gray-800 rounded-md flex items-center justify-center text-gray-500">
                                  <span className="text-xs">No Image</span>
                                </div>
                              );
                            })()}
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

      {/* モーダルコンポーネント */}
      <DisconnectConfirmModal
        isOpen={isDisconnectModalOpen}
        onClose={handleCancelDisconnect}
        onConfirm={handleConfirmDisconnect}
        accountName={disconnectTarget?.displayName}
      />

      <ViewRateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        video={selectedVideo}
        onSave={handleSaveViewRates}
      />
    </div>
  );
}
