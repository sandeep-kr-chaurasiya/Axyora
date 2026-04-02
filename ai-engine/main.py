"""
Axyora AI Engine — FastAPI service
The core intelligence hub for local memory processing.
Migrated to Groq API Cloud Reasoning.

This module uses consolidated, professional file organization:
- storage.py: JobStore, VectorStore, IndexRegistry, local file storage helpers
- processing.py: File extraction, chunking, embeddings, image captioning
- rag.py: QueryEngine, ContextBuilder, GroqClient
- utilities.py: CircuitBreaker, RetryPolicy
- models.py: Pydantic request/response models
- production_config.py: Configuration constants
"""

from __future__ import annotations

import asyncio
import hashlib
import time
import gc
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
import uuid
import logging

try:
    import torch
except Exception:
    torch = None

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request, Query
from fastapi.middleware.cors import CORSMiddleware

# ============================================================================
# IMPORTS FROM CONSOLIDATED MODULES
# ============================================================================

# Data models
from models import (
    QueryRequest,
    AskRequest,
    ScanRequest,
    CheckIndexedFilesRequest,
    DeltaScanRequest,
)

# Storage layer
from storage import JobStore, VectorStore, IndexRegistry, get_local_storage

# Processing layer
from processing import detect_file_type, process_file_bytes, get_embedding_engine as processing_get_embedding_engine

# RAG layer
from rag import QueryEngine

# Configuration & logging
from production_config import (
    MAX_FILE_SIZE_BYTES,
    PIPELINE_WORKERS,
    JOB_QUEUE_MAXSIZE,
    EMBED_MAX_CONCURRENCY,
    FILE_PROCESSING_TIMEOUT,
    EMBEDDING_TIMEOUT,
    INGESTION_LIBRARY_PATH,
    INGESTION_USER_ID,
    INGESTION_SCAN_INTERVAL_SECONDS,
)

# Ingestion
from ingestion import IngestionEngine

# ============================================================================
# GLOBAL SINGLETONS
# ============================================================================

_embedding_engine = None
_vector_store = None
_query_engine = None
_index_registry = None
_ingestion_engine = None
_local_storage = None
job_store: JobStore = None

_job_queue: asyncio.Queue[dict] = None
_workers: list[asyncio.Task] = []
_embedding_semaphore: asyncio.Semaphore | None = None
_main_loop: asyncio.AbstractEventLoop | None = None

logger = logging.getLogger(__name__)


def get_embedding_engine():
    """Get or create embedding engine singleton"""
    global _embedding_engine
    if _embedding_engine is None:
        _embedding_engine = processing_get_embedding_engine()
    return _embedding_engine


def get_vector_store():
    """Get or create vector store singleton"""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def get_query_engine():
    """Get or create query engine singleton"""
    global _query_engine
    if _query_engine is None:
        _query_engine = QueryEngine(get_embedding_engine(), get_vector_store())
    return _query_engine


def get_index_registry():
    """Get or create index registry singleton"""
    global _index_registry
    if _index_registry is None:
        _index_registry = IndexRegistry()
    return _index_registry


def get_ingestion_engine():
    """Get or create ingestion engine singleton"""
    global _ingestion_engine
    if _ingestion_engine is None:
        _ingestion_engine = IngestionEngine(INGESTION_LIBRARY_PATH, INGESTION_USER_ID, _queue_local_file)
    return _ingestion_engine

def _queue_local_file(**kwargs):
    """Callback for ingestion.py to queue a local file for processing."""
    if not job_store:
        return

    incoming_modified = float(kwargs.get("modified_at") or time.time())
    existing = job_store.get_registry_entry(kwargs["user_id"], kwargs["file_path"])
    if existing:
        existing_modified = float(existing.get("last_modified") or 0.0)
        if existing.get("status") == "indexed" and incoming_modified <= existing_modified:
            return

    job_store.upsert_registry_record(
        user_id=kwargs["user_id"],
        file_path=kwargs["file_path"],
        file_hash=kwargs.get("file_hash") or hashlib.sha256(
            f"{kwargs['file_path']}::{int(incoming_modified)}".encode("utf-8")
        ).hexdigest(),
        file_type=kwargs.get("file_type", "document"),
        last_modified=incoming_modified,
        status="pending",
    )
    
    job_id = f"local-{int(time.time())}-{uuid.uuid4().hex[:4]}"
    try:
        with open(kwargs["file_path"], "rb") as f:
            content = f.read()
            
        payload = {
            "job_id": job_id, "file_bytes": content, "file_name": kwargs["file_name"],
            "file_type": kwargs["file_type"], "user_id": kwargs["user_id"], 
            "file_path": kwargs["file_path"], "modified_at": kwargs["modified_at"]
        }
        if _main_loop is None:
            logger.warning("[Ingestion] Main event loop unavailable; skipping queued file %s", kwargs.get("file_path", ""))
            return
        asyncio.run_coroutine_threadsafe(_job_queue.put(payload), _main_loop)
        job_store.create_job(job_id, kwargs["user_id"], kwargs["file_name"], kwargs["file_type"])
    except Exception as e:
        logger.exception("[Ingestion] Failed to queue local file %s: %s", kwargs.get("file_path", ""), e)

def _update_job(job_id: str, **kwargs):
    if job_store:
        job_store.update_job(job_id, **kwargs)

# ---------------------------------------------------------------------------
# Background Pipeline
# ---------------------------------------------------------------------------

async def _job_worker(worker_id: int):
    """Process jobs from the queue with robust error handling."""
    while True:
        try:
            if _job_queue is None:
                await asyncio.sleep(1)
                continue
                
            payload = await _job_queue.get()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            await asyncio.sleep(1)
            continue
            
        job_id = payload.get("job_id")
        if not job_id:
            _job_queue.task_done()
            continue
            
        try:
            await _run_pipeline(**payload)
        except Exception as exc:
            _update_job(job_id, status="error", current_step="Pipeline Error", error=str(exc)[:500], completed_at=time.time())
            if job_store:
                try:
                    job_store.mark_registry_failed(
                        payload.get("user_id", ""),
                        payload.get("file_path", ""),
                        str(exc),
                    )
                except Exception:
                    pass
        finally:
            try:
                _job_queue.task_done()
            except Exception as exc:
                pass
            gc.collect()
            if torch is not None and hasattr(torch, "backends") and torch.backends.mps.is_available():
                torch.mps.empty_cache()

async def _run_pipeline(job_id, file_bytes, file_name, file_type, user_id, file_path, modified_at=None):
    start_time = time.time()
    local_storage = get_local_storage()
    try:
        if job_store:
            job_store.mark_registry_processing(user_id, file_path)

        _update_job(job_id, status="processing", progress=5, current_step="Hashing...")
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        
        registry = get_index_registry()
        _update_job(job_id, progress=20, current_step="Extracting text...")
        result = await asyncio.wait_for(
            asyncio.to_thread(process_file_bytes, file_bytes, file_name, file_type, file_path),
            timeout=FILE_PROCESSING_TIMEOUT
        )
        
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
        if _embedding_semaphore is None:
            raise RuntimeError("Embedding semaphore not initialized")
        async with _embedding_semaphore:
            embeddings = await asyncio.wait_for(
                asyncio.to_thread(engine.embed_batch, texts),
                timeout=EMBEDDING_TIMEOUT
            )

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

        if job_store:
            job_store.mark_registry_indexed(
                user_id=user_id,
                file_path=file_path,
                file_hash=file_hash,
                file_type=file_type,
                last_modified=float(modified_at or time.time()),
            )

        # Update local storage to mark as indexed (completed)
        # Find the queue item for this job and mark it as complete
        queue = local_storage.get_pending_files()
        for item in queue:
            if file_id.endswith(item["fileId"].split("_")[-1:][0] if "_" in item["fileId"] else ""):
                local_storage.update_processing_status(item["id"], "complete", 100)
                break

        _update_job(job_id, status="done", progress=100, current_step="Complete", chunks_processed=len(chunks), completed_at=time.time())
    except Exception as e:
        raise e

# ---------------------------------------------------------------------------
# Background Ingestion Task
# ---------------------------------------------------------------------------

async def _start_background_ingestion():
    """Continuously scan for new files and queue them automatically."""
    ingestion = get_ingestion_engine()

    while True:
        try:
            ingestion.scan_directory(auto_queue=True)
        except Exception as exc:
            logger.exception("[Ingestion] Background scan failed: %s", exc)

        await asyncio.sleep(max(1, INGESTION_SCAN_INTERVAL_SECONDS))

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global job_store, _job_queue, _workers, _embedding_semaphore, _main_loop
    
    job_store = JobStore()
    _job_queue = asyncio.Queue(maxsize=JOB_QUEUE_MAXSIZE)
    _main_loop = asyncio.get_running_loop()
    _embedding_semaphore = asyncio.Semaphore(max(1, EMBED_MAX_CONCURRENCY))
    worker_count = max(1, PIPELINE_WORKERS)
    _workers = [asyncio.create_task(_job_worker(i + 1)) for i in range(worker_count)]
    
    # Start continuous background ingestion (auto-scan every few seconds)
    asyncio.create_task(_start_background_ingestion())
    
    yield
    
    for w in _workers: w.cancel()
    # if _ingestion_engine: _ingestion_engine.stop_monitoring()
    if _index_registry: _index_registry.persist()
    if _vector_store: _vector_store.persist()

app = FastAPI(title="Axyora AI Engine", lifespan=lifespan)

@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex
    request.state.request_id = request_id
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        raise
    duration_ms = int((time.time() - start) * 1000)
    response.headers["X-Request-Id"] = request_id
    return response

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

@app.get("/metrics")
async def metrics():
    processing_jobs = job_store.get_processing_jobs() if job_store else []
    status_counts: dict[str, int] = {}
    for job in processing_jobs:
        status = job.get("status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
    return {
        "queue_size": _job_queue.qsize() if _job_queue else 0,
        "queue_maxsize": _job_queue.maxsize if _job_queue else 0,
        "worker_count": len(_workers),
        "embedding_concurrency": EMBED_MAX_CONCURRENCY,
        "processing_jobs": len(processing_jobs),
        "status_counts": status_counts,
        "timestamp": time.time(),
    }

@app.get("/current-processing")
async def get_current_processing(user_id: str = Query(...)):
    """Get the file currently being processed for a user"""
    queue_size = _job_queue.qsize() if _job_queue else 0
    counts = job_store.get_registry_counts(user_id) if job_store else {
        "total_files": 0,
        "indexed": 0,
        "pending": 0,
        "processing": 0,
        "failed": 0,
    }

    current_file = None
    if job_store:
        current = job_store.get_processing_registry_file(user_id)
        if current:
            path_value = str(current.get("file_path", "Unknown"))
            file_name = path_value.rsplit("/", 1)[-1] if "/" in path_value else path_value
            current_file = {
                "job_id": "",
                "file_name": file_name or "Unknown",
                "file_type": current.get("file_type", "unknown"),
                "status": current.get("status", "processing"),
                "current_step": "Processing",
                "progress": 0,
                "created_at": current.get("updated_at"),
            }

    return {
        "current_file": current_file,
        "queue_size": queue_size,
        "total_processed": counts.get("indexed", 0),
        "total_in_queue": counts.get("pending", 0) + counts.get("processing", 0),
        "total_failed": counts.get("failed", 0),
    }

@app.get("/index-stats")
async def index_stats(user_id: str = Query(...)):
    counts = job_store.get_registry_counts(user_id) if job_store else {
        "total_files": 0,
        "indexed": 0,
        "pending": 0,
        "processing": 0,
        "failed": 0,
    }
    total_files = max(0, counts.get("total_files", 0))
    indexed = max(0, counts.get("indexed", 0))
    progress = int((indexed / total_files) * 100) if total_files > 0 else 0

    return {
        "total_files": total_files,
        "indexed": indexed,
        "pending": max(0, counts.get("pending", 0)),
        "processing": max(0, counts.get("processing", 0)),
        "failed": max(0, counts.get("failed", 0)),
        "progress": progress,
    }

@app.post("/scan")
async def scan(req: ScanRequest):
    registry = get_index_registry()
    queue = [f for f in req.files if not registry.get_by_path(req.user_id, f.get("file_path", ""))]
    return {"user_id": req.user_id, "queued": len(queue), "queue": queue}


@app.post("/scan-delta")
async def scan_delta(req: DeltaScanRequest):
    if not job_store:
        raise HTTPException(status_code=500, detail="Job store unavailable")

    raw_files = [
        {
            "file_path": f.file_path,
            "file_name": f.file_name,
            "file_hash": f.file_hash,
            "file_type": f.file_type,
            "last_modified": f.last_modified,
        }
        for f in req.files
    ]
    result = job_store.classify_scan_delta(req.user_id, raw_files)
    return {
        "total_files": result.get("total_files", 0),
        "indexed": result.get("indexed", 0),
        "pending": result.get("pending", 0),
        "processing": result.get("processing", 0),
        "failed": result.get("failed", 0),
        "new_count": result.get("new_count", 0),
        "updated_count": result.get("updated_count", 0),
        "skipped_count": result.get("skipped_count", 0),
        "queue": result.get("queue", []),
    }

@app.post("/check-indexed-files")
async def check_indexed_files(req: CheckIndexedFilesRequest):
    """Check which files are already indexed by their hashes.
    Returns list of file hashes that are already indexed."""
    indexed_hashes: list[str] = []
    if job_store:
        indexed_hashes = job_store.get_indexed_hashes(req.user_id, req.file_hashes)
    
    return {
        "indexed": indexed_hashes,
        "new_count": len(req.file_hashes) - len(indexed_hashes),
        "indexed_count": len(indexed_hashes)
    }

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

    # Check registry and skip unchanged indexed files
    file_path_for_registry = file_path or file.filename
    if not job_store:
        raise HTTPException(status_code=500, detail="Job store unavailable")

    existing_registry = job_store.get_registry_entry(user_id, file_path_for_registry)
    file_hash = hashlib.sha256(content).hexdigest()

    if existing_registry:
        existing_modified = float(existing_registry.get("last_modified") or 0.0)
        incoming_modified = float(modified_at) if modified_at is not None else None
        is_unchanged = (
            incoming_modified is not None
            and abs(incoming_modified - existing_modified) < 1e-6
            and existing_registry.get("status") == "indexed"
        )

        if is_unchanged or (
            existing_registry.get("status") == "indexed"
            and str(existing_registry.get("file_hash") or "") == file_hash
        ):
            return {
                "job_id": job_id,
                "status": "skipped",
                "message": f"File unchanged and already indexed: {file.filename}",
                "file_name": file.filename,
                "file_type": file_type,
            }

    job_store.upsert_registry_record(
        user_id=user_id,
        file_path=file_path_for_registry,
        file_hash=file_hash,
        file_type=file_type,
        last_modified=float(modified_at or time.time()),
        status="pending",
    )

    # Legacy hash registry for compatibility with existing code paths
    registry = get_index_registry()
    already_indexed = registry.get(user_id, file_hash)
    if already_indexed and existing_registry and existing_registry.get("status") == "indexed":
        # File is already processed, skip it
        return {
            "job_id": job_id,
            "status": "skipped",
            "message": f"File already indexed: {file.filename}",
            "file_name": file.filename,
            "file_type": file_type,
        }
    
    job = job_store.create_job(job_id, user_id, file.filename, file_type)
    try:
        _job_queue.put_nowait({
            "job_id": job_id, "file_bytes": content, "file_name": file.filename,
            "file_type": file_type, "user_id": user_id, "file_path": file_path or file.filename,
            "modified_at": modified_at
        })
    except asyncio.QueueFull:
        job_store.update_job(job_id, status="error", current_step="Queue full", error="Queue capacity reached")
        job_store.mark_registry_failed(user_id, file_path_for_registry, "Queue capacity reached")
        raise HTTPException(status_code=429, detail="Processing queue is full. Try again shortly.")
    return job

@app.post("/ask")
async def ask_standalone(req: AskRequest):
    """Standalone Groq reasoning endpoint using provided context."""
    from rag import GroqClient
    try:
        client = GroqClient()
        context_str = "\n---\n".join(req.context)
        answer = client.ask(req.query, context_str)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query")
async def query(req: QueryRequest, request: Request):
    """Query indexed documents with cloud Groq reasoning."""
    # Validate user_id to prevent unauthorized access
    if not req.user_id or len(req.user_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    
    try:
        start = time.time()
        
        # Limit top_k to reasonable range (3-20)
        effective_top_k = max(1, min(req.top_k, 20))
        
        result = await asyncio.to_thread(
            get_query_engine().answer,
            req.query,
            req.user_id,
            effective_top_k,
            req.model,
            True,
            req.file_type,
        )
        duration_ms = int((time.time() - start) * 1000)
        return {**result, "duration_ms": duration_ms}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Reasoning engine failed.")

@app.post("/search-images")
async def search_images(req: QueryRequest):
    """Search for images based on natural language query."""
    # Validate user_id
    if not req.user_id or len(req.user_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    
    try:
        start = time.time()
        
        # Limit top_k to reasonable range (3-20)
        effective_top_k = max(1, min(req.top_k, 20))
        
        result = await asyncio.to_thread(
            get_query_engine().search_images, req.query, req.user_id, effective_top_k
        )
        return {**result, "duration_ms": int((time.time() - start) * 1000)}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Image search failed.")

@app.get("/status/{job_id}")
async def job_status(job_id: str):
    job = job_store.get_job(job_id)
    if not job: raise HTTPException(status_code=404)
    return job

@app.get("/stats/file-types/{user_id}")
async def get_file_type_stats(user_id: str):
    """Get statistics of processed files by type"""
    if not job_store:
        return {"image": 0, "audio": 0, "video": 0, "document": 0, "text": 0, "total": 0}
    return job_store.get_registry_file_type_stats(user_id)

@app.get("/jobs")
async def list_jobs(user_id: str, limit: int = 50):
    jobs = job_store.get_user_jobs(user_id, limit)
    return {"jobs": jobs, "count": len(jobs)}

@app.delete("/clear")
async def clear(user_id: str):
    get_vector_store().delete_by_user(user_id)
    get_index_registry().delete_by_user(user_id)
    job_store.cleanup_for_user(user_id)
    job_store.clear_registry_for_user(user_id)
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
        
        return {
            "status": "success",
            "totalFiles": total,
            "newFiles": len(new_ids),
            "previouslyProcessed": total - len(new_ids)
        }
    except Exception as e:
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
        
        return {
            "status": "success",
            "queued": queued
        }
    except Exception as e:
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
        return {"status": "success", "message": "Local storage cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))