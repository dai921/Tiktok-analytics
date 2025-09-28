from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class TikTokStats(BaseModel):
    """TikTok アカウント統計情報のモデル"""
    followerCount: int = Field(..., description="フォロワー総数")
    followerGrowth: int = Field(..., description="期間内のフォロワー増加数")
    likeCount: int = Field(..., description="いいね総数")
    likeGrowth: int = Field(..., description="期間内のいいね増加数")
    avgViewCount: int = Field(..., description="平均視聴回数/動画")
    viewGrowth: int = Field(..., description="期間内の総視聴数増加")
    engagementRate: float = Field(..., description="エンゲージメント率（%）")
    account_type: Optional[str] = Field(None, description="アカウントタイプ")
    mainly_video_type: Optional[str] = Field(None, description="主なビデオタイプ（アフィリエイトの場合）")


class TikTokThumbnail(BaseModel):
    """TikTok サムネイルの情報"""
    valueType: str = Field(..., description="サムネイルのタイプ")
    url: str = Field(..., description="サムネイルURL")

class TikTokVideo(BaseModel):
    """TikTok 動画情報のモデル"""
    id: str = Field(..., description="動画ID")
    title: str = Field(..., description="動画タイトル/説明")
    createTime: str = Field(..., description="作成日時（ISO 8601形式）")
    viewCount: int = Field(..., description="視聴回数")
    viewGrowth: int = Field(..., description="期間内の視聴回数増加")
    likeCount: int = Field(..., description="いいね数")
    likeGrowth: int = Field(..., description="期間内のいいね増加数")
    commentCount: int = Field(..., description="コメント数")
    commentGrowth: int = Field(..., description="期間内のコメント増加数")
    shareCount: int = Field(..., description="シェア数")
    shareGrowth: int = Field(..., description="期間内のシェア増加数")
    thumbnailUrl: Optional[TikTokThumbnail] = Field(None, description="サムネイルのメタ情報")
    videoUrl: Optional[str] = Field(None, description="動画URL")

class TikTokUserConnection(BaseModel):
    """ユーザーとTikTokアカウントの連携情報モデル"""
    user_id: str = Field(..., description="ユーザーID")
    tiktok_open_id: str = Field(..., description="TikTok OpenID")
    access_token: str = Field(..., description="TikTokアクセストークン")
    refresh_token: str = Field(..., description="TikTokリフレッシュトークン")
    token_expires_at: datetime = Field(..., description="トークン有効期限")
    created_at: datetime = Field(..., description="作成日時")
    updated_at: datetime = Field(..., description="更新日時")

class TikTokConnectionResponse(BaseModel):
    """TikTok連携状態レスポンスモデル"""
    connected: bool = Field(..., description="連携状態")
    connectionDate: Optional[datetime] = Field(None, description="連携日時") 