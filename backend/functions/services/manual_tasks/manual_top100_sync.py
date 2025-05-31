import os
import json
import logging
from datetime import datetime, timedelta
import functions_framework
from core.db_utils import execute_query, execute_write_query
from core.config import initialize_config
from flask import jsonify, Request
import argparse
import sys

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

@functions_framework.http
def collect_historical_top100_videos(request):
    """
    既存データからproduct_daily_top100_videosテーブルにデータを収集するHTTPトリガー関数
    
    Args:
        request (flask.Request): HTTPリクエストオブジェクト
    Returns:
        flask.Response: 処理結果のJSONレスポンス
    """
    logger.info("==== 過去データの商品別TOP100動画収集処理の開始 ====")
    
    try:
        # リクエストパラメータを取得
        request_json = request.get_json(silent=True)
        
        # 日付範囲の取得（指定がなければデフォルト値を使用）
        start_date = request_json.get('start_date') if request_json else None
        end_date = request_json.get('end_date') if request_json else None
        product = request_json.get('product') if request_json else None
        
        if not start_date:
            # デフォルトは90日前から
            start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        
        if not end_date:
            # デフォルトは昨日まで
            end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        result = process_top100_data(start_date, end_date, product)
        return jsonify(result)
        
    except Exception as e:
        error_message = f"過去データの商品別TOP100動画収集処理中にエラーが発生しました: {str(e)}"
        logger.error(error_message)
        import traceback
        logger.error(traceback.format_exc())
        
        return jsonify({
            "status": "error", 
            "error": error_message, 
            "time": datetime.now().isoformat()
        }), 500
    
    finally:
        logger.info("==== 過去データの商品別TOP100動画収集処理の終了 ====")

def process_top100_data(start_date, end_date, specific_product=None):
    """
    指定された日付範囲のTOP100動画データを処理する
    
    Args:
        start_date (str): 開始日（YYYY-MM-DD形式）
        end_date (str): 終了日（YYYY-MM-DD形式）
        specific_product (str, optional): 特定の商品名（指定した場合はその商品のみ処理）
    Returns:
        dict: 処理結果
    """
    # 処理対象の日付リストを取得
    date_query = """
    SELECT DISTINCT collection_date 
    FROM play_count_history
    WHERE collection_date BETWEEN %s AND %s
    ORDER BY collection_date
    """
    dates = execute_query(date_query, (start_date, end_date))
    
    if not dates:
        return {
            "status": "warning",
            "message": f"指定期間 {start_date} から {end_date} のデータが見つかりませんでした"
        }
    
    # 商品リストを取得（カテゴリが空または'複数'のものを除外）
    products_query = """
    SELECT DISTINCT product_name, product_category 
    FROM product_master
    WHERE product_category != '' AND product_category != '複数'
    """
    
    # 特定の商品が指定されている場合は条件を追加
    if specific_product:
        products_query += " AND product_name = %s"
        products = execute_query(products_query, (specific_product,))
    else:
        products = execute_query(products_query)
    
    # 日付と商品の組み合わせごとに処理
    processed_count = 0
    success_count = 0
    error_count = 0
    
    # 処理結果の検証
    validation_issues = []
    
    for date_obj in dates:
        collection_date = date_obj['collection_date']
        logger.info(f"日付 {collection_date} の処理を開始")
        
        for product in products:
            product_name = product['product_name']
            product_category = product['product_category']
            
            # 各日付・商品の組み合わせで、まず既存のランキングデータを削除
            # これは一貫性を保つために必要（部分的な更新を避けるため）
            delete_query = """
            DELETE FROM product_daily_top100_videos
            WHERE fetch_date = %s AND product = %s
            """
            execute_write_query(delete_query, (collection_date, product_name))
            
            # 商品別TOP100動画を一括挿入（改善版 - ランク付け排除）
            insert_query = """
            INSERT INTO product_daily_top100_videos 
            (video_id, fetch_date, product, product_category, plays_increase, likes_increase, post_time, thumbnail_url)
            SELECT 
                pch.video_id,
                %s as fetch_date,
                fd.product,
                %s as product_category,
                pch.play_count_increase as plays_increase,
                pch.likes_count_increase as likes_increase,
                fd.created_at as post_time,
                fd.thumbnail_url
            FROM 
                play_count_history pch
            JOIN 
                frontend_data fd ON pch.video_id = fd.video_id
            WHERE 
                fd.product = %s
                AND pch.collection_date = %s
                AND pch.play_count_increase IS NOT NULL
                AND pch.likes_count_increase IS NOT NULL
            ORDER BY 
                pch.play_count_increase DESC, pch.video_id DESC
            LIMIT 100
            """
            
            try:
                execute_write_query(insert_query, (collection_date, product_category, product_name, collection_date))
                success_count += 1
                logger.info(f"商品 '{product_name}' の日付 {collection_date} のデータを処理しました")
            except Exception as e:
                error_count += 1
                logger.error(f"商品 '{product_name}' の日付 {collection_date} の処理中にエラー発生: {str(e)}")
                # エラーが発生しても処理を続行
                continue
            
            processed_count += 1
            
        
        logger.info(f"日付 {collection_date} の処理が完了しました")
    
    logger.info(f"過去データの商品別TOP100動画収集が完了しました。処理件数: {processed_count}、成功: {success_count}、エラー: {error_count}")
    
    # 修正コードを実行する場合
    if validation_issues:
        logger.warning(f"全部で{len(validation_issues)}件の問題が検出されました。修正が必要です。")
        # ここで修正処理を実行することも可能
    
    return {
        "status": "success",
        "message": "過去データの商品別TOP100動画収集が完了しました",
        "start_date": start_date,
        "end_date": end_date,
        "processed_combinations": processed_count,
        "success_count": success_count,
        "error_count": error_count,
        "execution_time": datetime.now().isoformat(),
        "validation_issues": validation_issues,
        "has_issues": len(validation_issues) > 0
    }

def main():
    """
    コマンドラインからの実行用メイン関数
    """
    parser = argparse.ArgumentParser(description='商品別TOP100動画の過去データ収集')
    parser.add_argument('--start-date', type=str, help='処理開始日 (YYYY-MM-DD形式)')
    parser.add_argument('--end-date', type=str, help='処理終了日 (YYYY-MM-DD形式)')
    parser.add_argument('--product', type=str, help='特定の商品のみ処理する場合の商品名')
    
    args = parser.parse_args()
    
    # デフォルト値の設定
    start_date = args.start_date
    end_date = args.end_date
    specific_product = args.product
    
    if not start_date:
        # デフォルトは90日前
        start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
        print(f"開始日が指定されていないため、デフォルト値 {start_date} を使用します")
    
    if not end_date:
        # デフォルトは昨日
        end_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        print(f"終了日が指定されていないため、デフォルト値 {end_date} を使用します")
    
    if specific_product:
        print(f"特定の商品 '{specific_product}' のみを処理します")
    
    print(f"処理期間: {start_date} から {end_date}")
    
    # データ処理を実行
    result = process_top100_data(start_date, end_date, specific_product)
    
    # 結果を表示
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    return 0

# スクリプトとして直接実行された場合
if __name__ == "__main__":
    sys.exit(main())
