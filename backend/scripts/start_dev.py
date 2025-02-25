import os
import subprocess
import sys
import time
import threading
import requests
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

def run_command(command, log_prefix=""):
    """コマンドを実行し、出力をプレフィックス付きで表示"""
    process = subprocess.Popen(
        command, 
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        text=True
    )
    
    # リアルタイム出力処理
    def read_output():
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                print(f"{log_prefix} | {output.strip()}")
    
    # 出力読み取りスレッドを開始
    t = threading.Thread(target=read_output)
    t.daemon = True
    t.start()
    
    # プロセスと出力スレッドを返す
    return process, t

def start_docker():
    """Dockerコンテナを起動"""
    print("=== Dockerコンテナを起動中... ===")
    proc, _ = run_command("docker-compose -f docker-compose.dev.yml up -d", "[Docker]")
    proc.wait()  # コンテナ起動を待機
    print("=== Dockerコンテナの起動完了 ===")
    # コンテナが完全に起動するまで少し待機
    time.sleep(5)

def check_pubsub():
    """Pub/Subトピックとサブスクリプションを確認/作成"""
    print("=== Pub/Subトピックを確認中... ===")
    proc, _ = run_command("python scripts/pubsub_debug.py", "[Pub/Sub]")
    proc.wait()
    
    print("=== 不足しているトピックがあれば作成 ===")
    proc, _ = run_command("python scripts/create_missing_topics.py", "[Pub/Sub]")
    proc.wait()

def start_function(target, source, port, env_vars=None):
    """Cloud Function開始 - デバッグフラグなしバージョン"""
    if env_vars is None:
        env_vars = {}
    
    # デバッグ関連の環境変数を設定
    env_vars["FLASK_DEBUG"] = "0"
    env_vars["FLASK_ENV"] = "production"
    
    # プラットフォーム検出
    is_windows = sys.platform.startswith('win')
    
    if is_windows:
        # Windows用の環境変数設定（CMD形式）
        env_str = " && ".join([f"set {k}={v}" for k, v in env_vars.items()])
        
        # デバッグフラグを削除
        command = f"cd functions && {env_str} && functions-framework --target={target} --source={source} --port={port}"
    else:
        # Linux/Mac用
        env_str = " ".join([f"{k}={v}" for k, v in env_vars.items()])
        command = f"cd functions && {env_str} functions-framework --target={target} --source={source} --port={port}"
    
    # 関数を起動して出力をリアルタイム表示
    proc, _ = run_command(command, f"[Function:{target}]")
    return proc

def start_crawler():
    """アカウントクローラーを起動 - Windows対応版"""
    print("=== アカウントクローラーを起動中... ===")
    
    # プラットフォーム検出
    is_windows = sys.platform.startswith('win')
    
    if is_windows:
        # Windows用
        env_str = f"set PUBSUB_EMULATOR_HOST={os.getenv('PUBSUB_EMULATOR_HOST')} && set PROJECT_ID={os.getenv('PROJECT_ID')}"
        command = f"{env_str} && python -m crawlers.tiktok_crawler.account_crawler.crawler"
    else:
        # Linux/Mac用
        env_str = f"PUBSUB_EMULATOR_HOST={os.getenv('PUBSUB_EMULATOR_HOST')} PROJECT_ID={os.getenv('PROJECT_ID')}"
        command = f"{env_str} python -m crawlers.tiktok_crawler.account_crawler.crawler"
    
    # クローラーを起動して出力をリアルタイム表示
    proc, _ = run_command(command, "[AccountCrawler]")
    return proc

def main():
    # 必要な環境変数を読み込む
    pubsub_host = os.getenv("PUBSUB_EMULATOR_HOST", "localhost:8681")
    project_id = os.getenv("PROJECT_ID", "local-project")
    
    # Docker起動
    start_docker()
    
    # Pub/Sub確認
    check_pubsub()
    
    # ベース環境変数
    base_env = {
        "PUBSUB_EMULATOR_HOST": pubsub_host,
        "PROJECT_ID": project_id,
        "ENVIRONMENT": "development"
    }
    
    # プロセス一覧
    processes = []
    
    # collect_urls関数を起動
    print("\n=== collect_urls関数を起動中... ===")
    collect_proc = start_function(
        "collect_urls", "url_collector.py", os.getenv("COLLECT_URLS_PORT", "8090"),
        env_vars=base_env
    )
    processes.append(collect_proc)
    
    # process_crawl_complete関数を起動
    print("\n=== process_crawl_complete関数を起動中... ===")
    crawl_proc = start_function(
        "process_crawl_complete", "crawl_processor.py", os.getenv("PROCESS_CRAWL_PORT", "8091"),
        env_vars=base_env
    )
    processes.append(crawl_proc)
    
    # クローラーを起動
    print("\n=== アカウントクローラーを起動中... ===")
    crawler_proc = start_crawler()
    processes.append(crawler_proc)
    
    print("\n=== 開発環境が起動しました ===")
    print(f"collect_urls: http://localhost:{os.getenv('COLLECT_URLS_PORT', '8090')}")
    print(f"process_crawl_complete: Pub/Subトピック 'crawl-complete' 経由で起動")
    print("すべてのログがリアルタイムで表示されます")
    print("終了するには Ctrl+C を押してください")
    
    # 自動テスト実行 - 5秒待機してから実行
    def run_test():
        print("\n=== 5秒後に自動テストを実行します... ===")
        time.sleep(5)
        try:
            # collect_urls関数を呼び出し
            collect_url = f"http://localhost:{os.getenv('COLLECT_URLS_PORT', '8090')}"
            print(f"\n=== collect_urls関数を呼び出し中: {collect_url} ===")
            response = requests.get(collect_url)
            print(f"ステータス: {response.status_code}")
            print(f"レスポンス: {response.text}")
        except Exception as e:
            print(f"テスト実行エラー: {e}")
    
    # テストを別スレッドで実行
    test_thread = threading.Thread(target=run_test)
    test_thread.daemon = True
    test_thread.start()
    
    # メインスレッドを維持
    try:
        while all(p.poll() is None for p in processes):
            time.sleep(1)
        
        # いずれかのプロセスが終了した場合
        for i, proc in enumerate(processes):
            if proc.poll() is not None:
                print(f"プロセス {i+1} が終了しました（終了コード: {proc.poll()}）")
    
    except KeyboardInterrupt:
        print("\n=== 開発環境を終了します ===")
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main() 