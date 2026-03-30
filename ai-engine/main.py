"""
Axyora AI Engine — FastAPI service
The core intelligence hub for local memory processing.
Migrated to Groq API Cloud Reasoning.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
import gc
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
import uuid

try:
    import torch
except Exception:
    torch = None

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from processor import detect_file_type, process_file_bytes
from metadata_db import JobStore
from ingestion import IngestionEngine
from local_storage import get_local_storage
from production_config import (
    MAX_FILE_SIZE_BYTES,
    SUPPORTED_FILE_TYPES,
    JOB_RETENTION_SECONDS,
)
from logging_config import logger

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    user_id: str = Field(..., min_length=1, max_length=100)
    top_k: int = Field(default=5, ge=1, le=20)
    model: str = Field(default="llama-3.3-70b-versatile")
    
    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Query cannot be empty")
        return v.strip()

class AskRequest(BaseModel):
    query: str = Field(..., min_length=1)
    context: List[str] = Field(..., min_length=1)

class ScanRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=100)
    files: List[Dict] = Field(default_factory=list)

# ---------------------------------------------------------------------------
# Global singletons
# ---------------------------------------------------------------------------

_embedding_engine = None
_vector_store = None
_query_engine = None
_index_registry = None
_ingestion_engine = None
_local_storage = None
job_store: JobStore = None

_job_queue: asyncio.Queue[dict] = None
_workers: list[asyncio.Task] = []

def get_embedding_engine():
    global _embedding_engine
    if _embedding_engine is None:
        from embeddings import EmbeddingEngine
        _embedding_engine = EmbeddingEngine()
    return _embedding_engine

def get_vector_store():
    global _vector_store
    if _vector_store is None:
        from vector_store import VectorStore
        _vector_store = VectorStore()
    return _vector_store

def get_query_engine():
    global _query_engine
    if _query_engine is None:
        from query_engine import QueryEngine
        _query_engine = QueryEngine(get_embedding_engine(), get_vector_store())
    return _query_engine

def get_index_registry():
    global _index_registry
    if _index_registry is None:
        from index_registry import IndexRegistry
        _index_registry = IndexRegistry()
    return _index_registry

def get_local_storage():
    global _local_storage
    if _local_storage is None:
        from local_storage import get_local_storage as create_storage
        _local_storage = create_storage()
    return _local_storage

def get_ingestion_engine():
    global _ingestion_engine
    if _ingestion_engine is None:
        _ingestion_engine = IngestionEngine("~/Axyora_Library", "local_user", _queue_local_file)
    return _ingestion_engine

def _queue_local_file(**kwargs):
    """Callback for ingestion.py to queue a local file for processing."""
    registry = get_index_registry()
    if registry.get(kwargs["user_id"], kwargs["file_hash"]):
        return
    
    job_id = f"local-{int(time.time())}-{uuid.uuid4().hex[:4]}"
    try:
        with open(kwargs["file_path"], "rb") as f:
            content = f.read()
            
        asyncio.run_coroutine_threadsafe(
            _job_queue.put({
                "job_id": job_id, "file_bytes": content, "file_name": kwargs["file_name"],
                "file_type": kwargs["file_type"], "user_id": kwargs["user_id"], 
                "file_path": kwargs["file_path"], "modified_at": kwargs["modified_at"]
            }),
            asyncio.get_event_loop()
        )
        job_store.create_job(job_id, kwargs["user_id"], kwargs["file_name"], kwargs["file_type"])
    except Exception as e:
        logger.error(f"Failed to queue local file {kwargs['file_path']}", error=e)

def _update_job(job_id: str, **kwargs):
    if job_store:
        job_store.update_job(job_id, **kwargs)

# ---------------------------------------------------------------------------
# Background Pipeline
# ---------------------------------------------------------------------------

async def _job_worker(worker_id: int):
    while True:
        payload = await _job_queue.get()
        job_id = payload["job_id"]
        try:
            logger.job_started(job_id, payload["user_id"], payload["file_name"], payload["file_type"])
            await _run_pipeline(**payload)
        except Exception as exc:
            logger.error(f"Worker {worker_id} job {job_id} failed", error=exc)
            _update_job(job_id, status="error", current_step="Pipeline Error", error=str(exc)[:500], completed_at=time.time())
        finally:
            _job_queue.task_done()
            gc.collect()
            if torch is not None and hasattr(torch, "backends") and torch.backends.mps.is_available():
                torch.mps.empty_cache()

async def _run_pipeline(job_id, file_bytes, file_name, file_type, user_id, file_path, modified_at=None):
    loop = asyncio.get_event_loop()
    start_time = time.time()
    local_storage = get_local_storage()
    try:
        _update_job(job_id, status="processing", progress=5, current_step="Hashing...")
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        
        registry = get_index_registry()
        _update_job(job_id, progress=20, current_step="Extracting text...")
        result = await loop.run_in_executor(None, process_file_bytes, file_bytes, file_name, file_type, file_path)
        
        # Handle both old format (list) and new format (tuple with image metadata)
        if isinstance(result, tuple):
            chunks, image_metadata = result
        else:
            chunks = result
            image_metadata = None
        
        if not chunks: 
            raise ValueError("No text extracted from file.")

        _update_job(job_id, progress=50, current_step=f"Embedding {len(chunks)} chunks...")
        engine = get_embedding_engine()
        texts = [c["text"] for c in chunks]
        embeddings = await loop.run_in_executor(None, engine.embed_batch, texts)

        _update_job(job_id, progress=80, current_step="Persisting memory...")
        v_store = get_vector_store()
        v_store.delete_by_path(user_id=user_id, local_path=file_path)
        
        file_id = f"{user_id}::{file_hash}"
        metadatas = []
        for chunk, emb in zip(chunks, embeddings):
            metadatas.append({
                "file_id": file_id, "file_hash": file_hash, "file_name": file_name, "file_type": file_type,
                "local_path": file_path, "created_at": modified_at or time.time(), "user_id": user_id,
                "chunk_index": chunk["chunk_index"], "text": chunk["text"]
            })
        v_store.add_batch(embeddings, metadatas)

        # Store image metadata in database if this is an image
        if file_type == "image" and image_metadata and job_store:
            image_id = f"{user_id}::{file_hash}"
            job_store.store_image_metadata(
                image_id=image_id,
                user_id=user_id,
                file_path=file_path,
                file_name=file_name,
                file_hash=file_hash,
                caption=image_metadata.get("caption", ""),
                tags=image_metadata.get("tags", []),
                model=image_metadata.get("model", "blip2-opt-2.7b"),
                confidence=image_metadata.get("confidence", 0.9),
            )

        registry.upsert(user_id=user_id, file_hash=file_hash, file_name=file_name, file_path=file_path, chunks=len(chunks))
        registry.persist()
        v_store.persist()

        # Update local storage to mark as indexed (completed)
        # Find the queue item for this job and mark it as complete
        queue = local_storage.get_pending_files()
        for item in queue:
            if file_id.endswith(item["fileId"].split("_")[-1:][0] if "_" in item["fileId"] else ""):
                local_storage.update_processing_status(item["id"], "complete", 100)
                break

        _update_job(job_id, status="done", progress=100, current_step="Complete", chunks_processed=len(chunks), completed_at=time.time())
        logger.job_completed(job_id, user_id, file_name, len(chunks), time.time()-start_time)
    except Exception as e:
        logger.job_failed(job_id, user_id, file_name, e, time.time()-start_time)
        raise e

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global job_store, _job_queue, _workers
    logger.info("Axyora AI Engine starting...")
    
    job_store = JobStore()
    _job_queue = asyncio.Queue()
    _workers = [asyncio.create_task(_job_worker(1))]
    
    ingestion = get_ingestion_engine()
    ingestion.scan_directory()
    ingestion.start_monitoring()
    
    yield
    
    for w in _workers: w.cancel()
    if _ingestion_engine: _ingestion_engine.stop_monitoring()
    if _index_registry: _index_registry.persist()
    if _vector_store: _vector_store.persist()

app = FastAPI(title="Axyora AI Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "vectors": get_vector_store().total_vectors()}

@app.get("/index-stats")
async def index_stats(user_id: str = Query(...)):
    return get_vector_store().user_stats(user_id)

@app.post("/scan")
async def scan(req: ScanRequest):
    registry = get_index_registry()
    queue = [f for f in req.files if not registry.get_by_path(req.user_id, f.get("file_path", ""))]
    return {"user_id": req.user_id, "queued": len(queue), "queue": queue}

@app.post("/process-file")
async def process_file(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    job_id: str = Form(...),
    file_path: str = Form(None),
    modified_at: float = Form(None)
):
    # Validate inputs
    if not user_id or len(user_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    if not job_id or len(job_id) > 200:
        raise HTTPException(status_code=400, detail="Invalid job_id")
    if not file.filename or len(file.filename) > 500:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    
    file_type = detect_file_type(file.filename, content)
    if file_type == "unknown":
        raise HTTPException(status_code=415, detail="Unsupported file type")
    
    job = job_store.create_job(job_id, user_id, file.filename, file_type)
    await _job_queue.put({
        "job_id": job_id, "file_bytes": content, "file_name": file.filename,
        "file_type": file_type, "user_id": user_id, "file_path": file_path or file.filename,
        "modified_at": modified_at
    })
    return job

@app.post("/ask")
async def ask_standalone(req: AskRequest):
    """Standalone Groq reasoning endpoint using provided context."""
    from groq_client import GroqClient
    try:
        client = GroqClient()
        context_str = "\n---\n".join(req.context)
        answer = client.ask(req.query, context_str)
        return {"answer": answer}
    except Exception as e:
        logger.error("Standalone ask failed", error=e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query")
async def query(req: QueryRequest):
    """Query indexed documents with cloud Groq reasoning."""
    # Validate user_id to prevent unauthorized access
    if not req.user_id or len(req.user_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    
    try:
        start = time.time()
        logger.info(f"[Query] Groq request: {req.query[:40]}... (user={req.user_id[:20]})")
        
        # Limit top_k to reasonable range (3-20)
        effective_top_k = max(1, min(req.top_k, 20))
        
        result = await asyncio.get_event_loop().run_in_executor(
            None, get_query_engine().answer, req.query, req.user_id, effective_top_k, req.model
        )
        return {**result, "duration_ms": int((time.time() - start) * 1000)}
    except Exception as e:
        logger.error("Query failed", error=e)
        raise HTTPException(status_code=500, detail="Reasoning engine failed.")

@app.post("/search-images")
async def search_images(req: QueryRequest):
    """Search for images based on natural language query."""
    # Validate user_id
    if not req.user_id or len(req.user_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    
    try:
        start = time.time()
        logger.info(f"[ImageSearch] Request: {req.query[:40]}... (user={req.user_id[:20]})")
        
        # Limit top_k to reasonable range (3-20)
        effective_top_k = max(1, min(req.top_k, 20))
        
        result = await asyncio.get_event_loop().run_in_executor(
            None, get_query_engine().search_images, req.query, req.user_id, effective_top_k
        )
        return {**result, "duration_ms": int((time.time() - start) * 1000)}
    except Exception as e:
        logger.error("Image search failed", error=e)
        raise HTTPException(status_code=500, detail="Image search failed.")

@app.get("/status/{job_id}")
async def job_status(job_id: str):
    job = job_store.get_job(job_id)
    if not job: raise HTTPException(status_code=404)
    return job

@app.get("/stats/file-types/{user_id}")
async def get_file_type_stats(user_id: str):
    """Get statistics of processed files by type"""
    jobs = job_store.get_user_jobs(user_id, limit=500)
    stats = {"image": 0, "audio": 0, "video": 0, "document": 0, "text": 0, "total": 0}
    
    for job in jobs:
        file_type = job.get("file_type", "unknown")
        if job.get("status") in ["done", "processing", "uploading"]:
            # Map internal file types to display categories
            if file_type == "image":
                stats["image"] += 1
            elif file_type == "audio":
                stats["audio"] += 1
            elif file_type in ["pdf", "docx", "doc"]:
                stats["document"] += 1
            elif file_type == "txt":
                stats["text"] += 1
            elif file_type != "unknown":
                stats["text"] += 1
            stats["total"] += 1
    
    return stats

@app.get("/jobs")
async def list_jobs(user_id: str, limit: int = 50):
    jobs = job_store.get_user_jobs(user_id, limit)
    return {"jobs": jobs, "count": len(jobs)}

@app.delete("/clear")
async def clear(user_id: str):
    get_vector_store().delete_by_user(user_id)
    get_index_registry().delete_by_user(user_id)
    job_store.cleanup_for_user(user_id)
    return {"status": "cleared"}

# ---------------------------------------------------------------------------
# LOCAL STORAGE ENDPOINTS (Local-First Data Storage)
# ---------------------------------------------------------------------------

@app.post("/local-storage/discover-files")
async def discover_files(user_id: str):
    """
    Stage 1: Discover and store all device files locally FIRST
    Before any indexing or processing
    """
    try:
        # Scan the Axyora library directory
        ingestion = get_ingestion_engine()
        files = ingestion.scan_directory(return_files=True)
        
        local_storage = get_local_storage()
        total, new_ids = await asyncio.get_event_loop().run_in_executor(
            None, local_storage.store_discovered_files, files
        )
        
        logger.info(f"[LocalStorage] Discovered {total} files for user {user_id[:20]}")
        return {
            "status": "success",
            "totalFiles": total,
            "newFiles": len(new_ids),
            "previouslyProcessed": total - len(new_ids)
        }
    except Exception as e:
        logger.error("Failed to discover files", error=e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/local-storage/queue-for-processing")
async def queue_for_processing(user_id: str, file_ids: List[str] = None):
    """
    Stage 2: Queue discovered files for processing
    Moves files from local storage to processing queue
    """
    try:
        local_storage = get_local_storage()
        
        # If no specific files provided, queue all non-indexed files
        if not file_ids:
            files = local_storage._read_json(local_storage.files_db)
            file_ids = [f["id"] for f in files if not f["indexed"]]
        
        queued = await asyncio.get_event_loop().run_in_executor(
            None, local_storage.queue_files_for_processing, file_ids
        )
        
        logger.info(f"[LocalStorage] Queued {queued} files for user {user_id[:20]}")
        return {
            "status": "success",
            "queued": queued
        }
    except Exception as e:
        logger.error("Failed to queue files", error=e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/local-storage/progress")
async def get_local_progress(user_id: str):
    """
    Get current indexing progress
    Shows what's stored, queued, processing, and indexed
    """
    try:
        local_storage = get_local_storage()
        progress = await asyncio.get_event_loop().run_in_executor(
            None, local_storage.get_progress
        )
        return {
            "status": "success",
            **progress
        }
    except Exception as e:
        logger.error("Failed to get progress", error=e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/local-storage/export")
async def export_storage(user_id: str):
    """
    Export entire local storage database
    Useful for backup, debugging, and auditing
    """
    try:
        local_storage = get_local_storage()
        database = await asyncio.get_event_loop().run_in_executor(
            None, local_storage.export_database
        )
        return {
            "status": "success",
            "database": database
        }
    except Exception as e:
        logger.error("Failed to export storage", error=e)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/local-storage/clear")
async def clear_local_storage(user_id: str):
    """
    Clear all local storage (Stage 1 only)
    Does NOT clear indexed data in vector store
    """
    try:
        local_storage = get_local_storage()
        await asyncio.get_event_loop().run_in_executor(
            None, local_storage.clear_all
        )
        logger.info(f"[LocalStorage] Cleared all local storage for user {user_id[:20]}")
        return {"status": "success", "message": "Local storage cleared"}
    except Exception as e:
        logger.error("Failed to clear local storage", error=e)
        raise HTTPException(status_code=500, detail=str(e))
