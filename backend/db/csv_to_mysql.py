import pandas as pd
import mysql.connector
from mysql.connector import Error
import numpy as np
import math

def fix_nan(row):
    """Series → tuple の変換時に NaN を None に統一"""
    return tuple(None if (isinstance(v, float) and math.isnan(v)) else v for v in row)


def import_csv_to_mysql():
    try:
        # CSVファイルを読み込み（エンコーディングを指定）
        df = pd.read_csv('affi_5.csv', encoding='utf-8')
        df = df.astype(object).where(pd.notnull(df), None)
        
        # データの確認
        print("CSVの基本情報:")
        print(f"行数: {len(df)}")
        print(f"列数: {len(df.columns)}")
        print(f"列名: {df.columns.tolist()}")
        print("\n最初の5行:")
        print(df.head())
        
        # データ型の確認
        print("\nデータ型:")
        print(df.dtypes)
        
        # 問題のある値を確認
        print("\nsave_count_increaseの値:")
        print(df['save_count_increase'].unique())
        
        # 数値列の変換（エラー値を0に変換）
        numeric_columns = ['save_count', 'save_count_increase']
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                df[col] = df[col].fillna(0)
        
        df = df.where(pd.notnull(df), None)

        
        # MySQL接続
        connection = mysql.connector.connect(
            host='localhost',
            database='tiktok_data',  # データベース名を変更
            user='tiktok_user',           # ユーザー名を変更
            password='tiktok_pass'        # パスワードを変更
        )
        
        if connection.is_connected():
            cursor = connection.cursor()
            
            # テーブル構造を確認
            cursor.execute("DESCRIBE frontend_data")
            table_structure = cursor.fetchall()
            print("\nテーブル構造:")
            for row in table_structure:
                print(row)
            
            # データを1行ずつ挿入
            for index, row in df.iterrows():
                try:
                    # 列名を明示的に指定してINSERT
                    insert_query = """
                    INSERT INTO frontend_data 
                    (url, thumbnail_url, created_at, play_count, play_count_increase, account_name, likes_count,comment_count, 
                    hashtags, music_info, caption, category, display_name, content_type, ten_days_increase, product, likes_count_increase, 
                    ten_days_likes_increase, comment_count_increase, ten_days_comment_increase, account_type, save_count, save_count_increase, 
                    video_id, ten_days_save_increase,is_pr)
                    VALUES ( %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    # 実際の列名に合わせて調整してください
                    
                    cursor.execute(insert_query, fix_nan(row))
                    
                except Error as e:
                    print(f"行 {index + 1} でエラー: {e}")
                    print(f"データ: {row.tolist()}")
                    # エラーがあっても続行
                    continue
            
            # 変更をコミット
            connection.commit()
            print(f"\n{len(df)}行のデータを正常にインポートしました。")
            
    except Error as e:
        print(f"MySQLエラー: {e}")
    except Exception as e:
        print(f"一般的なエラー: {e}")
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()

# 実行
if __name__ == "__main__":
    import_csv_to_mysql()