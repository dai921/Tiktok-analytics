import os
import json
from google.cloud import secretmanager

def get_secret(secret_id: str, version_id: str = "latest"):
    """
    Google Cloud Secret Managerからシークレットを取得する
    """
    try:
        # Secret Managerクライアントを初期化
        client = secretmanager.SecretManagerServiceClient()
        
        # シークレットのパスを構築
        name = f"projects/22573532446/secrets/{secret_id}/versions/{version_id}"
        
        # シークレットにアクセス
        response = client.access_secret_version(request={"name": name})
        
        # シークレット値をデコード
        secret_value = response.payload.data.decode("UTF-8")
        return secret_value
    except Exception as e:
        print(f"Secret Managerからの取得に失敗: {e}")
        return None

def get_db_config():
    """
    データベース接続情報を取得する
    """
    print("get_db_config()が呼び出されました")
    
    try:
        secret_id = os.environ.get("DB_SECRET_ID", "database-credentials")
        print(f"使用するシークレットID: {secret_id}")
        
        project_id = os.environ.get("GCP_PROJECT_ID", "22573532446")
        print(f"使用するプロジェクトID: {project_id}")
        
        db_credentials_json = get_secret(secret_id)
        
        if db_credentials_json:
            print("シークレットマネージャーからシークレットを取得しました")
            try:
                # JSONをパースして、必要なキー名に変換
                raw_config = json.loads(db_credentials_json)
                db_config = {
                    "host": raw_config.get("host") or raw_config.get("MYSQL_HOST"),
                    "user": raw_config.get("user") or raw_config.get("MYSQL_USER"),
                    "password": raw_config.get("password") or raw_config.get("MYSQL_PASSWORD"),
                    "database": raw_config.get("database") or raw_config.get("MYSQL_DATABASE"),
                    "port": raw_config.get("port") or raw_config.get("MYSQL_PORT", 3306)
                }
                # パスワード以外の内容をデバッグ用に出力
                safe_config = {k: v for k, v in db_config.items() if k != "MYSQL_PASSWORD"}
                print(f"取得したDB設定: {safe_config}")
                return db_config
            except json.JSONDecodeError as e:
                print(f"シークレット内容のJSONパースに失敗: {e}")
                print(f"取得した生データ: {db_credentials_json[:20]}...")
        
        # 環境変数から直接取得
        db_config = {
            "host": os.environ.get("MYSQL_HOST", "localhost"),
            "user": os.environ.get("MYSQL_USER", "tiktok_user"),
            "password": os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
            "database": os.environ.get("MYSQL_DATABASE", "tiktok_data"),
            "port": int(os.environ.get("MYSQL_PORT", "3306"))
        }
        
        # パスワード以外の設定をログに出力
        safe_config = {k: v for k, v in db_config.items() if k != "password"}
        print(f"環境変数から取得したDB設定: {safe_config}")
        return db_config
        
    except Exception as e:
        print(f"データベース設定の取得中に例外が発生: {e}")
        # スタックトレースも出力
        import traceback
        traceback.print_exc()
        
        # フォールバック：環境変数から直接取得
        db_config = {
            "host": os.environ.get("MYSQL_HOST", "localhost"),
            "user": os.environ.get("MYSQL_USER", "tiktok_user"),
            "password": os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
            "database": os.environ.get("MYSQL_DATABASE", "tiktok_data"),
            "port": int(os.environ.get("MYSQL_PORT", "3306"))
        }
        
        # パスワード以外の設定をログに出力
        safe_config = {k: v for k, v in db_config.items() if k != "password"}
        print(f"フォールバックDB設定: {safe_config}")
        return db_config 