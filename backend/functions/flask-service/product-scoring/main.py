import base64
import json
import logging
import re
from typing import List, Tuple, Dict, Any
from fuzzywuzzy import fuzz  # pip install fuzzywuzzy
# DB接続用のimport（仮。実際のDBユーティリティに合わせて修正してください）
# from db_utils import fetch_product_data
from db_utils import execute_write_query, DatabaseError, execute_query

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def normalize(text: str) -> str:
    """全角・半角・大文字小文字・空白正規化（簡易版）"""
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'\s+', '', text)
    # 必要に応じて全角→半角変換など追加
    return text

def fetch_product_data_from_db() -> Tuple[List[str], List[str], List[str]]:
    """
    DBから商品名・キーワード・カテゴリ特有キーワードを取得する
    
    Returns:
        Tuple[List[str], List[str], List[str]]: 
            - 商品名のリスト
            - キーワードのリスト（カンマ区切り）
            - カテゴリキーワードのリスト（カンマ区切り）
    """
    try:
        # 商品キーワードの取得
        product_query = """
            SELECT 
                pk.keyword,
                pm.product_name,
                pm.product_category
            FROM product_keywords pk
            JOIN product_master pm ON pk.product_id = pm.product_id
        """
        
        results = execute_query(product_query)
        
        # 商品ごとにキーワードをグループ化
        product_data = {}
        for row in results:
            product_name = row['product_name']
            if product_name not in product_data:
                product_data[product_name] = {
                    'keywords': set(),
                    'category': row['product_category']
                }
            product_data[product_name]['keywords'].add(row['keyword'])
        
        # リスト形式に変換
        product_names = []
        keywords_list = []
        category_keywords = []
        
        for product_name, data in product_data.items():
            product_names.append(product_name)
            keywords_list.append(','.join(data['keywords']))
            category_keywords.append(data['category'])
        
        logger.info(f"取得した商品数: {len(product_names)}")
        return product_names, keywords_list, category_keywords
        
    except DatabaseError as e:
        logger.error(f"商品データ取得エラー: {e}")
        raise

def get_alias_keywords(product_name: str) -> List[Dict[str, Any]]:
    """
    指定した商品名に対応する別名・キーワードを取得
    """
    alias_query = """
        SELECT 
            pa.alias_name,
            pa.alias_priority,
            pak.keyword
        FROM product_alias pa
        JOIN product_alias_keywords pak ON pa.alias_id = pak.alias_id
        WHERE pa.product_name = %s
    """
    return execute_query(alias_query, (product_name,))

def get_product_category(product_name: str) -> str:
    """
    指定した商品名のカテゴリを取得
    """
    updated_category_query = """
        SELECT product_category
        FROM product_master
        WHERE product_name = %s
    """
    result = execute_query(updated_category_query, (product_name,))
    if result:
        return result[0]['product_category']
    return ""

def score_product(transcription, product_names, keywords_list, mapped_product, category_keywords):
    norm_trans = normalize(transcription)
    norm_mapped = normalize(mapped_product) if mapped_product else ""
    best_score = 0
    best_product = ""
    log_details = []
    for pname, keywords, cat_kw in zip(product_names, keywords_list, category_keywords):
        if not pname:
            continue
        score = 0
        reasons = []
        # 1. 商品名同士の一致・類似度
        if pname in norm_mapped or norm_mapped in pname:
            score += 2
            reasons.append(f"商品名部分一致(+2) [mapped: {mapped_product}]")
        else:
            ratio = fuzz.ratio(pname, norm_mapped)
            if ratio >= 80:
                score += 2
                reasons.append(f"商品名類似度80以上(+2, ratio={ratio}) [mapped: {mapped_product}]")
            elif ratio >= 60:
                score += 1
                reasons.append(f"商品名類似度60以上(+1, ratio={ratio}) [mapped: {mapped_product}]")
        # 2. キーワード（D列）の一致・類似度
        if keywords:
            for kw in keywords.split(','):
                kw = kw.strip()
                norm_kw = normalize(kw)
                if not norm_kw:
                    continue
                if norm_kw in norm_mapped:
                    score += 1
                    reasons.append(f"キーワードがGemini抽出商品名に含まれる(+1, kw={kw}) [mapped: {mapped_product}]")
                if norm_kw in norm_trans:
                    score += 1
                    reasons.append(f"キーワードが文字起こしに含まれる(+1, kw={kw}) [transcription: {transcription}]")
                mapped_words = re.split(r'[\s,、]', norm_mapped)
                trans_words = re.split(r'[\s,、]', norm_trans)
                for word in mapped_words:
                    if word and norm_kw in word:
                        score += 0.5
                        reasons.append(f"キーワードがGemini抽出商品名の単語に部分一致(+0.5, kw={kw}, word={word})")
                    ratio_kw_map = fuzz.ratio(norm_kw, word)
                    if ratio_kw_map >= 80:
                        score += 1
                        reasons.append(f"キーワードとGemini抽出商品名の単語の類似度80以上(+1, kw={kw}, word={word}, ratio={ratio_kw_map})")
                    elif ratio_kw_map >= 60:
                        score += 0.5
                        reasons.append(f"キーワードとGemini抽出商品名の単語の類似度60以上(+0.5, kw={kw}, word={word}, ratio={ratio_kw_map})")
                for word in trans_words:
                    if word and norm_kw in word:
                        score += 0.5
                        reasons.append(f"キーワードが文字起こしの単語に部分一致(+0.5, kw={kw}, word={word})")
                    ratio_kw_trans = fuzz.ratio(norm_kw, word)
                    if ratio_kw_trans >= 80:
                        score += 1
                        reasons.append(f"キーワードと文字起こしの単語の類似度80以上(+1, kw={kw}, word={word}, ratio={ratio_kw_trans})")
                    elif ratio_kw_trans >= 60:
                        score += 0.5
                        reasons.append(f"キーワードと文字起こしの単語の類似度60以上(+0.5, kw={kw}, word={word}, ratio={ratio_kw_trans})")
        
        log_details.append(f"商品名: {pname}, スコア: {score}, 内訳: {'; '.join(reasons)}")
        if score > best_score:
            best_score = score
            best_product = pname
            best_category = cat_kw
    
    if best_score < 1:
        logger.info("スコア計算詳細: " + " | ".join(log_details) + " => 判定: 空文字列")
        return ""
    
    logger.info("スコア計算詳細: " + " | ".join(log_details) + f" => 判定: {best_product} (スコア: {best_score})")
    return best_product

def process_alias_for_multiple_category(product_name: str, transcription: str, mapped_product: str) -> str:
    """
    cat_kw=複数の商品に対して別名処理を実行する
    
    Args:
        product_name: スコアリングで確定した商品名（product_aliasテーブルのproduct_nameに含まれる）
        transcription: 文字起こしテキスト
        mapped_product: Gemini抽出商品名
    
    Returns:
        str: 処理後の商品名
    """
    logger.info(f"別名処理開始: {product_name}")
    
    norm_trans = normalize(transcription)
    norm_mapped = normalize(mapped_product) if mapped_product else ""
    
    # product_aliasテーブルから該当商品の別名・キーワードを取得
    alias_data = get_alias_keywords(product_name)
    alias_match = False
    priority_alias = None
    
    for alias_info in alias_data:
        alias_keyword = alias_info['keyword'].lower()
        alias_name = alias_info['alias_name']
        alias_priority = alias_info['alias_priority']
        
        # Gemini抽出商品名または文字起こしに別名キーワードが含まれるか
        if alias_keyword in norm_mapped or alias_keyword in norm_trans:
            logger.info(f"別名キーワード一致により商品名変更: {product_name} -> {alias_name}")
            return alias_name
        elif alias_priority == 1:
            priority_alias = alias_name
    
    # マッチしなかった場合はPriority=1の別名を使用
    if priority_alias:
        logger.info(f"Priority=1の別名を使用: {product_name} -> {priority_alias}")
        return priority_alias
    
    # 別名が見つからない場合は元の商品名を返す
    logger.info(f"別名が見つからないため元の商品名を使用: {product_name}")
    return product_name

def update_product_in_db(video_id: str, product: str) -> None:
    """
    video_masterテーブルのproductカラムをUPDATEする
    """
    try:
        
        # 更新を実行
        query = "UPDATE video_master SET product = %s WHERE video_id = %s"
        params = (product, video_id)  # タプル形式に変更
        affected = execute_write_query(query, params)
        
        # 変更前後の値を表示
        print(f"video_id: {video_id}")
        print(f"変更後のproduct: {product}")
        
        logger.info(f"DB更新: video_id={video_id}, product={product}, 更新件数={affected}")
    except DatabaseError as e:
        logger.error(f"DB更新失敗: {e}")
        raise

def refine_product_scoring(event, context):
    """
    商材判定精査用Cloud Function（Pub/Subトリガー）
    Args:
        event (dict): Pub/Subイベントデータ
        context: Cloud Functions context
    """
    logger.info("=== refine_product_scoring 実行開始 ===")
    try:
        if "data" in event:
            message_data = base64.b64decode(event["data"]).decode("utf-8")
            message_json = json.loads(message_data)
            logger.info(f"受信メッセージ: {message_json}")
        else:
            logger.error("データなしのメッセージを受信")
            return

        video_id = message_json.get("video_id")
        mapped_product = message_json.get("product_name")
        transcription = message_json.get("transcription")

        # DBから商品名・キーワード・カテゴリ特有キーワードを取得
        product_names, keywords_list, category_keywords = fetch_product_data_from_db()

        # 1. スコアリング実行
        best_product = score_product(transcription, product_names, keywords_list, mapped_product, category_keywords)
        
        # 2. 商品が確定した場合、cat_kw=複数の場合は別名処理を実行
        if best_product:
            # 確定した商品のカテゴリを取得
            product_category = get_product_category(best_product)
            if product_category == '複数':
                best_product = process_alias_for_multiple_category(best_product, transcription, mapped_product)

        logger.info(f"video_id={video_id} の精査結果: {best_product}")

        # ここでDBをUPDATE
        update_product_in_db(video_id, best_product)

    except Exception as e:
        logger.error(f"精査処理エラー: {e}")
        raise e
    finally:
        logger.info("=== refine_product_scoring 実行終了 ===")
