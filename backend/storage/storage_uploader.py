import os
from concurrent.futures import ThreadPoolExecutor
from google.cloud import storage

# 設定
BUCKET_NAME = "tiktok-data-bucket"  # GCSのバケット名
LOCAL_FOLDER = r"C:\Users\kyoto\Downloads\API"  # ローカルフォルダのパス (Windowsの場合はr""などでエスケープ)
GCS_FOLDER = "thumbnails/"  # GCS上の保存先フォルダ

# Google Cloud Storage クライアント（OAuth認証を使用）
storage_client = storage.Client.from_service_account_json("credentials.json") 
bucket = storage_client.bucket(BUCKET_NAME)

def upload_file(file_path):
    """ローカルの JPEG ファイルを GCS にアップロード（既存ファイルがあればスキップ）"""
    file_name = os.path.basename(file_path)  # ファイル名を取得
    gcs_path = os.path.join(GCS_FOLDER, file_name)  # GCS の保存パス
    blob = bucket.blob(gcs_path)

    # 既にファイルが存在するかチェック
    if blob.exists():
        print(f"⚠️ スキップ: 既に存在します → gs://{BUCKET_NAME}/{gcs_path}")
        return

    try:
        blob.upload_from_filename(file_path)
        print(f"✅ アップロード成功: {file_path} → gs://{BUCKET_NAME}/{gcs_path}")
    except Exception as e:
        print(f"❌ アップロード失敗: {file_path} - エラー: {e}")

def main():
    """フォルダ内のすべての JPEG をアップロード（並列数＝1）"""
    # フォルダ内の JPEG / JPG ファイルを取得
    file_paths = [
        os.path.join(LOCAL_FOLDER, f) 
        for f in os.listdir(LOCAL_FOLDER)
        if f.lower().endswith(('.jpg', '.jpeg'))
    ]

    print(f"📂 {len(file_paths)} 個の JPEG ファイルを GCS にアップロードします...")

    # 並列数を1にする（シーケンシャル実行）
    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.map(upload_file, file_paths)

    print("🎉 すべてのファイルのアップロードが完了しました！")

if __name__ == "__main__":
    main()
