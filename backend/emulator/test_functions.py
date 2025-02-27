import os
import subprocess
import json
import time
from google.cloud import pubsub_v1

def test_collect_urls():
    """collect_urls関数をテストする"""
    print("\n=== collect_urls関数をテスト ===")
    try:
        # ポートを8090に変更
        result = subprocess.run(["curl", "-s", "http://localhost:8090"], 
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0:
            print(f"成功! 応答: {result.stdout.decode('utf-8')}")
            return True
        else:
            print(f"失敗. エラー: {result.stderr.decode('utf-8')}")
            return False
    except Exception as e:
        print(f"エラー: {e}")
        return False

def test_process_crawl_complete():
    """process_crawl_complete関数をテストする"""
    print("\n=== process_crawl_complete関数をテスト ===")
    
    # 環境変数を正しいポートに設定
    os.environ["PUBSUB_EMULATOR_HOST"] = "localhost:8681"
    project_id = os.environ.get("PROJECT_ID", "local-project")
    
    # 正しい値を表示
    print(f"PUBSUB_EMULATOR_HOST: {os.environ['PUBSUB_EMULATOR_HOST']}")
    print(f"PROJECT_ID: {project_id}")
    
    try:
        # まず関数が起動しているか確認 (ポートを8091に修正)
        print("process_crawl_complete関数の起動確認中...")
        result = subprocess.run(["curl", "-s", "http://localhost:8091"], 
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print(f"警告: process_crawl_complete関数に接続できません。")
            print(f"エラー: {result.stderr.decode('utf-8')}")
            print("これはHTTPエンドポイントがないため正常です。Pub/Subテストを継続します...")
        
        # Pub/Subクライアント作成
        print("PublisherClientを作成しています...")
        publisher = pubsub_v1.PublisherClient()
        
        # トピック名とパス
        topic_name = "crawl-complete"
        topic_path = publisher.topic_path(project_id, topic_name)
        
        # テストメッセージを作成
        message = {
            "account_id": "test123",
            "status": "completed",
            "video_count": 10,
            "timestamp": time.time()
        }
        
        # メッセージをJSON形式に変換
        data = json.dumps(message).encode("utf-8")
        
        print(f"トピック '{topic_name}' にメッセージを送信: {message}")
        future = publisher.publish(topic_path, data)
        
        # 結果を待機
        message_id = future.result(timeout=10)
        print(f"メッセージを送信しました。ID: {message_id}")
        
        # しばらく待機して処理を確認
        print("処理を待機中... (5秒)")
        time.sleep(5)
        
        print("process_crawl_complete関数をテストしました。")
        print("関数のログを確認して、メッセージが正しく処理されたか確認してください。")
        return True
        
    except Exception as e:
        print(f"エラー: {e}")
        import traceback
        print(traceback.format_exc())
        return False

def check_docker_status():
    """Dockerの実行状況を確認する"""
    print("\n=== Dockerコンテナ状態を確認 ===")
    try:
        # 実行中のコンテナを確認
        print("実行中のDockerコンテナ:")
        subprocess.run(["docker", "ps"], check=True)
        
        # docker-compose.dev.ymlのサービスを確認
        print("\ndocker-compose設定:")
        subprocess.run(["docker-compose", "-f", "docker-compose.dev.yml", "ps"], check=True)
        
        return True
    except Exception as e:
        print(f"Dockerステータス確認中にエラー: {e}")
        return False

if __name__ == "__main__":
    # まずDockerの状態を確認
    check_docker_status()
    
    # 関数をテスト
    test_collect_urls()
    test_process_crawl_complete()
    
    print("\nテスト完了!") 