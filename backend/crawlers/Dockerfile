# Python 3.11.9をベースイメージとして使用
FROM python:3.11.9-slim

WORKDIR /app

# Playwrightの依存関係をインストール
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
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

# パッケージとしてインストール
COPY . /app/
RUN pip install -e .

# Playwrightをインストールしてブラウザをダウンロード
RUN playwright install chromium

# 環境変数でクローラーの種類を指定
ENV CRAWLER_TYPE=account_crawler
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# コマンドを配列形式で指定
CMD ["python", "-m", "tiktok_crawler.account_crawler.crawler"] 