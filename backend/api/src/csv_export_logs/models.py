from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal
from datetime import datetime

ExportSource = Literal[
    'dashboard',
    'trends_product',
    'trends_genre',
    'overall_sounds',
    'overall_hashtags'
]

TabType = Literal['all', 'affiliate', 'corporate', 'influencer']
ExportStatus = Literal['success', 'failed']

class CsvExportLogCreate(BaseModel):
    """CSV出力ログ作成リクエスト"""
    export_source: ExportSource
    tab_type: Optional[TabType] = None
    export_params: Optional[Dict[str, Any]] = None
    export_status: ExportStatus = 'success'
    row_count: Optional[int] = None
    file_size_bytes: Optional[int] = None
    error_message: Optional[str] = None

class CsvExportLogResponse(BaseModel):
    """CSV出力ログレスポンス"""
    id: int
    user_id: str
    user_email: str
    exported_at: datetime
    export_source: str
    tab_type: Optional[str] = None
    export_params: Optional[Dict[str, Any]] = None
    export_status: str
    row_count: Optional[int] = None
    file_size_bytes: Optional[int] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True