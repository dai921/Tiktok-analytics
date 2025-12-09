from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from src.auth.router import get_current_user
from src.auth.models import User
from src.db.database import execute_update, execute_query
from src.utils.logger_config import setup_logger
from .models import CsvExportLogCreate, CsvExportLogResponse
import json

logger = setup_logger()

router = APIRouter(
    prefix="/api/csv-export-logs",
    tags=["csv-export-logs"],
)

@router.post("", response_model=CsvExportLogResponse)
async def create_csv_export_log(
    request: Request,
    log_data: CsvExportLogCreate,
    current_user: User = Depends(get_current_user)
):
    """CSV出力ログを記録する"""
    try:
        # クライアント情報を取得
        user_agent = request.headers.get("user-agent", "")[:512]
        
        # IPアドレスを取得（プロキシ対応）
        forwarded_for = request.headers.get("x-forwarded-for")
        ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host
        ip_address = ip_address[:45] if ip_address else None

        # JSONパラメータをシリアライズ
        export_params_json = json.dumps(log_data.export_params) if log_data.export_params else None

        # INSERT実行（SQLAlchemy形式に修正）
        query = """
            INSERT INTO csv_export_logs (
                user_id, user_email, export_source, tab_type,
                export_params, export_status, row_count, file_size_bytes,
                error_message, user_agent, ip_address
            ) VALUES (
                :user_id, :user_email, :export_source, :tab_type,
                :export_params, :export_status, :row_count, :file_size_bytes,
                :error_message, :user_agent, :ip_address
            )
        """
        params = {
            "user_id": current_user.id,
            "user_email": current_user.email,
            "export_source": log_data.export_source,
            "tab_type": log_data.tab_type,
            "export_params": export_params_json,
            "export_status": log_data.export_status,
            "row_count": log_data.row_count,
            "file_size_bytes": log_data.file_size_bytes,
            "error_message": log_data.error_message,
            "user_agent": user_agent,
            "ip_address": ip_address
        }
        
        execute_update(query, params)

        # 挿入したレコードを取得（LAST_INSERT_ID使用）
        select_query = "SELECT * FROM csv_export_logs WHERE id = LAST_INSERT_ID()"
        row = execute_query(select_query)
        
        if row and len(row) > 0:
            record = row[0]
            return CsvExportLogResponse(
                id=record['id'],
                user_id=record['user_id'],
                user_email=record['user_email'],
                exported_at=record['exported_at'],
                export_source=record['export_source'],
                tab_type=record.get('tab_type'),
                export_params=json.loads(record['export_params']) if record.get('export_params') else None,
                export_status=record['export_status'],
                row_count=record.get('row_count'),
                file_size_bytes=record.get('file_size_bytes'),
                error_message=record.get('error_message')
            )
        
        raise HTTPException(status_code=500, detail="ログの保存に失敗しました")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CSV出力ログの記録に失敗: {e}")
        raise HTTPException(status_code=500, detail=f"ログの記録に失敗しました: {str(e)}")