# Python 3.11.9をベースイメージとして使用
FROM python:3.11.9-slim

WORKDIR /app

# Playwrightの依存関係をインストール
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

# Playwrightのインストールと依存関係
RUN pip install playwright==1.41.0 && \
    mkdir -p /root/.cache/ms-playwright && \
    chmod -R 777 /root/.cache/ms-playwright && \
    playwright install-deps chromium && \
    playwright install chromium

# 必要なPythonパッケージをインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 追加で必要なパッケージを明示的にインストール
RUN pip install pymysql google-cloud-pubsub google-cloud-storage aiohttp TikTokApi==7.0.0 yt-dlp

# アプリケーションコードをコピー
COPY . .

# 環境変数でクローラーの種類を指定
ARG CRAWLER_TYPE
ENV CRAWLER_TYPE=$CRAWLER_TYPE
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# コマンドを条件分岐で指定
CMD if [ "$CRAWLER_TYPE" = "video_crawler" ]; then \
        python -m video_crawler.video_processor; \
    else \
        python -m account_crawler.crawler; \
    fi 