import os
import subprocess
import sys
import time
import threading
import requests
from dotenv import load_dotenv
import pymysql

# .envファイルを読み込む
load_dotenv()

def run_command(command, prefix=""):
    """コマンドを実行し、リアルタイムで出力を表示"""
    process = subprocess.Popen(
        command,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1
    )
    
    def log_output(stream):
        for line in stream:
            if line.strip():  # 空行を除外
                print(f"[{prefix}] | {line.strip()}")
        
    # 出力を別スレッドで処理
    thread = threading.Thread(target=log_output, args=(process.stdout,))
    thread.daemon = True
    thread.start()
    
    return process, thread

def start_docker():
    """Dockerコンテナを起動"""
    print("=== Dockerコンテナを起動中... ===")
    
    # プロジェクトルートを取得
    project_root = os.getenv("PROJECT_ROOT")
    if not project_root:
        # 現在のスクリプトのディレクトリを取得
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # プロジェクトルートディレクトリを推測
        project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
    
    # docker-compose.dev.ymlへの絶対パスを構築
    docker_compose_path = os.path.join(
        project_root,
        "backend",
        "emulator",
        "docker-compose.dev.yml"
    )
    
    print(f"Docker Compose設定ファイル: {docker_compose_path}")
    
    # Dockerコマンドを実行
    proc, _ = run_command(f"docker-compose -f {docker_compose_path} up -d", "[Docker]")
    proc.wait()  # コンテナ起動を待機
    print("=== Dockerコンテナの起動完了 ===")
    # コンテナが完全に起動するまで少し待機
    time.sleep(10)

def check_pubsub():
    """Pub/Subトピックとサブスクリプションを確認/作成"""
    print("=== Pub/Subトピックを確認中... ===")
    
    # 環境変数からプロジェクトルートを取得（設定されていない場合は推測）
    project_root = os.getenv("PROJECT_ROOT")
    if not project_root:
        # 現在のスクリプトのディレクトリを取得
        current_dir = os.path.dirname(os.path.abspath(__file__))
        # プロジェクトルートディレクトリを推測
        project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
    
    # setup_pubsub.pyへのパスを構築
    script_path = os.path.join(project_root, "backend", "crawlers", "tiktok_crawler", "setup_pubsub.py")
    
    print(f"実行するスクリプトパス: {script_path}")
    
    # スクリプトが存在するか確認
    if not os.path.exists(script_path):
        print(f"エラー: スクリプトが見つかりません: {script_path}")
        return
    
    proc, _ = run_command(f"python {script_path}", "[Pub/Sub]")
    proc.wait()

def start_function(target, source, port, env_vars=None):
    """Cloud Function開始"""
    if env_vars is None:
        env_vars = {}
    
    # 絶対パスを指定
    functions_path = r"C:\Users\kyoto\app\tik-analytics\Tiktok-analytics\backend\functions"
    source_path = os.path.join(functions_path, source)
    
    print(f"=== Function起動情報 ===")
    print(f"関数名: {target}")
    print(f"ソースファイル: {source_path}")
    print(f"ポート: {port}")
    print(f"Pub/Subエミュレーター: {env_vars.get('PUBSUB_EMULATOR_HOST')}")
    
    # ファイルの存在確認
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"ソースファイルが見つかりません: {source_path}")
    
    # Windows環境用のコマンド構築
    env_str = " && ".join([f"set {k}={v}" for k, v in env_vars.items()])
    command = f"cd {functions_path} && {env_str} && functions-framework --target={target} --source={source} --port={port}"
    
    print(f"実行コマンド: {command}")
    
    # 関数を起動して出力をリアルタイム表示
    proc, _ = run_command(command, f"[Function:{target}]")
    return proc

def start_crawler():
    """アカウントクローラーを起動 - Dockerコンテナ内で実行"""
    print("=== アカウントクローラーを起動中... ===")
    
    # コンテナの状態を確認
    run_command("docker ps", "Docker PS")
    
    try:
        # クローラーを起動して出力をリアルタイム表示
        command = "docker exec -t tiktok_account_crawler python -m tiktok_crawler.account_crawler.crawler"
        print(f"実行コマンド: {command}")
        
        # -tオプションを追加してTTYを割り当て、出力をバッファリングしない
        # encoding='utf-8'を追加して文字化けを防ぐ
        proc = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
            encoding='utf-8',
            errors='replace'  # デコードできない文字は置換文字に変換
        )
        
        # リアルタイムでログを表示
        for line in proc.stdout:
            if line.strip():  # 空行を除外
                print(f"[AccountCrawler] {line.strip()}")
        
        return proc
        
    except Exception as e:
        print(f"アカウントクローラーの起動に失敗しました: {e}")
        import traceback
        print(traceback.format_exc())
        return None

def check_processing_complete():
    """すべてのアカウント処理が完了したかチェック"""
    try:
        conn = pymysql.connect(
            host="127.0.0.1",
            port=int(os.environ.get("MYSQL_PORT", 3306)),
            user=os.environ.get("MYSQL_USER", "tiktok_user"),
            password=os.environ.get("MYSQL_PASSWORD", "tiktok_pass"),
            database=os.environ.get("MYSQL_DATABASE", "tiktok_data"),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )
        
        with conn.cursor() as cursor:
            # 更新が必要なアカウントが残っているかチェック
            sql = """
            SELECT COUNT(*) as count
            FROM tiktok_data.account_list
            WHERE needs_update = TRUE
            """
            cursor.execute(sql)
            result = cursor.fetchone()
            remaining = result['count']
            
            if remaining == 0:
                print("すべてのアカウント処理が完了しました！")
                return True
            else:
                print(f"まだ {remaining} 件のアカウントが処理待ちです")
                return False
                
    except Exception as e:
        print(f"処理完了チェックエラー: {e}")
        return False

def setup_environment():
    """環境変数を設定"""
    # Docker外のプロセス用の環境変数（ローカル実行用）
    local_env_vars = {
        "PUBSUB_EMULATOR_HOST": "127.0.0.1:8681",  # localhostの代わりにIPアドレスを使用
        "PROJECT_ID": "local-project",
        "MYSQL_HOST": "127.0.0.1",  # こちらも同様
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "tiktok_user",
        "MYSQL_PASSWORD": "tiktok_pass",
        "MYSQL_DATABASE": "tiktok_data",
        "ENVIRONMENT": "development",
        "GOOGLE_CLOUD_PROJECT": "local-project"  # この環境変数を追加
    }
    
    # Docker内のプロセス用の環境変数は変更なし
    docker_env_vars = {
        "PUBSUB_EMULATOR_HOST": "pubsub:8681",
        "PROJECT_ID": "local-project",
        "MYSQL_HOST": "host.docker.internal",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "tiktok_user",
        "MYSQL_PASSWORD": "tiktok_pass",
        "MYSQL_DATABASE": "tiktok_data",
        "ENVIRONMENT": "development",
        "GOOGLE_CLOUD_PROJECT": "local-project"  # この環境変数を追加
    }
    
    # ローカル環境変数を設定
    for key, value in local_env_vars.items():
        os.environ[key] = value
        print(f"環境変数設定: {key}={value}")
    
    return local_env_vars, docker_env_vars

#def test_collect_urls():
 #   """collect_urls関数の動作確認"""
#    try:
#        response = requests.post(
#            "http://127.0.0.1:8090",
#            headers={"Content-Type": "application/json"},
#            json={},
#            timeout=30
#        )
#        
#        success = response.status_code == 200
#        print(f"collect_urls テスト: {'成功' if success else '失敗'}")
#        print(f"レスポンス: {response.text}")
#        
#        return success
#                
#    except Exception as e:
#        print(f"collect_urls テストエラー: {e}")
#        return False

def main():
    """メイン処理"""
    # 環境変数を設定
    local_env, docker_env = setup_environment()
    
    # Docker起動
    start_docker()
    
    # Pub/Sub確認
    check_pubsub()
    
    # プロセス一覧
    processes = []
    
    # collect_urls関数を起動
    print("\n=== collect_urls関数を起動中... ===")
    collect_proc = start_function(
        target="collect_urls",
        source="url_collector.py",
        port=os.getenv("COLLECT_URLS_PORT", "8090"),
        env_vars=local_env
    )
    if collect_proc:  # Noneでない場合のみ追加
        processes.append(collect_proc)
    
    # サーバーの起動を待機（より長く）
    print("サーバーの起動を待機中...")
    time.sleep(15)  # 15秒待機に延長
    
    # テストを実行
    #success = test_collect_urls()
    #if not success:
    #    print("collect_urls関数のテストに失敗しました")
    #else:
    #    print("collect_urls関数のテストが完了しました")
    
    # process_crawl_complete関数を起動
    #print("\n=== process_crawl_complete関数を起動中... ===")
    #crawl_proc = start_function(
    #    "process_crawl_complete", "crawl_processor.py", os.getenv("PROCESS_CRAWL_PORT", "8091"),
    #    env_vars=local_env
    #)
    #if crawl_proc:  # Noneでない場合のみ追加
    #    processes.append(crawl_proc)
    
    # クローラーを起動
    print("\n=== アカウントクローラーを起動中... ===")
    crawler_proc = start_crawler()
    if crawler_proc:  # Noneでない場合のみ追加
        processes.append(crawler_proc)
    
    # プロセスリストが空の場合は終了
    if not processes:
        print("エラー: 起動できたプロセスがありません")
        return
    
    print("\n=== 開発環境が起動しました ===")
    print(f"collect_urls: http://localhost:{os.getenv('COLLECT_URLS_PORT', '8090')}")
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