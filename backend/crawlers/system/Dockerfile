FROM python:3.11.9-slim

WORKDIR /app

# 必要なライブラリをインストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコードをコピー
COPY crawler_controller.py .

# ヘルスチェック用のポートを公開
EXPOSE 8080

# アプリケーションを実行
CMD ["python", "crawler_controller.py"]