import functions_framework
import json
import logging
import base64
from datetime import datetime, timedelta
from typing import Dict, Any, List
from db_utils import execute_query, execute_write_query, DatabaseError
from config import initialize_config

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def process_category_statistics(event, context):
    """
    frontend_data_updateの処理完了を受け取り、カテゴリー別の統計情報を集計する
    
    Args:
        event (dict): Pub/Subイベントデータ（メッセージ内容を含む）
        context (google.cloud.functions.Context): メタデータを含むコンテキスト
    
    Returns:
        dict: 処理結果を含む辞書
    """
    logger.info("==== カテゴリー統計集計処理の開始 ====")
    
    try:
        # Pub/Subメッセージからデータを取得
        if 'data' in event:
            pubsub_message = base64.b64decode(event['data']).decode('utf-8')
            message_data = json.loads(pubsub_message)
            logger.info(f"Pub/Subメッセージを受信: {message_data}")
        else:
            logger.info("データなしのトリガー実行")
            message_data = {}
        
        # 完了ステータスのメッセージかどうかを確認
        if message_data.get("status") != "completed":
            logger.info(f"処理完了以外のステータスのため、集計をスキップします: {message_data.get('status')}")
            return {"status": "skipped", "reason": "Not a completion message"}
        
        logger.info("frontend_data_update処理完了を検知、カテゴリー別統計集計を開始します")
        
        # 集計処理を実行
        result = aggregate_category_statistics()
        
        logger.info(f"カテゴリー統計集計処理完了: {result}")
        return result
    
    except Exception as e:
        error_message = f"集計処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        return {"status": "error", "error": error_message, "time": datetime.now().isoformat()}
    finally:
        logger.info("==== カテゴリー統計集計処理の終了 ====")

def aggregate_category_statistics() -> Dict[str, Any]:
    """カテゴリー別の統計情報を集計"""
    try:
        # 集計日（現在日付の前日）- JSTから標準時間に変更
        aggregation_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
        
        # ビデオデータを取得するクエリ - 日付条件を追加
        query = """
        SELECT 
            id,
            category,
            playCountIncrease
        FROM 
            video_master
        WHERE 
            playCountIncrease >= 1
            AND category != 'その他'
            AND DATE(created_at) <= %s
        """
        
        # クエリを実行（パラメータとして集計日を渡す）
        video_data = execute_query(query, (aggregation_date,))
        
        if not video_data:
            logger.warning("集計対象のデータが見つかりませんでした")
            return {
                "status": "success",
                "message": "集計対象のデータがありません",
                "execution_time": datetime.now().isoformat()
            }
        
        # カテゴリごとの統計データを格納する辞書
        category_stats = {}
        
        # 各ビデオデータについて処理
        for video in video_data:
            # カンマで区切られたカテゴリを分割
            categories = [cat.strip() for cat in video['category'].split(',')]
            
            # 各カテゴリに対して統計を追加
            for category in categories:
                if not category:  # 空のカテゴリはスキップ
                    continue
                    
                # カテゴリが辞書になければ初期化
                if category not in category_stats:
                    category_stats[category] = {
                        'total_videos': 0,
                        'total_increase': 0,
                        'videos_10k_plus': 0,
                        'videos_100k_plus': 0
                    }
                
                # 統計を更新
                category_stats[category]['total_videos'] += 1
                category_stats[category]['total_increase'] += video['playCountIncrease']
                
                if video['playCountIncrease'] >= 10000:
                    category_stats[category]['videos_10k_plus'] += 1
                
                if video['playCountIncrease'] >= 100000:
                    category_stats[category]['videos_100k_plus'] += 1
        
        # 集計結果をデータベースに保存するための形式に変換
        statistics_records = []
        
        for category, stats in category_stats.items():
            total_videos = stats['total_videos']
            total_increase = stats['total_increase']
            videos_10k_plus = stats['videos_10k_plus']
            videos_100k_plus = stats['videos_100k_plus']
            
            # 割合の計算（小数点以下2桁まで）
            ratio_10k_plus = round((videos_10k_plus / total_videos) * 100, 2) if total_videos > 0 else 0
            ratio_100k_plus = round((videos_100k_plus / total_videos) * 100, 2) if total_videos > 0 else 0
            
            # データベースに保存するレコードを作成
            statistics_records.append({
                'aggregation_date': aggregation_date,
                'category': category,
                'total_increase': total_increase,
                'videos_10k_plus': videos_10k_plus,
                'videos_100k_plus': videos_100k_plus,
                'total_videos': total_videos,
                'ratio_10k_plus': ratio_10k_plus,
                'ratio_100k_plus': ratio_100k_plus
            })
            
            # ログに出力
            logger.info(f"カテゴリー: {category}, 総数: {total_videos}, 増加総数: {total_increase}, "
                       f"1万以上: {videos_10k_plus}({ratio_10k_plus}%), "
                       f"10万以上: {videos_100k_plus}({ratio_100k_plus}%)")
        
        # 統計データをデータベースに保存
        save_statistics_to_db(statistics_records)
        
        return {
            "status": "success",
            "message": f"{len(statistics_records)}カテゴリーの統計情報を集計しました",
            "aggregation_date": aggregation_date,
            "categories_processed": len(statistics_records),
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"統計集計中にエラーが発生: {str(e)}")
        raise

def save_statistics_to_db(statistics_records: List[Dict[str, Any]]) -> None:
    """統計情報をデータベースに保存"""
    try:
        # テーブルが存在しない場合は作成
        create_table_query = """
        CREATE TABLE IF NOT EXISTS trend_analysis (
            id INT AUTO_INCREMENT PRIMARY KEY,
            collection_date DATE NOT NULL,
            genre VARCHAR(100) NOT NULL,
            view_increase BIGINT NOT NULL,
            videos_10k_plus INT NOT NULL,
            videos_100k_plus INT NOT NULL,
            total_posts INT NOT NULL,
            ratio_10k_plus DECIMAL(5,2) NOT NULL,
            ratio_100k_plus DECIMAL(5,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
        execute_write_query(create_table_query)
        
        # 新しいデータを挿入（カテゴリと日付の組み合わせで既存データがあれば更新）
        for record in statistics_records:
            upsert_query = """
            INSERT INTO trend_analysis 
            (collection_date, genre, view_increase, videos_10k_plus, videos_100k_plus, 
             total_posts, ratio_10k_plus, ratio_100k_plus)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                view_increase = VALUES(view_increase),
                videos_10k_plus = VALUES(videos_10k_plus),
                videos_100k_plus = VALUES(videos_100k_plus),
                total_posts = VALUES(total_posts),
                ratio_10k_plus = VALUES(ratio_10k_plus),
                ratio_100k_plus = VALUES(ratio_100k_plus),
                created_at = CURRENT_TIMESTAMP
            """
            
            execute_write_query(upsert_query, (
                record['aggregation_date'],
                record['category'],
                record['total_increase'],
                record['videos_10k_plus'],
                record['videos_100k_plus'],
                record['total_videos'],
                record['ratio_10k_plus'],
                record['ratio_100k_plus']
            ))
            
        logger.info(f"{len(statistics_records)}件のカテゴリー統計を保存しました")
        
    except DatabaseError as e:
        logger.error(f"データベース操作中にエラーが発生: {str(e)}")
        raise

# ローカルテスト用
if __name__ == "__main__":
    try:
        result = aggregate_category_statistics()
        print("実行結果:", result)
    except Exception as e:
        print(f"エラーが発生しました: {str(e)}") 