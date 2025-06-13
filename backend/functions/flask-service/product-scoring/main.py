import base64
import json
import logging
import re
from typing import List
from fuzzywuzzy import fuzz  # pip install fuzzywuzzy
# DB接続用のimport（仮。実際のDBユーティリティに合わせて修正してください）
# from db_utils import fetch_product_data
from db_utils import execute_write_query, DatabaseError

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

def fetch_product_data_from_db() -> (List[str], List[str], List[str]):
    """
    DBから商品名・キーワード・カテゴリ特有キーワードを取得する（仮実装）
    実際はSQLでproduct_master, product_keywords, category_keywords等から取得
    """
    # 例: product_names = ["商品A", "商品B"], keywords_list = ["キーワードA1,キーワードA2", "キーワードB1"], category_keywords = ["カテゴリA1,カテゴリA2", "カテゴリB1"]
    product_names = ["商品A", "商品B"]
    keywords_list = ["キーワードA1,キーワードA2", "キーワードB1"]
    category_keywords = ["カテゴリA1,カテゴリA2", "カテゴリB1"]
    return product_names, keywords_list, category_keywords

def score_product(transcription, product_names, keywords_list, mapped_product, category_keywords):
    norm_trans = normalize(transcription)
    norm_mapped = normalize(mapped_product) if mapped_product else ""
    best_score = 0
    best_product = "NF"
    log_details = []
    for pname, keywords, cat_kw in zip(product_names, keywords_list, category_keywords):
        if not pname:
            continue
        norm_pname = normalize(pname)
        score = 0
        reasons = []
        # 1. 商品名同士の一致・類似度
        if norm_pname in norm_mapped or norm_mapped in norm_pname:
            score += 2
            reasons.append(f"商品名部分一致(+2) [mapped: {mapped_product}]")
        else:
            ratio = fuzz.ratio(norm_pname, norm_mapped)
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
        # 3. B列に「/」が含まれる場合はE列キーワードで加点
        if '/' in pname and cat_kw:
            for ekw in cat_kw.split(','):
                ekw = ekw.strip()
                norm_ekw = normalize(ekw)
                if not norm_ekw:
                    continue
                if norm_ekw in norm_mapped:
                    score += 1
                    reasons.append(f"カテゴリ特有キーワードがGemini抽出商品名に含まれる(+1, ekw={ekw})")
                if norm_ekw in norm_trans:
                    score += 1
                    reasons.append(f"カテゴリ特有キーワードが文字起こしに含まれる(+1, ekw={ekw})")
        log_details.append(f"商品名: {pname}, スコア: {score}, 内訳: {'; '.join(reasons)}")
        if score > best_score:
            best_score = score
            best_product = pname
    if best_score < 1:
        logger.info("スコア計算詳細: " + " | ".join(log_details) + " => 判定: NF")
        return "NF"
    logger.info("スコア計算詳細: " + " | ".join(log_details) + f" => 判定: {best_product} (スコア: {best_score})")
    return best_product

def update_product_in_db(video_id: str, product: str) -> None:
    """
    video_masterテーブルのproductカラムをUPDATEする
    """
    try:
        query = "UPDATE video_master SET product = %s WHERE video_id = %s"
        params = {"product": product, "video_id": video_id}
        affected = execute_write_query(query, params)
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

        # スコアリング
        best_product = score_product(transcription, product_names, keywords_list, mapped_product, category_keywords)

        logger.info(f"video_id={video_id} の精査結果: {best_product}")

        # ここでDBをUPDATE
        update_product_in_db(video_id, best_product)


    except Exception as e:
        logger.error(f"精査処理エラー: {e}")
        raise e
    finally:
        logger.info("=== refine_product_scoring 実行終了 ===")
