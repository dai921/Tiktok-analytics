import { Metadata } from "next";

export const metadata: Metadata = {
  title: "自アカウント分析 | TikTok Analytics",
  description: "TikTokアカウントのパフォーマンス分析と指標の詳細レポート",
};

export default function MyAccountPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">自アカウント分析</h1>
        <p className="text-gray-400">
          TikTokアカウントのパフォーマンス指標とデータ分析
        </p>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-bold text-white mb-2">アカウント概要</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* メトリクスカード */}
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-gray-400 text-sm mb-1">総フォロワー数</h3>
          <p className="text-2xl font-bold text-white">-</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-gray-400 text-sm mb-1">総いいね数</h3>
          <p className="text-2xl font-bold text-white">-</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-gray-400 text-sm mb-1">平均視聴回数</h3>
          <p className="text-2xl font-bold text-white">-</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
          <h3 className="text-gray-400 text-sm mb-1">エンゲージメント率</h3>
          <p className="text-2xl font-bold text-white">-</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* アカウント連携セクション */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">アカウント連携</h2>
          <p className="text-gray-400 mb-4">
            分析を開始するには、TikTokビジネスアカウントと連携してください。
          </p>
          <button className="bg-[#FE2C55] text-white py-2 px-4 rounded-md hover:bg-[#FE2C55]/90 transition-colors">
            TikTokと連携する
          </button>
        </div>

        {/* レポート生成セクション */}
        <div className="bg-[#1a1a1a] rounded-lg p-6 border border-gray-800">
          <h2 className="text-xl font-bold text-white mb-4">レポート生成</h2>
          <p className="text-gray-400 mb-4">
            期間を選択してアカウントパフォーマンスレポートを生成します。
          </p>
          <button disabled className="bg-gray-700 text-gray-400 py-2 px-4 rounded-md cursor-not-allowed">
            レポート生成（アカウント連携後に利用可能）
          </button>
        </div>
      </div>
    </div>
  );
} 