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
        bufsize=1,
        encoding='utf-8',  # UTF-8エンコーディングを指定
        errors='replace'  
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
    
    # プロジェクトルートを取得
    project_root = os.getenv("PROJECT_ROOT")
    if not project_root:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
    
    # functions_pathを正しく設定
    functions_path = os.path.join(project_root, "backend", "functions")
    source_path = os.path.join(functions_path, source)
    
    print(f"=== Function起動情報 ===")
    print(f"関数名: {target}")
    print(f"ソースファイル: {source_path}")
    print(f"ポート: {port}")
    print(f"環境変数: {env_vars}")
    
    # ファイルの存在確認
    if not os.path.exists(source_path):
        raise FileNotFoundError(f"ソースファイルが見つかりません: {source_path}")
    
    # 現在のPythonインタープリタのパスを取得
    python_path = sys.executable
    
    # コマンドを構築（ポートとシグネチャーを指定）
    command = [
        python_path,
        "-m", "functions_framework",
        "--target", target,
        "--source", source,
        "--port", str(port),
        "--signature-type", "http",  # HTTPシグネチャーを指定
        "--host", "127.0.0.1",       # ホストを指定
        "--debug"
    ]
    
    print(f"実行コマンド: {' '.join(command)}")
    
    # 環境変数を設定
    env_dict = os.environ.copy()
    env_dict.update(env_vars)
    
    # 関数を起動して出力をリアルタイム表示
    process = subprocess.Popen(
        command,
        cwd=functions_path,
        env=env_dict,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,  # stderrも取得するように変更
        universal_newlines=True,
        bufsize=1,
        encoding='utf-8',
        errors='replace'
    )
    
    def log_output(process):
        while True:
            # stdoutとstderrの両方からログを読み取る
            stdout_line = process.stdout.readline()
            stderr_line = process.stderr.readline()
            
            if stdout_line:
                print(f"[Function:{target}:stdout] | {stdout_line.strip()}")
            if stderr_line:
                print(f"[Function:{target}:stderr] | {stderr_line.strip()}")
            
            # プロセスが終了していたら終了
            if process.poll() is not None:
                break
    
    # 出力を別スレッドで処理
    thread = threading.Thread(target=log_output, args=(process,))
    thread.daemon = True
    thread.start()
    
    return process

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
    
    # 自動テスト実行
    def run_test():
        print("\n=== collect_urls関数を呼び出し中... ===")
        try:
            # collect_urls関数を呼び出し
            collect_url = f"http://127.0.0.1:{os.getenv('COLLECT_URLS_PORT', '8090')}"
            print(f"リクエストURL: {collect_url}")
            
            # リトライロジックを追加
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = requests.get(collect_url, timeout=10)
                    print(f"ステータス: {response.status_code}")
                    print(f"レスポンス: {response.text}")
                    break
                except requests.RequestException as e:
                    print(f"試行 {attempt + 1}/{max_retries} 失敗: {e}")
                    if attempt < max_retries - 1:
                        time.sleep(5)  # 5秒待ってリトライ
                    else:
                        raise
            
            # エラーの場合は詳細を表示
            if response.status_code != 200:
                print(f"エラーレスポンス: {response.text}")
        except Exception as e:
            print(f"テスト実行エラー: {e}")
            import traceback
            print(traceback.format_exc())
    
    # テストを別スレッドで実行
    test_thread = threading.Thread(target=run_test)
    test_thread.daemon = True
    test_thread.start()
    
    # メインスレッドを維持
    try:
        while True:
            # プロセスの状態を確認
            all_running = True
            for i, proc in enumerate(processes):
                if proc.poll() is not None:
                    print(f"プロセス {i+1} が終了しました（終了コード: {proc.poll()}）")
                    all_running = False
            
            if not all_running:
                break
            
            time.sleep(1)
    
    except KeyboardInterrupt:
        print("\n=== 開発環境を終了します ===")
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main() 