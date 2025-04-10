from pydantic import BaseModel
from typing import List, Optional

class ColumnSetting(BaseModel):
    """カラム設定モデル"""
    column_name: str
    is_visible: bool
    display_order: int

class DisplaySetting(BaseModel):
    """表示設定モデル"""
    is_default: bool = True
    columns: List[ColumnSetting] 