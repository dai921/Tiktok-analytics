import os
import pymysql

def test_mysql_auth():
    """MySQLの認証をテスト"""
    # 接続情報
    host = "localhost"  # または "192.168.0.5"
    port = 3306
    user = "tiktok_user"
    password = "tiktok_pass"
    database = "tiktok_data"
    
    print(f"接続情報:")
    print(f"- ホスト: '{host}'")
    print(f"- ポート: {port}")
    print(f"- ユーザー: '{user}'")
    print(f"- パスワード: '{password}'")
    print(f"- データベース: {database}")
    
    try:
        # 接続を試行
        connection = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset='utf8mb4',
            connect_timeout=5
        )
        
        print("接続成功!")
        connection.close()
        return True
    
    except Exception as e:
        print(f"接続エラー: {e}")
        return False

if __name__ == "__main__":
    test_mysql_auth() 