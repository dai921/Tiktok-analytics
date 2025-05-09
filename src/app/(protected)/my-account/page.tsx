"use client";

// src/app/(protected)/my-account/page.tsx

// ISR・SSG を完全に無効化（常にリクエスト時に実行）
export const dynamic = 'force-dynamic';    // または export const revalidate = 0;

export default function MyAccountPage() {
  /** ---------- 認可 URL ---------- */
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : '');
    
  // ランダムな文字列を生成（ブラウザのcrypto APIを使用）
  const generateRandomState = () => {
    // window.crypto.randomUUIDが利用可能ならそれを使う
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // フォールバックとしてランダムな文字列を生成
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  };
  
  const qs = new URLSearchParams({
    client_key: process.env.NEXT_PUBLIC_TT_CLIENT_KEY!,
    redirect_uri: `${baseUrl}/api/auth/tiktok/callback`,
    response_type: 'code',
    scope: ['user.info.basic', 'video.list', 'account_insights.read'].join(','),
    state: generateRandomState(),
  });
  const authorizeUrl = `https://www.tiktok.com/v2/auth/authorize?${qs.toString()}`;

  // 連携状態（仮のデータ）
  const connected = false;

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
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 mb-8">
        {/* カードたち */}
        {[
          { label: '総フォロワー数', value: undefined },
          { label: '総いいね数', value: undefined },
          { label: '平均視聴回数', value: undefined },
          { label: 'エンゲージメント率', value: undefined },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
            <h3 className="text-gray-400 text-sm mb-1">{label}</h3>
            <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
          </div>
        ))}
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
            <p className="text-green-400 font-semibold">✅ 連携済み</p>
          ) : (
            <a
              href={authorizeUrl}
              className="bg-[#FE2C55] text-white py-2 px-4 rounded-md hover:bg-[#FE2C55]/90 transition-colors"
            >
              TikTokと連携する
            </a>
          )}
        </div>

        {/* レポート */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">レポート生成</h2>
          <p className="text-gray-400 mb-4">
            期間を選択してアカウントパフォーマンスレポートを生成します。
          </p>
          <button
            disabled={!connected}
            onClick={() => (window.location.href = '/api/export?range=30d')}
            className={`py-2 px-4 rounded-md transition-colors ${
              connected
                ? 'bg-[#FE2C55] text-white hover:bg-[#FE2C55]/90'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            レポート生成
          </button>
        </div>
      </div>
    </div>
  );
}
