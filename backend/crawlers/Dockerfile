# ベースイメージとして依存関係のインストールステージ
FROM python:3.11.9-slim as builder

WORKDIR /app

# システム依存関係のインストール（変更頻度が低いレイヤー）
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ffmpeg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && apt-get update \
    && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Python依存関係のインストール（requirements.txtが変更された時のみ再ビルド）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 追加のPython依存関係（固定バージョンを指定して再現性を確保）
RUN pip install --no-cache-dir \
    pymysql \
    google-cloud-pubsub \
    google-cloud-storage \
    aiohttp \
    TikTokApi==7.0.0 \
    yt-dlp

# Playwrightのインストールと設定
RUN pip install playwright==1.41.0 && \
    playwright install-deps chromium && \
    playwright install chromium

# 実行ステージ（最終イメージ）
FROM python:3.11.9-slim as runner

WORKDIR /app

# 必要なシステム依存関係をビルダーステージからコピー
COPY --from=builder /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=builder /usr/lib/x86_64-linux-gnu/ /usr/lib/x86_64-linux-gnu/
COPY --from=builder /root/.cache/ms-playwright/ /root/.cache/ms-playwright/

# Playwrightの実行に必要な追加ライブラリ
COPY --from=builder /usr/bin/ffmpeg /usr/bin/ffmpeg

# アプリケーションコードをコピー（最も変更が多いレイヤー）
COPY . .

# 環境変数の設定
ARG CRAWLER_TYPE
ENV CRAWLER_TYPE=$CRAWLER_TYPE
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# 実行コマンド
CMD if [ "$CRAWLER_TYPE" = "video_crawler" ]; then \
        python -m video_crawler.video_processor; \
    else \
        python -m account_crawler.crawler; \
    fi 