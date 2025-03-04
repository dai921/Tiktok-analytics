FROM python:3.9-slim

WORKDIR /app

# 必要なパッケージをインストール
COPY requirements.txt .
RUN pip install -r requirements.txt

# ソースコードをコピー
COPY src/ src/

# 静的ファイルとテンプレートをコピー
COPY src/static src/static/
COPY src/templates src/templates/

# 環境変数を設定
ENV PYTHONPATH=/app

# アプリケーションを起動
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"] 