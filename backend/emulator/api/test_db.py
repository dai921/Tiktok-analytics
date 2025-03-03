import mysql.connector
import os

def test_connection():
    try:
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST', 'host.docker.internal'),
            user=os.getenv('MYSQL_USER', 'tiktok_user'),
            password=os.getenv('MYSQL_PASSWORD', 'tiktok_pass'),
            database=os.getenv('MYSQL_DATABASE', 'tiktok_data'),
            port=int(os.getenv('MYSQL_PORT', '3306'))
        )
        print("Connection successful!")
        print(f"Connected with: {conn.get_server_info()}")
        conn.close()
    except Exception as e:
        print(f"Connection failed: {str(e)}")

if __name__ == "__main__":
    test_connection() 