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
ENV NEXT_PUBLIC_TT_CLIENT_KEY=sbaweandob9d0evs2s
ENV TT_CLIENT_SECRET=EKD2f21EC70u140ZAqzssu70AQY8sDLi
ENV NEXT_PUBLIC_BASE_URL=https://5396-240f-78-a212-1-504c-7fd8-891-852f.ngrok-free.app
# Next.jsのキャッシュをクリア
RUN rm -rf .next
# Next.jsアプリケーションのビルド（ESLintと型チェックをスキップ）
RUN npm run build && find .next -type d | sort

# 実行ステージ
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# 実行時にも環境変数を定義する必要がある
ENV TT_CLIENT_SECRET=EKD2f21EC70u140ZAqzssu70AQY8sDLi
ENV NEXT_PUBLIC_BASE_URL=https://5396-240f-78-a212-1-504c-7fd8-891-852f.ngrok-free.app
ENV TT_CLIENT_KEY=sbaweandob9d0evs2s

# 必要なファイルのみコピー
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ユーザー権限の設定
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN chown -R nextjs:nodejs /app
USER nextjs

# ポート設定（Cloud Run用に8080に修正）
EXPOSE 8080

# Cloud Run用にポートを8080に固定
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# アプリケーションの起動
CMD ["node", "server.js"] 