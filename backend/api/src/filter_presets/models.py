# backend/api/src/filter_presets/models.py
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from datetime import datetime

class FilterPresetIn(BaseModel):
    name: str = Field(..., max_length=255)
    context_key: str = Field(..., max_length=255)
    payload: Dict[str, Any]
    schema_version: int = 1
    is_default: bool = False

class FilterPresetUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    context_key: Optional[str] = Field(None, max_length=255)
    payload: Optional[Dict[str, Any]] = None
    schema_version: Optional[int] = None
    is_default: Optional[bool] = None

class FilterPresetOut(BaseModel):
    id: int
    preset_id: str
    user_number: int
    name: str
    context_key: str
    payload: Dict[str, Any]
    schema_version: int
    is_default: bool
    created_at: datetime
    updated_at: datetime
