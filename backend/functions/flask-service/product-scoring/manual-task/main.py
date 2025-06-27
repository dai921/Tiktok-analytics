import base64
import json
import logging
import re
import os
from typing import List, Tuple, Dict, Any
from fuzzywuzzy import fuzz  # pip install fuzzywuzzy
import functions_framework  # 追加
import google.generativeai as genai
# DB接続用のimport（仮。実際のDBユーティリティに合わせて修正してください）
# from db_utils import fetch_product_data
from db_utils import execute_write_query, DatabaseError, execute_query
from datetime import datetime
from pubsub_utils import publish_message

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

def update_product_and_category_in_db(video_id: str, product: str, category: str) -> None:
    """
    sandbox_frontend_dataテーブルのproductとcategoryカラムをUPDATEする
    """
    try:
        query = "UPDATE sandbox_frontend_data SET product = %s, category = %s WHERE video_id = %s"
        params = (product, category, video_id)
        affected = execute_write_query(query, params)
        
        logger.info(f"DB更新: video_id={video_id}, product={product}, category={category}, 更新件数={affected}")
    except DatabaseError as e:
        logger.error(f"DB更新失敗: {e}")
        raise

def get_video_file_path(video_id: str) -> str:
    """
    指定したvideo_idに対応する動画ファイルのパスを取得
    
    Args:
        video_id: 動画ID
    
    Returns:
        str: 動画ファイルのパス（存在しない場合は空文字列）
    """
    try:
        # 動画ファイルのパスを取得するクエリ
        video_path_query = """
            SELECT file_path
            FROM video_transcription
            WHERE video_id = %s
        """
        
        result = execute_query(video_path_query, (video_id,))
        
        if result and result[0]['file_path']:
            video_path = result[0]['file_path']
            # ファイルが存在するかチェック
            if os.path.exists(video_path):
                return video_path
            else:
                logger.warning(f"動画ファイルが存在しません: {video_path}")
                return ""
        else:
            logger.warning(f"video_id {video_id} の動画ファイルパスが見つかりません")
            return ""
            
    except DatabaseError as e:
        logger.error(f"動画ファイルパス取得エラー: {e}")
        return ""

def analyze_product_from_transcription(transcription: str, video_id: str = None) -> str:
    """
    文字起こしデータと動画ファイルからGeminiで商材判定を実行（同期処理）
    
    Args:
        transcription: 文字起こしテキスト
        video_id: 動画ID（動画ファイルを使用する場合）
    
    Returns:
        str: 商材判定結果
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEYが設定されていません")
            return ""
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = (
            "この動画で紹介されている製品やサービスの名称を、商品名のみ一語で正確に回答してください。"
            "特定できない場合は『不明』とだけ記載してください。"
        )

        response = None
        
        # 動画ファイルが利用可能な場合は動画を使用
        if video_id:
            video_path = get_video_file_path(video_id)
            if video_path and os.path.exists(video_path):
                try:
                    with open(video_path, "rb") as f:
                        video_bytes = f.read()
                    response = model.generate_content([
                        prompt,
                        {"mime_type": "video/mp4", "data": video_bytes}
                    ])
                    logger.info(f"動画ファイルを使用してGemini判定実行: {video_path}")
                except Exception as e:
                    logger.error(f"動画ファイル読み込みエラー: {e}")
                    # 動画ファイルでエラーが発生した場合は文字起こしのみで実行
                    response = model.generate_content([prompt, transcription])
                    logger.info("動画ファイルエラーのため文字起こしのみでGemini判定実行")
            else:
                logger.info("動画ファイルが存在しないため文字起こしのみでGemini判定実行")
                response = model.generate_content([prompt, transcription])
        else:
            # 動画IDが指定されていない場合は文字起こしのみで実行
            response = model.generate_content([prompt, transcription])
        
        # Geminiの返答を解析
        product_name = ""
        if response is not None:
            if hasattr(response, "candidates") and not response.candidates:
                logger.info("Gemini応答: candidatesが空のためNFを返却")
                product_name = "NF"
            elif hasattr(response, "text"):
                product_name = response.text.strip()
                logger.info(f"Gemini応答: {product_name}")
            else:
                logger.info("Gemini応答: 返答なし")
                product_name = ""
        else:
            product_name = ""

        return product_name
        
    except Exception as e:
        logger.error(f"Gemini商材判定エラー: {e}")
        return ""

def get_or_initialize_cursor(processor_name, target_table, default_batch_size=100):
    """カーソル情報を取得、存在しない場合は初期化"""
    query = """
    SELECT id, processor_name, target_table, last_cursor_id, 
           batch_size, batch_number, updated_at
    FROM processing_cursors
    WHERE processor_name = %s AND target_table = %s
    """
    
    result = execute_query(query, (processor_name, target_table))
    
    if result:
        return result[0]
    else:
        # 新しいカーソルを作成
        insert_query = """
        INSERT INTO processing_cursors 
        (processor_name, target_table, last_cursor_id, batch_size, reset_interval, batch_number, created_at, updated_at)
        VALUES (%s, %s, 0, %s, 172800, 1, NOW(), NOW())
        """
        
        execute_write_query(insert_query, (processor_name, target_table, default_batch_size))
        
        # 作成したカーソル情報を取得
        return execute_query(query, (processor_name, target_table))[0]

def update_cursor(processor_name, target_table, last_cursor_id, batch_number):
    """カーソル情報を更新"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = %s, batch_number = %s, updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    
    execute_write_query(query, (last_cursor_id, batch_number, processor_name, target_table))

def reset_cursor(processor_name, target_table):
    """カーソル情報をリセット"""
    query = """
    UPDATE processing_cursors
    SET last_cursor_id = 0, batch_number = 1, last_reset_time = NOW(), updated_at = NOW()
    WHERE processor_name = %s AND target_table = %s
    """
    
    execute_write_query(query, (processor_name, target_table))

def get_target_videos_batch(last_cursor_id: int, batch_size: int) -> Tuple[List[Dict[str, Any]], int]:
    """
    対象動画をバッチで取得する
    
    Args:
        last_cursor_id: 前回処理した最後のID
        batch_size: バッチサイズ
    
    Returns:
        Tuple[List[Dict[str, Any]], int]: 
            - 対象動画のリスト
            - このバッチの最大ID
    """
    try:
        target_query = """
            SELECT 
                vm.video_id,
                vm.product,
                vt.transcription,
                vm.id
            FROM video_master vm
            JOIN video_transcription vt ON vm.video_id = vt.video_id
            WHERE vm.product_update = 1
            AND vm.id > %s
            ORDER BY vm.id
            LIMIT %s
        """
        
        results = execute_query(target_query, (last_cursor_id, batch_size))
        
        # このバッチの最大IDを取得
        max_id = results[-1]['id'] if results else last_cursor_id
        
        logger.info(f"バッチ取得: {len(results)}件, 最大ID: {max_id}")
        return results, max_id
        
    except DatabaseError as e:
        logger.error(f"対象動画取得エラー: {e}")
        raise

def get_remaining_count(max_id: int) -> int:
    """残りの処理対象件数を取得"""
    try:
        count_query = """
            SELECT COUNT(*) as remaining_count
            FROM video_master vm
            JOIN video_transcription vt ON vm.video_id = vt.video_id
            WHERE vm.product_update = 1
            AND vm.id > %s
        """
        
        result = execute_query(count_query, (max_id,))
        return result[0]['remaining_count'] if result else 0
        
    except DatabaseError as e:
        logger.error(f"残り件数取得エラー: {e}")
        return 0

@functions_framework.http
def manual_refine_product_scoring(request):
    """
    商材判定精査用Cloud Function（HTTPトリガー）- バッチ処理対応
    Args:
        request: Cloud Functions HTTP request object
    """
    logger.info("=== manual_refine_product_scoring 実行開始 ===")
    
    try:
        # HTTPリクエストの処理
        if request.method != 'POST':
            return {'error': 'POSTメソッドのみサポート'}, 405
        
        # リクエストボディからパラメータを取得（オプション）
        request_data = request.get_json() if request.is_json else {}
        video_id = request_data.get('video_id')  # 特定のvideo_idを指定する場合
        
        # 特定のvideo_idが指定されている場合は従来の処理
        if video_id:
            return process_single_video(video_id)
        
        # バッチ処理の実行
        return process_batch()
        
    except Exception as e:
        logger.error(f"精査処理エラー: {e}")
        return {'error': str(e)}, 500
    finally:
        logger.info("=== manual_refine_product_scoring 実行終了 ===")

def process_single_video(video_id: str):
    """単一動画の処理（従来の処理）"""
    # DBから商品名・キーワード・カテゴリ特有キーワードを取得
    product_names, keywords_list, category_keywords = fetch_product_data_from_db()
    
    # 特定の動画を取得
    single_video_query = """
        SELECT 
            vm.video_id,
            vm.product,
            vt.transcription
        FROM video_master vm
        JOIN video_transcription vt ON vm.video_id = vt.video_id
        WHERE vm.video_id = %s
    """
    
    video_data = execute_query(single_video_query, (video_id,))
    if not video_data:
        return {'error': f'video_id {video_id} が見つかりません'}, 404
    
    video = video_data[0]
    transcription = video['transcription']
    
    # 処理実行（動画IDを渡して同期処理）
    mapped_product = analyze_product_from_transcription(transcription, video_id)
    best_product = score_product(transcription, product_names, keywords_list, mapped_product, category_keywords)
    
    if best_product:
        product_category = get_product_category(best_product)
        if product_category == '複数':
            best_product = process_alias_for_multiple_category(best_product, transcription, mapped_product)
    
    category = get_product_category(best_product)
    update_product_and_category_in_db(video_id, best_product, category)
    
    return {
        'status': 'success',
        'video_id': video_id,
        'mapped_product': mapped_product,
        'result_product': best_product,
        'category': category
    }

def process_batch():
    """バッチ処理の実行"""
    try:
        # カーソル情報の取得または初期化
        cursor_info = get_or_initialize_cursor("manual_product_scoring", "frontend_data", 100)
        processor_name = cursor_info["processor_name"]
        target_table = cursor_info["target_table"]
        last_cursor_id = cursor_info["last_cursor_id"]
        batch_size = cursor_info["batch_size"]
        batch_number = cursor_info["batch_number"]
        
        logger.info(f"バッチ処理情報: processor={processor_name}, target={target_table}, " 
                   f"last_id={last_cursor_id}, batch_size={batch_size}, batch_number={batch_number}")
        
        # DBから商品名・キーワード・カテゴリ特有キーワードを取得
        product_names, keywords_list, category_keywords = fetch_product_data_from_db()
        
        # 対象動画をバッチで取得
        target_videos, max_id = get_target_videos_batch(last_cursor_id, batch_size)
        
        # 残りのレコード数を確認
        remaining_count = get_remaining_count(max_id)
        
        if not target_videos:
            logger.info("処理すべきデータがありません。バッチ処理を完了します。")
            
            # カーソルをリセット（次回は最初から）
            reset_cursor(processor_name, target_table)
            
            # Pub/Subにバッチ処理完了のメッセージを送信（スケジューラー管理用）
            publish_message("product-scoring-status", {
                "status": "completed",
                "message": "全バッチの処理が完了しました",
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "status": "success",
                "message": "バッチ処理完了",
                "batch_number": batch_number,
                "updated_count": 0,
                "is_complete": True,
                "execution_time": datetime.now().isoformat()
            }
        
        # バッチ処理の実行
        processed_count = 0
        results = []
        batch_start_time = datetime.now()
        
        for video in target_videos:
            try:
                current_video_id = video['video_id']
                transcription = video['transcription']
                
                logger.info(f"処理開始: video_id={current_video_id}")
                
                # 1. 文字起こしデータと動画ファイルからGeminiで商材判定を実行（同期処理）
                mapped_product = analyze_product_from_transcription(transcription, current_video_id)
                logger.info(f"Gemini商材判定結果: {mapped_product}")
                
                # 2. スコアリング実行
                best_product = score_product(transcription, product_names, keywords_list, mapped_product, category_keywords)
                
                # 3. 商品が確定した場合、cat_kw=複数の場合は別名処理を実行
                if best_product:
                    product_category = get_product_category(best_product)
                    if product_category == '複数':
                        best_product = process_alias_for_multiple_category(best_product, transcription, mapped_product)
                
                # 4. DBをUPDATE（商品とカテゴリ両方）
                category = get_product_category(best_product)
                update_product_and_category_in_db(current_video_id, best_product, category)
                
                results.append({
                    'video_id': current_video_id,
                    'mapped_product': mapped_product,
                    'result_product': best_product,
                    'category': category
                })
                
                processed_count += 1
                logger.info(f"video_id={current_video_id} の精査結果: {best_product}")
                
            except Exception as e:
                logger.error(f"動画処理エラー (video_id: {video['video_id']}): {str(e)}")
                continue
        
        # カーソル情報の更新
        update_cursor(processor_name, target_table, max_id, batch_number + 1)
        
        batch_execution_time = (datetime.now() - batch_start_time).total_seconds()
        logger.info(f"バッチ#{batch_number}完了: {processed_count}/{len(target_videos)}件処理、実行時間: {batch_execution_time}秒")
        
        return {
            "status": "success",
            "batch_number": batch_number,
            "processed_count": processed_count,
            "batch_size": len(target_videos),
            "remaining_count": remaining_count,
            "is_complete": remaining_count == 0,
            "results": results,
            "execution_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"バッチ処理エラー: {e}")
        return {
            "status": "error",
            "error": str(e),
            "execution_time": datetime.now().isoformat()
        }
