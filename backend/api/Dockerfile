FROM python:3.11-slim-bookworm

WORKDIR /app

# システムの依存関係をインストール
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    pkg-config \
    build-essential \ 
    default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

# 依存関係のインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Secret Managerのクライアントライブラリを追加
RUN pip install google-cloud-secret-manager

# アプリケーションのコピー
COPY src/ src/
COPY . .

# デバッグ用：コンテナ起動時にファイル一覧を表示
RUN ls -la

# 環境変数のデフォルト値を設定
ENV PORT=8080

# 起動コマンド
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]