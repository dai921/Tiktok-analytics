# ビルドステージ
FROM node:18-alpine AS builder

WORKDIR /app

# 依存関係のインストール
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install

# ソースコードのコピー
COPY . .

# 環境変数の設定
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Next.jsアプリケーションのビルド（ESLintと型チェックをスキップ）
RUN pnpm build

# 実行ステージ
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 必要なファイルのみコピー
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ユーザー権限の設定
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN chown -R nextjs:nodejs /app
USER nextjs

# ポート設定（ローカル開発では3030、Cloud Runでは8080を使用）
EXPOSE 3030 8080

# 環境変数PORT が設定されていればそれを使用、なければ3030をデフォルトとする
ENV PORT=3030
ENV HOSTNAME="0.0.0.0"

# アプリケーションの起動
CMD ["node", "server.js"] 