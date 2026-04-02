"""
models.py - Pydantic Data Models
API request/response models for Axyora
"""

from typing import List, Dict, Any
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# Request Models
# ============================================================================

class QueryRequest(BaseModel):
    """Search query request"""
    query: str = Field(..., min_length=1, max_length=1000)
    user_id: str = Field(..., min_length=1, max_length=100)
    top_k: int = Field(default=5, ge=1, le=20)
    model: str = Field(default="llama-3.3-70b-versatile")
    file_type: str = Field(default="all")  # all, image, document
    
    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Query cannot be empty")
        return v.strip()

    @field_validator("file_type")
    @classmethod
    def validate_file_type(cls, v):
        allowed = {"all", "image", "document"}
        if v not in allowed:
            return "all"
        return v


class AskRequest(BaseModel):
    """Direct LLM reasoning request"""
    query: str = Field(..., min_length=1)
    context: List[str] = Field(..., min_length=1)


class ScanRequest(BaseModel):
    """File scanning request"""
    user_id: str = Field(..., min_length=1, max_length=100)
    files: List[Dict] = Field(default_factory=list)


class CheckIndexedFilesRequest(BaseModel):
    """Check which files are already indexed"""
    user_id: str = Field(..., min_length=1, max_length=100)
    file_hashes: List[str] = Field(..., min_length=1)  # List of file fingerprints/hashes


class DeltaScanFile(BaseModel):
    """File descriptor used for delta scan decisions."""
    file_path: str = Field(..., min_length=1, max_length=4000)
    file_name: str = Field(default="", max_length=500)
    file_hash: str = Field(..., min_length=1, max_length=256)
    file_type: str = Field(default="document")  # image or document
    last_modified: float = Field(..., ge=0)

    @field_validator("file_type")
    @classmethod
    def normalize_file_type(cls, v):
        normalized = (v or "").strip().lower()
        if normalized == "image":
            return "image"
        return "document"


class DeltaScanRequest(BaseModel):
    """Request model for incremental scan checks."""
    user_id: str = Field(..., min_length=1, max_length=100)
    files: List[DeltaScanFile] = Field(default_factory=list)


class FileUploadRequest(BaseModel):
    """File upload metadata"""
    user_id: str = Field(..., min_length=1, max_length=100)
    file_name: str = Field(..., min_length=1, max_length=500)
    file_type: str = Field(...)


class ImageSearchRequest(BaseModel):
    """Image-specific search request"""
    query: str = Field(..., min_length=1, max_length=1000)
    user_id: str = Field(..., min_length=1, max_length=100)
    top_k: int = Field(default=10, ge=1, le=50)
    min_confidence: float = Field(default=0.60, ge=0.0, le=1.0)


# ============================================================================
# Response Models
# ============================================================================

class SourceInfo(BaseModel):
    """Information about a search result source"""
    file_name: str
    file_path: str
    preview: str
    file_type: str
    score: float


class ImageInfo(BaseModel):
    """Image search result details"""
    file_name: str
    file_path: str
    caption: str
    image_uri: str
    score: float
    tags: List[str] = []
    objects: List[str] = []
    colors: List[str] = []
    confidence: float = 0.0


class QueryResponse(BaseModel):
    """Search query response"""
    answer: str
    sources: List[SourceInfo]
    images: List[ImageInfo]


class JobStatus(BaseModel):
    """Job processing status"""
    job_id: str
    user_id: str
    status: str  # queued, processing, done, error
    progress: int  # 0-100
    current_step: str
    file_name: str
    file_type: str
    chunks_processed: int
    error: str = None
    created_at: float
    completed_at: float = None


class HealthResponse(BaseModel):
    """Service health check response"""
    status: str
    vectors: int


class MetricsResponse(BaseModel):
    """Service metrics"""
    queue_size: int
    queue_maxsize: int
    worker_count: int
    embedding_concurrency: int
    processing_jobs: int
    status_counts: Dict[str, int]
    timestamp: float


class ProcessingResponse(BaseModel):
    """Current processing status"""
    current_file: str = None
    queue_size: int
    total_processed: int
    total_in_queue: int
    total_failed: int
    last_processed_file: str = None