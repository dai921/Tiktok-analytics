import os
import subprocess
import sys
import time

def start_docker_env():
    """Docker環境を起動する"""
    print("Docker環境を起動しています...")
    
    # Docker Composeファイルの存在確認
    compose_file = "docker-compose.dev.yml"
    if not os.path.exists(compose_file):
        print(f"エラー: {compose_file} が見つかりません。")
        print(f"現在のディレクトリ: {os.getcwd()}")
        return False
    
    # Docker Composeコマンドの実行
    try:
        print(f"{compose_file} を使用してコンテナを起動します...")
        subprocess.run(["docker-compose", "-f", compose_file, "down"], check=True)
        subprocess.run(["docker-compose", "-f", compose_file, "up", "-d"], check=True)
        
        # 起動確認
        print("コンテナの起動を確認しています...")
        time.sleep(5)  # コンテナ起動を待機
        
        # 起動状態確認
        result = subprocess.run(
            ["docker-compose", "-f", compose_file, "ps"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        
        print("\n=== Docker コンテナの状態 ===")
        print(result.stdout)
        
        # Up状態のコンテナ数を確認
        if "Up" in result.stdout:
            print("Docker環境が正常に起動しました。")
            return True
        else:
            print("警告: コンテナが起動していません。ログを確認してください。")
            # ログを表示
            subprocess.run(["docker-compose", "-f", compose_file, "logs"], check=True)
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"Docker Compose実行中にエラー: {e}")
        print(f"エラー出力: {e.stderr if hasattr(e, 'stderr') else '不明'}")
        return False
    except Exception as e:
        print(f"予期せぬエラー: {e}")
        import traceback
        print(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = start_docker_env()
    sys.exit(0 if success else 1) 