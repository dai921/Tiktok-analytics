from typing import Dict, List, Optional
import functions_framework
from google.cloud import bigquery
from datetime import datetime
from .title_analyzer import TitleAnalyzer

def categorize_video_type(video_url: str) -> str:
    """動画URLからコンテンツタイプを判定する"""
    if 'video' in video_url.lower():
        return 'video'
    elif 'photo' in video_url.lower():
        return 'carousel'
    return 'unknown'

def sync_video_data(request) -> Dict[str, str]:
    """
    HTTP CloudFunctionのメインハンドラ
    video_light_raw_dataとvideo_heavy_raw_dataからデータを抽出し、
    video_masterテーブルに同期する
    """
    client = bigquery.Client()

    # Light Raw Dataからの抽出クエリ
    light_query = """
    SELECT 
        video_url,
        video_id,
        user_username,
        play_count,
        video_thumbnail_url,
        video_title
    FROM `your-project.your-dataset.video_light_raw_data`
    """

    # Heavy Raw Dataからの抽出クエリ
    heavy_query = """
    SELECT 
        video_id,
        user_nickname,
        post_time,
        audio_title,
        like_count,
        comment_count,
        collect_count
    FROM `your-project.your-dataset.video_heavy_raw_data`
    """

    try:
        # データの取得
        light_data = client.query(light_query).result()
        heavy_data = client.query(heavy_query).result()

        # Heavy dataをディクショナリに変換（video_idをキーとして）
        heavy_data_dict = {row.video_id: row for row in heavy_data}

        # 同期用のデータを準備
        sync_rows = []
        for light_row in light_data:
            heavy_row = heavy_data_dict.get(light_row.video_id)
            if not heavy_row:
                continue

            # タイトル分析
            title_analysis = TitleAnalyzer.analyze(light_row.video_title)
            
            # コンテンツタイプの判定
            content_type = categorize_video_type(light_row.video_url)

            # 同期データの作成
            sync_row = {
                'video_id': light_row.video_id,
                'video_url': light_row.video_url,
                'user_username': light_row.user_username,
                'user_nickname': heavy_row.user_nickname,
                'video_thumbnail_url': light_row.video_thumbnail_url,
                'video_title': light_row.video_title,
                'category': title_analysis['category'],
                'product_name': title_analysis['product_name'],
                'content_type': content_type,
                'post_time': heavy_row.post_time,
                'audio_title': heavy_row.audio_title,
                'play_count': light_row.play_count,
                'like_count': heavy_row.like_count,
                'comment_count': heavy_row.comment_count,
                'collect_count': heavy_row.collect_count,
                'sync_timestamp': datetime.utcnow().isoformat()
            }
            sync_rows.append(sync_row)

        # video_masterテーブルへの同期
        if sync_rows:
            table_id = 'your-project.your-dataset.video_master'
            errors = client.insert_rows_json(table_id, sync_rows)
            if errors:
                return {'status': 'error', 'message': f'Insertion errors: {errors}'}

        return {
            'status': 'success',
            'message': f'Successfully synced {len(sync_rows)} records'
        }

    except Exception as e:
        return {'status': 'error', 'message': str(e)}

# Cloud Functionのエントリーポイント
@functions_framework.http
def sync_video_master(request):
    """
    HTTPトリガーでvideo_masterテーブルの同期を実行する
    """
    result = sync_video_data(request)
    return result 