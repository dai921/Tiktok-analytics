from pydantic import BaseModel
from typing import Optional
from enum import Enum
from datetime import datetime

class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing" 
    COMPLETED = "completed"
    FAILED = "failed"

class TranscriptionRequest(BaseModel):
    url: str

class JobResponse(BaseModel):
    success: bool
    job_id: str
    video_id: str
    status: JobStatus
    message: Optional[str] = None
    error: Optional[str] = None

class TranscriptionResponse(BaseModel):
    success: bool
    video_id: str
    transcription: Optional[str] = None
    source: str  # "database" or "generated"
    error: Optional[str] = None 