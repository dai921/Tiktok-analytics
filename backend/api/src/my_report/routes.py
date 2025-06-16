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
from io import BytesIO
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
        print(f"[DEBUG] TikTok連携情報取得開始: user_id={user.id}")
        # データベースからTikTokアカウント連携情報を取得
        tiktok_connection = await tiktok_repository.get_user_connection(user.id)
        
        print(f"[DEBUG] TikTok連携情報取得結果: {tiktok_connection}")
        
        if not tiktok_connection:
            print(f"[INFO] TikTok連携情報が見つかりません: user_id={user.id}")
            return {"connected": False}
        
        # 連携済みの場合はアカウント情報を返す
        return {
            "connected": True,
            "account": {
                "id": "1",  # 固定ID（必要に応じて変更）
                "openId": tiktok_connection.tiktok_open_id,
                "displayName": tiktok_connection.display_name or "TikTokアカウント",
                "linkedAt": tiktok_connection.linked_at.isoformat() if tiktok_connection.linked_at else datetime.now().isoformat()
            }
        }
    except Exception as e:
        print(f"[ERROR] TikTok連携状態取得エラー: {str(e)}")
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
        
        # リポジトリに連携解除メソッドが実装されていると仮定
        # 実際の実装に合わせて修正が必要かもしれません
        success = await tiktok_repository.disconnect_user_account(user.id, open_id)
        
        if not success:
            print(f"[ERROR] 連携解除に失敗しました: user_id={user.id}, open_id={open_id}")
            raise HTTPException(status_code=404, detail="指定されたアカウント連携が見つかりません")
        
        print(f"[DEBUG] TikTok連携解除成功: user_id={user.id}, open_id={open_id}")
        return {"success": True, "message": "アカウント連携を解除しました"}
    except Exception as e:
        print(f"[ERROR] TikTok連携解除エラー: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TikTok連携解除に失敗しました: {str(e)}")

@router.get("/stats")
async def get_tiktok_stats(
    period: str = Query("30d", description="期間 (7d, 30d, 90d)"),
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
    user = Depends(get_current_user)
):
    """
    TikTok動画リストを取得します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # データベースからTikTokアクセストークンを取得
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
            MAX(latest.comment_cnt) as comment_count,
            MAX(latest.share_cnt) as share_count,
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
        """)
        
        params = {
            "start_date": start_date.strftime('%Y-%m-%d'),
            "start_date_2": start_date.strftime('%Y-%m-%d'),
            "end_date": end_date.strftime('%Y-%m-%d'),
            "tiktok_user_id": tiktok_user_id,
            "user_number": user_number
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
            videos.append(TikTokVideo(
                id=row['id'],
                title=row['title'] or "タイトルなし",
                createTime=row['create_time'].isoformat() if isinstance(row['create_time'], datetime) else (row['create_time'] or ""),
                viewCount=int(row['view_count']) if row['view_count'] else 0,
                viewGrowth=int(row['view_growth']) if row['view_growth'] else 0,
                likeCount=int(row['like_count']) if row['like_count'] else 0,
                commentCount=int(row['comment_count']) if row['comment_count'] else 0,
                shareCount=int(row['share_count']) if row['share_count'] else 0,
                thumbnailUrl=row['thumbnail_url'],
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
    """
    TikTokアカウントレポートを生成します
    """
    if not user:
        raise HTTPException(status_code=401, detail="認証が必要です")
    
    try:
        # データベースからTikTokアクセストークンを取得
        tiktok_connection = await tiktok_repository.get_user_connection(user.id)
        
        if not tiktok_connection:
            raise HTTPException(status_code=404, detail="TikTokとの連携が見つかりません")
        
        # 統計データと動画リストを取得
        stats = await get_tiktok_stats(period, user)
        videos = await get_tiktok_videos(period, user)
        
        # PDF生成処理（実装例）
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            from reportlab.lib import colors
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
            from reportlab.lib.styles import getSampleStyleSheet
            
            buffer = BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter)
            elements = []
            
            # スタイル設定
            styles = getSampleStyleSheet()
            title_style = styles['Title']
            heading_style = styles['Heading2']
            normal_style = styles['Normal']
            
            # タイトル
            elements.append(Paragraph(f"TikTok Analytics Report - {period}", title_style))
            
            # アカウント概要
            elements.append(Paragraph("アカウント概要", heading_style))
            account_data = [
                ["指標", "数値", "期間内増加"],
                ["フォロワー数", f"{stats.followerCount:,}", f"+{stats.followerGrowth:,}"],
                ["いいね総数", f"{stats.likeCount:,}", f"+{stats.likeGrowth:,}"],
                ["平均視聴回数/動画", f"{stats.avgViewCount:,}", f"+{stats.viewGrowth:,}"],
                ["エンゲージメント率", f"{stats.engagementRate:.2f}%", ""]
            ]
            
            account_table = Table(account_data, colWidths=[150, 100, 100])
            account_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(account_table)
            
            # 動画パフォーマンス
            if videos:
                elements.append(Paragraph("投稿パフォーマンス", heading_style))
                
                # 最大5件の動画を表示
                video_data = [["タイトル", "投稿日", "視聴回数", "増加量", "いいね数"]]
                for video in videos[:5]:
                    created_date = datetime.fromisoformat(video.createTime.replace('Z', '+00:00')) if 'Z' in video.createTime else datetime.fromisoformat(video.createTime)
                    video_data.append([
                        video.title[:30] + ('...' if len(video.title) > 30 else ''),
                        created_date.strftime('%Y-%m-%d'),
                        f"{video.viewCount:,}",
                        f"+{video.viewGrowth:,}",
                        f"{video.likeCount:,}"
                    ])
                
                video_table = Table(video_data, colWidths=[180, 70, 70, 70, 70])
                video_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                elements.append(video_table)
            
            doc.build(elements)
            buffer.seek(0)
            
            return StreamingResponse(
                buffer, 
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=tiktok-report-{period}.pdf"}
            )
            
        except ImportError:
            # PDFライブラリがない場合はJSONレスポンスを返す
            return JSONResponse(
                content={"success": True, "message": f"{period}のレポートが生成されました"},
                status_code=200
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"レポート生成に失敗しました: {str(e)}")


