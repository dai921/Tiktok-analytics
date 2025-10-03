from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
import random
import json
from typing import List, Optional, Dict, Any
import requests
from ..auth.router import get_current_user
from .models import TikTokStats, TikTokVideo, TikTokUserConnection
import os
from fastapi.responses import StreamingResponse
from .report_generator import build_tiktok_report_presentation
from .repositories import TikTokRepository
from ..db.database import get_db_connection
from sqlalchemy.sql import text

router = APIRouter(prefix="/api/tiktok", tags=["tiktok"])

# リポジトリのグローバルインスタンスを作成
tiktok_repository = TikTokRepository()

@router.get("/connection/status")
async def get_tiktok_connection_status(user = Depends(get_current_user)):
    """TikTokアカウントの連携状態を取得します"""
    print(f"[DEBUG] get_tiktok_connection_status 開始")
    
    if not user:
        print("[ERROR] ユーザー認証失敗")
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        print(f"[DEBUG] TikTokアカウント取得開始: user_id={user.id}")
        connections = await tiktok_repository.list_user_connections(user.id)

        if not connections:
            print(f"[INFO] TikTok連携情報が見つかりません: user_id={user.id}")
            return {"connected": False, "accounts": []}

        def serialize_connection(connection: TikTokUserConnection) -> Dict[str, Any]:
            return {
                "id": connection.tiktok_open_id,
                "openId": connection.tiktok_open_id,
                "displayName": connection.display_name or "TikTokアカウント",
                "linkedAt": connection.linked_at.isoformat() if connection.linked_at else datetime.now().isoformat(),
                "accountType": connection.account_type,
                "mainlyVideoType": connection.mainly_video_type,
            }

        accounts_payload = [serialize_connection(conn) for conn in connections]
        response: Dict[str, Any] = {"connected": True, "accounts": accounts_payload}
        response["account"] = accounts_payload[0]
        return response
    except Exception as e:
        print(f"[ERROR] TikTokアカウント取得エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TikTok連携状態の取得に失敗しました: {str(e)}")

@router.post("/connection/disconnect")
async def disconnect_tiktok_account(
    data: Dict[str, Any] = Body(...),
    user = Depends(get_current_user)
):
    """TikTokアカウントの連携を解除します"""
    print(f"[DEBUG] disconnect_tiktok_account 開始")
    
    if not user:
        print("[ERROR] ユーザー認証失敗")
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        print(f"[DEBUG] TikTok連携解除開始: user_id={user.id}, data={data}")
        open_id = data.get("openId")
        
        if not open_id:
            print("[ERROR] openIdが提供されていません")
            raise HTTPException(status_code=400, detail="openIdは必須です")
        
        success = await tiktok_repository.disconnect_user_account(user.id, open_id)
        
        if not success:
            print(f"[ERROR] 連携解除に失敗しました: user_id={user.id}, open_id={open_id}")
            raise HTTPException(status_code=404, detail="指定されたアカウント連携が見つかりません")
        
        print(f"[DEBUG] TikTok連携解除成功: user_id={user.id}, open_id={open_id}")
        remaining_connections = await tiktok_repository.list_user_connections(user.id)
        accounts_payload = [
            {
                "id": conn.tiktok_open_id,
                "openId": conn.tiktok_open_id,
                "displayName": conn.display_name or "TikTokアカウント",
                "linkedAt": conn.linked_at.isoformat() if conn.linked_at else datetime.now().isoformat(),
                "accountType": conn.account_type,
                "mainlyVideoType": conn.mainly_video_type,
            }
            for conn in remaining_connections
        ]
        return {
            "success": True,
            "message": "アカウント連携を解除しました",
            "connected": bool(remaining_connections),
            "accounts": accounts_payload,
        }
    except Exception as e:
        print(f"[ERROR] TikTok連携解除エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TikTok連携解除に失敗しました: {str(e)}")

@router.get("/stats")
async def get_tiktok_stats(
    period: str = Query("30d", description="期間 (7d, 30d, 90d)"),
    open_id: Optional[str] = Query(None, alias="open_id"),
    user = Depends(get_current_user)
):
    """TikTok統計情報を取得します"""
    print(f"[DEBUG] get_tiktok_stats 開始: period={period}")
    
    # ユーザー情報をログ出力
    print(f"[DEBUG] ユーザー情報: {user}")
    
    if not user:
        print("[ERROR] ユーザー認証失敗")
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        print(f"[DEBUG] TikTok連携情報取得開始: user_id={user.id}")
        # データベースからTikTokアクセストークンを取得
        if open_id:
            tiktok_connection = await tiktok_repository.get_user_connection_by_open_id(user.id, open_id)
        else:
            tiktok_connection = await tiktok_repository.get_user_connection(user.id)
        
        print(f"[DEBUG] TikTok連携情報取得結果: {tiktok_connection}")
        
        if not tiktok_connection:
            print(f"[ERROR] TikTok連携情報が見つかりません: user_id={user.id}")
            raise HTTPException(status_code=404, detail="TikTokとの連携が見つかりません")
        
        # 期間に応じて日数を設定
        days = 7 if period == "7d" else 30 if period == "30d" else 90
        print(f"[DEBUG] 期間設定: {period} → {days}日")
        
        # データベース接続
        try:
            print("[DEBUG] データベース接続開始")
            conn = get_db_connection()
            print("[DEBUG] データベース接続成功")
        except Exception as db_err:
            print(f"[ERROR] データベース接続エラー: {str(db_err)}")
            raise
        
        # TikTokユーザーIDを取得
        tiktok_user_id = tiktok_connection.tiktok_open_id
        user_number = user.user_number  # ユーザー番号
        print(f"[DEBUG] TikTokユーザーID: {tiktok_user_id}, ユーザー番号: {user_number}")

        # 集計期間の開始日と終了日を計算
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        print(f"[DEBUG] 集計期間: {start_date.strftime('%Y-%m-%d')} から {end_date.strftime('%Y-%m-%d')}")
        
        # データベースから統計情報を取得
        # 既存のテーブル構造（users_account_daily_metrics）に合わせたクエリ
        query = text("""
        SELECT
            MAX(followers) AS follower_count,
            SUM(CASE WHEN collection_date >= :start_date THEN follower_diff ELSE 0 END) AS follower_growth,
            MAX(likes) AS like_count,
            SUM(CASE WHEN collection_date >= :start_date_2 THEN like_diff ELSE 0 END) AS like_growth,
            AVG(total_play_count / NULLIF(videos_count, 0)) AS avg_view_count,
            SUM(view_diff) AS view_growth
        FROM (
            SELECT
                collection_date,
                followers,
                likes,
                total_play_count,
                videos_count,
                CAST(followers AS SIGNED) - CAST(LAG(followers) OVER (PARTITION BY open_id ORDER BY collection_date) AS SIGNED) AS follower_diff,
                CAST(likes AS SIGNED) - CAST(LAG(likes) OVER (PARTITION BY open_id ORDER BY collection_date) AS SIGNED) AS like_diff,
                CAST(total_play_count AS SIGNED) - CAST(LAG(total_play_count) OVER (PARTITION BY open_id ORDER BY collection_date) AS SIGNED) AS view_diff
            FROM
                users_account_daily_metrics
            WHERE
                open_id = :tiktok_user_id
                AND collection_date BETWEEN :start_date_3 AND :end_date
                AND user_number = :user_number
        ) AS t;
        """)
        
        print("[DEBUG] クエリ実行開始")
        print(f"[DEBUG] クエリパラメータ: start_date={start_date.strftime('%Y-%m-%d')}, tiktok_user_id={tiktok_user_id}, user_number={user_number}")
        
        try:
            params = {
                "start_date": start_date.strftime('%Y-%m-%d'),
                "start_date_2": start_date.strftime('%Y-%m-%d'),
                "start_date_3": start_date.strftime('%Y-%m-%d'),
                "tiktok_user_id": tiktok_user_id,
                "end_date": end_date.strftime('%Y-%m-%d'),
                "user_number": user_number
            }
            result = conn.execute(query, params).mappings().first()
            print("[DEBUG] クエリ実行成功")
            print(f"[DEBUG] クエリ結果: {result}")
        except Exception as query_err:
            print(f"[ERROR] クエリ実行エラー: {str(query_err)}")
            raise
        
        # データが存在しない場合は空の結果を返す
        if not result or result['follower_count'] is None:
            print("[DEBUG] メインクエリでデータなし、代替クエリを実行")
            # 最も古いデータを取得して代用
            try:
                alt_query = text("""
                SELECT 
                    followers as follower_count, 
                    likes as like_count,
                    total_play_count / NULLIF(videos_count, 0) as avg_view_count,
                    0 as follower_growth, 
                    0 as like_growth, 
                    0 as view_growth
                FROM 
                    users_account_daily_metrics 
                WHERE 
                    open_id = :tiktok_user_id
                    AND user_number = :user_number
                ORDER BY collection_date DESC LIMIT 1
                """)
                print(f"[DEBUG] 代替クエリパラメータ: tiktok_user_id={tiktok_user_id}, user_number={user_number}")
                result = conn.execute(alt_query, {
                    "tiktok_user_id": tiktok_user_id, 
                    "user_number": user_number
                }).mappings().first()
                print(f"[DEBUG] 代替クエリ結果: {result}")
            except Exception as alt_query_err:
                print(f"[ERROR] 代替クエリ実行エラー: {str(alt_query_err)}")
                raise
            
            # それでもデータがない場合はデフォルト値を設定
            if not result:
                print("[DEBUG] データなし、デフォルト値を設定")
                result = {
                    'follower_count': 0,
                    'follower_growth': 0,
                    'like_count': 0,
                    'like_growth': 0,
                    'avg_view_count': 0,
                    'view_growth': 0
                }
        
        print("[DEBUG] エンゲージメント率計算開始")
        # エンゲージメント率を計算（いいね数を視聴数で割った値）
        engagement_rate = 0.0
        try:
            if result['avg_view_count'] and result['avg_view_count'] > 0:
                if result['follower_count'] and result['follower_count'] > 0:
                    engagement_rate = (result['like_count'] / result['follower_count']) * 100
                    print(f"[DEBUG] エンゲージメント率計算: {result['like_count']} / {result['follower_count']} * 100 = {engagement_rate}")
                else:
                    print("[DEBUG] follower_countが0またはNone、エンゲージメント率は0に設定")
                    engagement_rate = 0
            else:
                print("[DEBUG] avg_view_countが0またはNone、デフォルトエンゲージメント率を設定")
                engagement_rate = 4.2  # デフォルト値
        except Exception as eng_err:
            print(f"[ERROR] エンゲージメント率計算エラー: {str(eng_err)}")
            engagement_rate = 4.2  # エラー時のデフォルト値
        
        print("[DEBUG] 結果整形開始")
        # 結果を整形
        try:
            stats = TikTokStats(
                followerCount=int(result['follower_count']) if result['follower_count'] else 0,
                followerGrowth=int(result['follower_growth']) if result['follower_growth'] else 0,
                likeCount=int(result['like_count']) if result['like_count'] else 0,
                likeGrowth=int(result['like_growth']) if result['like_growth'] else 0,
                avgViewCount=int(result['avg_view_count']) if result['avg_view_count'] else 0,
                viewGrowth=int(result['view_growth']) if result['view_growth'] else 0,
                engagementRate=float(engagement_rate),
                account_type=tiktok_connection.account_type,
                mainly_video_type=tiktok_connection.mainly_video_type
            )
            print(f"[DEBUG] 結果整形完了: {stats}")
        except Exception as fmt_err:
            print(f"[ERROR] 結果整形エラー: {str(fmt_err)}")
            raise
        
        print("[DEBUG] DB接続クローズ")
        conn.close()
        
        print("[DEBUG] get_tiktok_stats 正常終了")
        return stats
    except Exception as e:
        print(f"[ERROR] get_tiktok_stats 処理エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"統計情報の取得に失敗しました: {str(e)}")

@router.get("/videos")
async def get_tiktok_videos(
    period: str = Query("30d", description="期間 (7d, 30d, 90d)"),
    limit: int = Query(100, ge=1, le=300, description="取得する動画数"),
    open_id: Optional[str] = Query(None, alias="open_id"),
    user = Depends(get_current_user)
):
    """
    TikTok動画リストを取得します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # データベースからTikTokアクセストークンを取得
        if open_id:
            tiktok_connection = await tiktok_repository.get_user_connection_by_open_id(user.id, open_id)
        else:
            tiktok_connection = await tiktok_repository.get_user_connection(user.id)
        
        if not tiktok_connection:
            raise HTTPException(status_code=404, detail="TikTokとの連携が見つかりません")
        
        # 期間に応じて日数を設定
        days = 7 if period == "7d" else 30 if period == "30d" else 90
        
        # データベース接続
        conn = get_db_connection()
        
        # TikTokユーザーIDを取得
        tiktok_user_id = tiktok_connection.tiktok_open_id
        user_number = user.user_number  # ユーザー番号
        
        # 集計期間の開始日と終了日を計算
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        print(f"[DEBUG] 動画取得: period={period}, start_date={start_date}, end_date={end_date}")
        
        # データベースから動画情報を取得
        # 既存のテーブル構造（users_videos と users_video_daily_metrics_new）に合わせたクエリ
        query = text("""
        SELECT 
            v.video_id as id,
            v.caption as title,
            v.created_at as create_time,
            MAX(latest.play_cnt) as view_count,
            COALESCE(CAST(MAX(latest.play_cnt) AS SIGNED) - CAST(MAX(IFNULL(prev.play_cnt, 0)) AS SIGNED), 0) as view_growth,
            MAX(latest.like_cnt) as like_count,
            COALESCE(CAST(MAX(latest.like_cnt) AS SIGNED) - CAST(MAX(IFNULL(prev.like_cnt, 0)) AS SIGNED), 0) as like_growth,
            MAX(latest.comment_cnt) as comment_count,
            COALESCE(CAST(MAX(latest.comment_cnt) AS SIGNED) - CAST(MAX(IFNULL(prev.comment_cnt, 0)) AS SIGNED), 0) as comment_growth,
            MAX(latest.share_cnt) as share_count,
            COALESCE(CAST(MAX(latest.share_cnt) AS SIGNED) - CAST(MAX(IFNULL(prev.share_cnt, 0)) AS SIGNED), 0) as share_growth,
            v.thumbnail_url
        FROM 
            users_videos v
        LEFT JOIN 
            users_video_daily_metrics_new latest ON v.video_id = latest.video_id 
            AND latest.collection_date = (
                SELECT MAX(collection_date) FROM users_video_daily_metrics_new 
                WHERE video_id = v.video_id
            )
        LEFT JOIN 
            users_video_daily_metrics_new prev ON v.video_id = prev.video_id 
            AND prev.collection_date = (
                SELECT MIN(collection_date) FROM users_video_daily_metrics_new 
                WHERE video_id = v.video_id AND collection_date < :start_date
            )
        LEFT JOIN 
            users_video_daily_metrics_new m ON v.video_id = m.video_id 
            AND m.collection_date BETWEEN :start_date_2 AND :end_date
        WHERE 
            v.open_id = :tiktok_user_id
            AND v.user_number = :user_number
        GROUP BY 
            v.video_id, v.caption, v.created_at, v.thumbnail_url
        ORDER BY 
            v.created_at DESC
        LIMIT :result_limit
        """)
        
        result_limit = max(1, min(limit, 300))

        params = {
            "start_date": start_date.strftime('%Y-%m-%d'),
            "start_date_2": start_date.strftime('%Y-%m-%d'),
            "end_date": end_date.strftime('%Y-%m-%d'),
            "tiktok_user_id": tiktok_user_id,
            "user_number": user_number,
            "result_limit": result_limit
        }
        
        try:
            print(f"[DEBUG] 動画取得クエリパラメータ: {params}")
            results = conn.execute(query, params).mappings().all()
            print(f"[DEBUG] 動画取得結果件数: {len(results)}")
        except Exception as e:
            print(f"[ERROR] 動画クエリ実行エラー: {str(e)}")
            raise
        
        videos = []
        for row in results:
            thumbnail_url = row['thumbnail_url']
            if thumbnail_url and isinstance(thumbnail_url, str) and thumbnail_url.startswith('gs://'):
                parts = thumbnail_url.split('/')
                bucket = parts[2]
                object_path = '/'.join(parts[3:])
                thumbnail_url = f"https://storage.googleapis.com/{bucket}/{object_path}"

            thumbnail_payload = {"valueType": "IMAGE", "url": thumbnail_url} if thumbnail_url else None

            videos.append(TikTokVideo(
                id=row['id'],
                title=row['title'] or "タイトルなし",
                createTime=row['create_time'].isoformat() if isinstance(row['create_time'], datetime) else (row['create_time'] or ""),
                viewCount=int(row['view_count']) if row['view_count'] else 0,
                viewGrowth=int(row['view_growth']) if row['view_growth'] else 0,
                likeCount=int(row['like_count']) if row['like_count'] else 0,
                likeGrowth=int(row['like_growth']) if row['like_growth'] else 0,
                commentCount=int(row['comment_count']) if row['comment_count'] else 0,
                commentGrowth=int(row['comment_growth']) if row['comment_growth'] else 0,
                shareCount=int(row['share_count']) if row['share_count'] else 0,
                shareGrowth=int(row['share_growth']) if row['share_growth'] else 0,
                thumbnailUrl=thumbnail_payload,
                videoUrl=f"https://www.tiktok.com/@user/video/{row['id']}"  # 仮のURL
            ))
        
        conn.close()
        
        return videos
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"動画リストの取得に失敗しました: {str(e)}")

@router.post("/report")
async def generate_report(
    period: str = Query("30d", description="期間 (7d, 30d, 90d)"),
    user = Depends(get_current_user)
):
    """TikTokアカウントレポートをPowerPoint形式で生成します"""
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")

    try:
        tiktok_connection = await tiktok_repository.get_user_connection(user.id)
        if not tiktok_connection:
            raise HTTPException(status_code=404, detail="TikTokとの連携が見つかりません")

        days = 7 if period == "7d" else 30 if period == "30d" else 90
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        stats = await get_tiktok_stats(period, user=user)
        videos = await get_tiktok_videos(period, limit=100, user=user)

        presentation_stream = build_tiktok_report_presentation(
            stats=stats,
            videos=videos,
            account_name=tiktok_connection.display_name or "TikTokアカウント",
            period_label=period,
            start_date=start_date,
            end_date=end_date,
            generated_at=datetime.now(),
        )

        filename = f"tiktok-report-{start_date:%Y%m%d}-{end_date:%Y%m%d}.pptx"
        return StreamingResponse(
            presentation_stream,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"レポート生成に失敗しました: {str(e)}")

@router.post("/videos/{video_id}/view-rates")
async def save_video_view_rates(
    video_id: str,
    view_rates: Dict[str, float] = Body(...),
    user = Depends(get_current_user)
):
    """動画の視聴率データを手動で保存します"""
    print(f"[DEBUG] save_video_view_rates 開始: video_id={video_id}")
    
    if not user:
        print("[ERROR] ユーザー認証失敗")
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # データベース接続
        conn = get_db_connection()
        
        # 視聴率データを保存
        query = text("""
            INSERT INTO users_video_view_rates (
                video_id,
                user_number,
                two_second_rate,
                six_second_rate,
                full_view_rate,
                created_at,
                updated_at
            ) VALUES (
                :video_id,
                :user_number,
                :two_second_rate,
                :six_second_rate,
                :full_view_rate,
                NOW(),
                NOW()
            ) ON DUPLICATE KEY UPDATE
                two_second_rate = VALUES(two_second_rate),
                six_second_rate = VALUES(six_second_rate),
                full_view_rate = VALUES(full_view_rate),
                updated_at = NOW()
        """)
        
        params = {
            "video_id": video_id,
            "user_number": user.user_number,
            "two_second_rate": view_rates.get("twoSecondRate", 0),
            "six_second_rate": view_rates.get("sixSecondRate", 0),
            "full_view_rate": view_rates.get("fullViewRate", 0)
        }
        
        try:
            print(f"[DEBUG] 視聴率データ保存クエリ実行: {params}")
            conn.execute(query, params)
            conn.commit()
            print("[DEBUG] 視聴率データ保存成功")
        except Exception as e:
            print(f"[ERROR] 視聴率データ保存エラー: {str(e)}")
            conn.rollback()
            raise
        
        conn.close()
        
        return {"success": True, "message": "視聴率データを保存しました"}
        
    except Exception as e:
        print(f"[ERROR] save_video_view_rates 処理エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"視聴率データの保存に失敗しました: {str(e)}")

@router.get("/videos/{video_id}/view-rates")
async def get_video_view_rates(
    video_id: str,
    user = Depends(get_current_user)
):
    """動画の視聴率データを取得します"""
    print(f"[DEBUG] get_video_view_rates 開始: video_id={video_id}")
    
    if not user:
        print("[ERROR] ユーザー認証失敗")
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # データベース接続
        conn = get_db_connection()
        
        # 視聴率データを取得
        query = text("""
            SELECT 
                two_second_rate,
                six_second_rate,
                full_view_rate,
                updated_at
            FROM users_video_view_rates
            WHERE video_id = :video_id
            AND user_number = :user_number
        """)
        
        params = {
            "video_id": video_id,
            "user_number": user.user_number
        }
        
        try:
            print(f"[DEBUG] 視聴率データ取得クエリ実行: {params}")
            result = conn.execute(query, params).mappings().first()
            print(f"[DEBUG] 視聴率データ取得結果: {result}")
        except Exception as e:
            print(f"[ERROR] 視聴率データ取得エラー: {str(e)}")
            raise
        
        conn.close()
        
        if not result:
            return {
                "twoSecondRate": None,
                "sixSecondRate": None,
                "fullViewRate": None,
                "updatedAt": None
            }
        
        return {
            "twoSecondRate": float(result['two_second_rate']) if result['two_second_rate'] is not None else None,
            "sixSecondRate": float(result['six_second_rate']) if result['six_second_rate'] is not None else None,
            "fullViewRate": float(result['full_view_rate']) if result['full_view_rate'] is not None else None,
            "updatedAt": result['updated_at'].isoformat() if result['updated_at'] else None
        }
        
    except Exception as e:
        print(f"[ERROR] get_video_view_rates 処理エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"視聴率データの取得に失敗しました: {str(e)}")



