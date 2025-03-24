import os
import json
import logging
import argparse
from datetime import datetime
from db_utils import get_connection, execute_query, execute_write_query, DatabaseError
from config import initialize_config, get_environment

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 設定の初期化
initialize_config()

def get_video_data(video_id):
    """
    video_masterテーブルから指定されたIDの動画データを取得する
    
    Args:
        video_id (str): 取得する動画のID
    
    Returns:
        dict: 取得した動画データ
    """
    logger.info(f"====== 動画データ取得開始：{datetime.now().isoformat()} ======")
    
    try:
        query = """
            SELECT 
                video_id, username, url, description, hashtags
            FROM 
                video_master
            WHERE 
                video_id = %s
        """
        
        results = execute_query(query, (video_id,))
        
        if not results:
            error_msg = f"指定されたvideo_id: {video_id} は存在しません"
            logger.error(error_msg)
            return {"error": error_msg}
        
        logger.info(f"動画データ取得成功: {results[0]}")
        return results[0]
    
    except DatabaseError as e:
        logger.error(f"データベースエラー: {str(e)}")
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}

def analyze_category(video_data):
    """
    動画データからカテゴリのみを判定する関数
    
    Args:
        video_data (dict): 動画データを含む辞書
    
    Returns:
        dict: カテゴリ判定結果を含む辞書
    """
    logger.info(f"====== カテゴリ分析開始：{datetime.now().isoformat()} ======")
    
    try:
        # カテゴリキーワードの取得
        category_query = """
            SELECT ck.keyword, ck.is_product, cm.category_name, cm.category_id
            FROM category_keywords ck
            JOIN category_master cm ON ck.category_id = cm.category_id
        """
        keywords_data = execute_query(category_query)
        
        # カテゴリの判定
        categories = set()
        description = video_data.get('description', '').lower()
        hashtags = video_data.get('hashtags', '')
        
        # ハッシュタグの処理を単純化
        if isinstance(hashtags, str):
            # カンマ区切りの文字列として処理
            hashtags = [tag.strip() for tag in hashtags.split(',') if tag.strip()]
        elif isinstance(hashtags, list):
            # リストの場合はそのまま使用
            hashtags = [str(tag).strip() for tag in hashtags if str(tag).strip()]
        else:
            # その他の場合は空リストとして扱う
            hashtags = []
        
        # ハッシュタグのテキストを結合（カテゴリ判定用）
        hashtags_text = ' '.join(hashtags).lower()

        for keyword_data in keywords_data:
            keyword = keyword_data['keyword'].lower()
            if keyword in description or keyword in hashtags_text:
                categories.add((
                    keyword_data['category_name'],
                    keyword_data['is_product']
                ))

        # カテゴリ名をカンマ区切りで結合（空の場合は「その他」）
        category_names = ','.join(sorted(set(cat[0] for cat in categories))) if categories else 'その他'
        
        # プロダクトフラグがTrueのカテゴリがあれば、そのカテゴリ名をproductとして設定
        product_categories = [cat[0] for cat in categories if cat[1]]
        product_names = ','.join(sorted(product_categories)) if product_categories else None

        # 結果を辞書で返す（カテゴリとプロダクトのみ）
        result = {
            'category': category_names,
            'product': product_names,
            'matched_categories': list(categories)
        }
        
        logger.info(f"カテゴリ分析結果: {result}")
        return result
        
    except DatabaseError as e:
        logger.error(f"データベースエラー: {str(e)}")
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"error": str(e)}

def update_category(video_id, category_data):
    """
    動画のカテゴリ情報のみをデータベースに更新する関数
    
    Args:
        video_id (str): 更新する動画のID
        category_data (dict): カテゴリデータを含む辞書
    
    Returns:
        dict: 更新結果を含む辞書
    """
    logger.info(f"====== カテゴリ情報更新開始：{datetime.now().isoformat()} ======")
    
    try:
        # カテゴリ情報の更新（categoryとproductのみ）
        update_query = """
            UPDATE video_master 
            SET category = %s,
                product = %s
            WHERE video_id = %s
        """
        
        params = (
            category_data.get('category'),
            category_data.get('product'),
            video_id
        )
        
        execute_write_query(update_query, params)
        
        logger.info(f"video_id: {video_id} のカテゴリ情報を更新しました")
        return {"success": True, "message": f"video_id: {video_id} のカテゴリ情報を更新しました"}
        
    except DatabaseError as e:
        logger.error(f"データベースエラー: {str(e)}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

def process_video(video_id):
    """
    指定されたvideo_idの動画データを取得し、カテゴリを再判定して更新する
    
    Args:
        video_id (str): 処理する動画のID
    
    Returns:
        dict: 処理結果を含む辞書
    """
    logger.info(f"====== 動画処理開始[video_id:{video_id}]：{datetime.now().isoformat()} ======")
    
    try:
        # 1. 動画データの取得
        video_data = get_video_data(video_id)
        
        if 'error' in video_data:
            return {"success": False, "error": video_data['error']}
        
        # 2. カテゴリ分析の実行
        category_result = analyze_category(video_data)
        
        if 'error' in category_result:
            return {"success": False, "error": category_result['error']}
        
        # 3. カテゴリ情報の更新
        update_result = update_category(video_id, category_result)
        
        if not update_result.get('success', False):
            return update_result
        
        # 4. 結果の返却
        result = {
            "success": True,
            "video_id": video_id,
            "category_data": category_result,
            "message": update_result.get('message')
        }
        
        return result
    
    except Exception as e:
        logger.error(f"動画処理エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}

def main():
    """コマンドラインから実行するためのメイン関数"""
    parser = argparse.ArgumentParser(description='動画IDからカテゴリを再判定し更新するツール')
    parser.add_argument('--video-id', type=str, required=True, help='処理する動画のID')
    args = parser.parse_args()
    
    try:
        # 動画処理の実行
        result = process_video(args.video_id)
        
        # 結果の出力
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
    except Exception as e:
        logger.error(f"実行エラー: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()