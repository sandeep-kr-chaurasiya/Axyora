"""
storage.py - Consolidated Storage Layer
Combines: JobStore (metadata_db), LocalStorageBackend, VectorStore, IndexRegistry
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import hashlib
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from production_config import DB_PATH, DB_TIMEOUT

# ============================================================================
# JOB STORE (metadata persistence)
# ============================================================================

class JobStore:
    """SQLite-backed job storage with auto-cleanup"""
    
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        """Create jobs table and image metadata table if they don't exist"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    status TEXT DEFAULT 'queued',
                    progress INTEGER DEFAULT 0,
                    current_step TEXT DEFAULT '',
                    file_type TEXT DEFAULT '',
                    chunks_processed INTEGER DEFAULT 0,
                    error TEXT,
                    created_at REAL,
                    completed_at REAL,
                    data JSON
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS image_metadata (
                    image_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_hash TEXT NOT NULL,
                    caption TEXT,
                    tags JSON,
                    model TEXT DEFAULT 'blip2-opt-2.7b',
                    confidence REAL,
                    thumbnail_base64 TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_id ON jobs(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON jobs(created_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_image_user_id ON image_metadata(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_image_file_hash ON image_metadata(file_hash)")
            
            conn.commit()
            conn.close()
            print(f"[JobStore] Database initialized at {self.db_path}")
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to initialize database: {e}")
            raise
    
    def create_job(self, job_id: str, user_id: str, file_name: str, file_type: str) -> Dict:
        """Create a new job record"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT INTO jobs (job_id, user_id, file_name, file_type, status, 
                                  progress, current_step, chunks_processed, created_at)
                VALUES (?, ?, ?, ?, 'queued', 0, 'Scanning file...', 0, ?)
            """, (job_id, user_id, file_name, file_type, now))
            conn.commit()
            conn.close()
            return {
                "job_id": job_id,
                "status": "queued",
                "progress": 0,
                "current_step": "Scanning file...",
                "file_name": file_name,
                "file_type": file_type,
                "chunks_processed": 0,
                "error": None,
                "completed_at": None,
            }
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to create job {job_id}: {e}")
            raise
    
    def update_job(self, job_id: str, **kwargs) -> bool:
        """Update job fields"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            fields = []
            values = []
            for key, value in kwargs.items():
                if key in ["status", "progress", "current_step", "chunks_processed", "error", "completed_at"]:
                    fields.append(f"{key} = ?")
                    values.append(value)
            if not fields:
                conn.close()
                return False
            values.append(job_id)
            query = f"UPDATE jobs SET {', '.join(fields)} WHERE job_id = ?"
            cursor.execute(query, values)
            conn.commit()
            conn.close()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to update job {job_id}: {e}")
            return False
    
    def get_job(self, job_id: str) -> Optional[Dict]:
        """Get a single job"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            conn.close()
            return dict(row) if row else None
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get job {job_id}: {e}")
            return None
    
    def get_user_jobs(self, user_id: str, limit: int = 100) -> List[Dict]:
        """Get all jobs for a user"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM jobs WHERE user_id = ?
                ORDER BY created_at DESC LIMIT ?
            """, (user_id, limit))
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get user jobs for {user_id}: {e}")
            return []
    
    def get_processing_jobs(self) -> List[Dict]:
        """Get all jobs still in progress"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM jobs WHERE status IN ('queued', 'processing')
                ORDER BY created_at ASC
            """)
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get processing jobs: {e}")
            return []
    
    def delete_old_jobs(self, retention_seconds: int = 3600) -> int:
        """Delete completed jobs older than retention period"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            cutoff_time = time.time() - retention_seconds
            cursor.execute("""
                DELETE FROM jobs 
                WHERE completed_at IS NOT NULL AND completed_at < ?
            """, (cutoff_time,))
            conn.commit()
            deleted = cursor.rowcount
            conn.close()
            if deleted > 0:
                print(f"[JobStore] Cleaned up {deleted} old job records")
            return deleted
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to clean up old jobs: {e}")
            return 0
    
    def cleanup_for_user(self, user_id: str) -> int:
        """Delete all jobs for a user"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM jobs WHERE user_id = ?", (user_id,))
            conn.commit()
            deleted = cursor.rowcount
            conn.close()
            return deleted
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to clean up jobs for {user_id}: {e}")
            return 0

    def store_image_metadata(
        self,
        image_id: str,
        user_id: str,
        file_path: str,
        file_name: str,
        file_hash: str,
        caption: str,
        tags: List[str],
        model: str = "blip2-opt-2.7b",
        confidence: float = 0.9,
        thumbnail_base64: Optional[str] = None,
    ) -> bool:
        """Store image metadata (caption, tags) in database"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            now = time.time()
            cursor.execute(
                """
                INSERT OR REPLACE INTO image_metadata
                (image_id, user_id, file_path, file_name, file_hash, caption, tags, 
                 model, confidence, thumbnail_base64, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    image_id,
                    user_id,
                    file_path,
                    file_name,
                    file_hash,
                    caption,
                    json.dumps(tags),
                    model,
                    confidence,
                    thumbnail_base64,
                    now,
                    now,
                ),
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to store image metadata for {file_name}: {e}")
            return False

    def get_image_metadata(self, image_id: str) -> Optional[Dict]:
        """Retrieve image metadata by image_id"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM image_metadata WHERE image_id = ?", (image_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return None
            result = dict(row)
            if result.get("tags"):
                result["tags"] = json.loads(result["tags"])
            return result
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get image metadata for {image_id}: {e}")
            return None

    def get_user_images(self, user_id: str) -> List[Dict]:
        """Get all images for a user"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM image_metadata WHERE user_id = ?
                ORDER BY created_at DESC
            """,
                (user_id,),
            )
            rows = cursor.fetchall()
            conn.close()
            results = []
            for row in rows:
                result = dict(row)
                if result.get("tags"):
                    result["tags"] = json.loads(result["tags"])
                results.append(result)
            return results
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get user images for {user_id}: {e}")
            return []

    def get_image_by_file_hash(self, file_hash: str, user_id: str) -> Optional[Dict]:
        """Get image metadata by file hash (deduplication)"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM image_metadata WHERE file_hash = ? AND user_id = ?
            """,
                (file_hash, user_id),
            )
            row = cursor.fetchone()
            conn.close()
            if not row:
                return None
            result = dict(row)
            if result.get("tags"):
                result["tags"] = json.loads(result["tags"])
            return result
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get image by hash: {e}")
            return None

    def delete_image_metadata(self, image_id: str) -> bool:
        """Delete image metadata"""
        try:
            conn = sqlite3.connect(self.db_path, timeout=DB_TIMEOUT)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM image_metadata WHERE image_id = ?", (image_id,))
            conn.commit()
            conn.close()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to delete image metadata: {e}")
            return False


# ============================================================================
# LOCAL STORAGE BACKEND
# ============================================================================

class LocalStorageBackend:
    """Local file storage with 3-stage pipeline"""
    
    def __init__(self, storage_dir: str = "./.axyora_local"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.files_db = self.storage_dir / "files.json"
        self.queue_db = self.storage_dir / "queue.json"
        self.metadata_db = self.storage_dir / "metadata.json"
        self._ensure_dbs_exist()

    def _ensure_dbs_exist(self):
        """Initialize empty DBs if they don't exist"""
        for db_file in [self.files_db, self.queue_db, self.metadata_db]:
            if not db_file.exists():
                if db_file == self.metadata_db:
                    self._write_json(
                        db_file,
                        {
                            "totalFiles": 0,
                            "totalSize": 0,
                            "lastSync": None,
                            "indexProgress": 0,
                        },
                    )
                else:
                    self._write_json(db_file, [])

    @staticmethod
    def _compute_hash(file_path: str) -> str:
        """Compute SHA-256 hash of file content"""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            return ""

    def store_discovered_files(self, files: List[Dict]) -> Tuple[int, List[str]]:
        """Stage 1: Store all discovered files locally"""
        try:
            existing = self._read_json(self.files_db)
            hash_map = {f["hash"]: f for f in existing}
            new_ids = []
            
            for file in files:
                try:
                    file_hash = self._compute_hash(file["path"])
                    if not file_hash or file_hash in hash_map:
                        continue
                    file_record = {
                        "id": f"file_{len(hash_map)}_{int(time.time() * 1000)}",
                        "name": file["name"],
                        "path": file["path"],
                        "uri": file.get("uri", ""),
                        "type": file["type"],
                        "mimeType": file["mimeType"],
                        "size": file["size"],
                        "hash": file_hash,
                        "discoveredAt": int(time.time() * 1000),
                        "indexed": False,
                        "indexedAt": None,
                    }
                    hash_map[file_hash] = file_record
                    new_ids.append(file_record["id"])
                except Exception as e:
                    continue

            all_files = list(hash_map.values())
            self._write_json(self.files_db, all_files)
            self._update_metadata(
                totalFiles=len(all_files),
                totalSize=sum(f["size"] for f in all_files),
            )
            return len(all_files), new_ids
        except Exception as e:
            return 0, []

    def queue_files_for_processing(self, file_ids: List[str]) -> int:
        """Stage 2: Move files from storage to processing queue"""
        try:
            files = self._read_json(self.files_db)
            queue = self._read_json(self.queue_db)
            files_to_queue = [
                f for f in files if f["id"] in file_ids and not f["indexed"]
            ]
            for file in files_to_queue:
                queue_item = {
                    "id": f"queue_{file['id']}_{int(time.time() * 1000)}",
                    "fileId": file["id"],
                    "status": "pending",
                    "progress": 0,
                    "error": None,
                    "addedAt": int(time.time() * 1000),
                    "completedAt": None,
                }
                queue.append(queue_item)
            self._write_json(self.queue_db, queue)
            return len(files_to_queue)
        except Exception as e:
            return 0

    def update_processing_status(
        self,
        queue_item_id: str,
        status: str,
        progress: Optional[int] = None,
        error: Optional[str] = None,
    ) -> bool:
        """Stage 3: Update processing status for a queued file"""
        try:
            queue = self._read_json(self.queue_db)
            item = next((i for i in queue if i["id"] == queue_item_id), None)
            if not item:
                return False
            item["status"] = status
            if progress is not None:
                item["progress"] = progress
            if error:
                item["error"] = error
            if status in ["complete", "failed"]:
                item["completedAt"] = int(time.time() * 1000)
            if status == "complete":
                files = self._read_json(self.files_db)
                file = next((f for f in files if f["id"] == item["fileId"]), None)
                if file:
                    file["indexed"] = True
                    file["indexedAt"] = int(time.time() * 1000)
                    self._write_json(self.files_db, files)
            self._write_json(self.queue_db, queue)
            return True
        except Exception as e:
            return False

    def get_files_by_type(self, file_type: str) -> List[Dict]:
        """Get all stored files of a specific type"""
        try:
            files = self._read_json(self.files_db)
            return [f for f in files if f["type"] == file_type]
        except Exception as e:
            return []

    def get_pending_files(self) -> List[Dict]:
        """Get all files waiting to be indexed"""
        try:
            queue = self._read_json(self.queue_db)
            return [
                item
                for item in queue
                if item["status"] in ["pending", "storing", "indexing"]
            ]
        except Exception as e:
            return []

    def get_failed_files(self) -> List[Dict]:
        """Get all files that failed processing"""
        try:
            queue = self._read_json(self.queue_db)
            return [item for item in queue if item["status"] == "failed"]
        except Exception as e:
            return []

    def get_progress(self) -> Dict:
        """Get overall indexing progress"""
        try:
            files = self._read_json(self.files_db)
            queue = self._read_json(self.queue_db)
            total = len(files)
            indexed = sum(1 for f in files if f["indexed"])
            pending = sum(1 for i in queue if i["status"] == "pending")
            processing = sum(1 for i in queue if i["status"] in ["storing", "indexing"])
            failed = sum(1 for i in queue if i["status"] == "failed")
            return {
                "total": total,
                "indexed": indexed,
                "pending": pending,
                "processing": processing,
                "failed": failed,
                "percentComplete": round((indexed / total * 100) if total > 0 else 0, 2),
            }
        except Exception as e:
            return {
                "total": 0,
                "indexed": 0,
                "pending": 0,
                "processing": 0,
                "failed": 0,
                "percentComplete": 0,
            }

    def _read_json(self, file_path: Path) -> any:
        try:
            with open(file_path) as f:
                return json.load(f)
        except Exception as e:
            return [] if file_path.suffix == ".json" and "db" in str(file_path) else {}

    def _write_json(self, file_path: Path, data: any):
        try:
            with open(file_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            pass

    def _update_metadata(self, **kwargs):
        try:
            metadata = self._read_json(self.metadata_db)
            metadata.update(kwargs)
            metadata["lastSync"] = time.time()
            self._write_json(self.metadata_db, metadata)
        except Exception as e:
            pass

    def clear_all(self):
        """Clear all local storage"""
        try:
            for db_file in [self.files_db, self.queue_db]:
                self._write_json(db_file, [])
            self._write_json(
                self.metadata_db,
                {
                    "totalFiles": 0,
                    "totalSize": 0,
                    "lastSync": None,
                    "indexProgress": 0,
                },
            )
        except Exception as e:
            pass

    def export_database(self) -> Dict:
        """Export entire local database for backup/debugging"""
        try:
            return {
                "files": self._read_json(self.files_db),
                "queue": self._read_json(self.queue_db),
                "metadata": self._read_json(self.metadata_db),
            }
        except Exception as e:
            return {"files": [], "queue": [], "metadata": {}}


# ============================================================================
# VECTOR STORE (FAISS)
# ============================================================================

class VectorStore:
    """FAISS IndexFlatIP with optimized deletion and persistence"""
    
    STORE_DIR = Path.home() / ".axyora"
    INDEX_PATH = STORE_DIR / "faiss_index.bin"
    META_PATH = STORE_DIR / "metadata.json"

    def __init__(self):
        import faiss
        self.STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._faiss = faiss
        self._metadata: list[dict] = []
        self._needs_rebuild = False
        self._deleted_indices: set[int] = set()

        if self.INDEX_PATH.exists() and self.META_PATH.exists():
            self._index = faiss.read_index(str(self.INDEX_PATH))
            with open(self.META_PATH, "r") as f:
                self._metadata = json.load(f)
            print(f"[VectorStore] Loaded {self._index.ntotal} vectors from disk.")
        else:
            self._index = faiss.IndexFlatIP(384)
            print("[VectorStore] Created fresh index (dim=384).")

    def add(self, embedding: List[float], metadata: dict) -> int:
        """Insert one vector + its metadata"""
        import numpy as np
        vec = np.array([embedding], dtype=np.float32)
        self._index.add(vec)
        pos = len(self._metadata)
        self._metadata.append({**metadata, "_vec_id": pos, "_added_at": time.time()})
        return pos

    def add_batch(self, embeddings: List[List[float]], metadatas: list[dict]):
        """Bulk insert multiple vectors"""
        if not embeddings:
            return
        import numpy as np
        mat = np.array(embeddings, dtype=np.float32)
        base = len(self._metadata)
        self._index.add(mat)
        for i, meta in enumerate(metadatas):
            self._metadata.append({**meta, "_vec_id": base + i, "_added_at": time.time()})

    def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        user_id: str | None = None,
    ) -> list[dict]:
        """Search for top_k similar chunks"""
        import numpy as np
        if self._index.ntotal == 0:
            return []
        vec = np.array([query_embedding], dtype=np.float32)
        fetch_k = min(top_k * 15, self._index.ntotal)
        scores, indices = self._index.search(vec, fetch_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            if idx in self._deleted_indices:
                continue
            meta = self._metadata[idx]
            if user_id and meta.get("user_id") != user_id:
                continue
            results.append({**meta, "score": float(score)})
            if len(results) >= top_k:
                break
        return results

    def search_by_type(
        self,
        query_embedding: List[float],
        file_type: str,
        top_k: int = 5,
        user_id: str | None = None,
    ) -> list[dict]:
        """Search for top_k chunks of a specific file type"""
        import numpy as np
        if self._index.ntotal == 0:
            return []
        vec = np.array([query_embedding], dtype=np.float32)
        fetch_k = min(top_k * 30, self._index.ntotal)
        scores, indices = self._index.search(vec, fetch_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            if idx in self._deleted_indices:
                continue
            meta = self._metadata[idx]
            if user_id and meta.get("user_id") != user_id:
                continue
            if meta.get("file_type") != file_type:
                continue
            results.append({**meta, "score": float(score)})
            if len(results) >= top_k:
                break
        return results

    def delete_by_file(self, file_id: str) -> int:
        """Mark all vectors for deletion by file_id"""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("file_id") == file_id:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def delete_by_user(self, user_id: str) -> int:
        """Mark all vectors for deletion by user"""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("user_id") == user_id:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def delete_by_path(self, user_id: str, local_path: str) -> int:
        """Mark all vectors for deletion by user + path"""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("user_id") == user_id and m.get("local_path") == local_path:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def _rebuild_index_if_needed(self, force: bool = False):
        """Rebuild FAISS index if marked dirty"""
        if not force and not self._needs_rebuild:
            return
        if not self._deleted_indices:
            self._needs_rebuild = False
            return
        import numpy as np
        keep_indices = [i for i in range(len(self._metadata)) if i not in self._deleted_indices]
        removed = len(self._metadata) - len(keep_indices)
        new_meta = [self._metadata[i] for i in keep_indices]
        new_index = self._faiss.IndexFlatIP(384)
        if keep_indices:
            vectors = np.zeros((len(keep_indices), 384), dtype=np.float32)
            for new_pos, old_pos in enumerate(keep_indices):
                self._index.reconstruct(old_pos, vectors[new_pos])
            new_index.add(vectors)
        self._index = new_index
        self._metadata = new_meta
        self._deleted_indices.clear()
        self._needs_rebuild = False
        print(f"[VectorStore] Rebuilt index, removed {removed} vectors")

    def total_vectors(self) -> int:
        return self._index.ntotal

    def user_stats(self, user_id: str) -> dict:
        """Get indexing statistics for a user"""
        user_meta = [m for i, m in enumerate(self._metadata) if m.get("user_id") == user_id and i not in self._deleted_indices]
        files: dict[str, dict] = {}
        for m in user_meta:
            fid = m.get("file_id", "")
            if fid not in files:
                files[fid] = {
                    "file_name": m.get("file_name"),
                    "file_type": m.get("file_type"),
                    "local_path": m.get("local_path", ""),
                    "chunk_count": 0,
                    "added_at": m.get("_added_at"),
                }
            files[fid]["chunk_count"] += 1
        return {
            "user_id": user_id,
            "total_chunks": len(user_meta),
            "total_files": len(files),
            "files": list(files.values()),
        }

    def persist(self):
        """Save index and metadata to disk"""
        if not self._metadata and not self.INDEX_PATH.exists():
            return
        self._rebuild_index_if_needed(force=True)
        idx_tmp = str(self.INDEX_PATH) + ".tmp"
        meta_tmp = str(self.META_PATH) + ".tmp"
        try:
            self._faiss.write_index(self._index, idx_tmp)
            with open(meta_tmp, "w") as f:
                json.dump(self._metadata, f, indent=2)
            os.replace(idx_tmp, str(self.INDEX_PATH))
            os.replace(meta_tmp, str(self.META_PATH))
            print(f"[VectorStore] Persisted {self._index.ntotal} vectors atomically.")
        except Exception as e:
            print(f"[VectorStore] ERROR: Persistence failed: {e}")
            if os.path.exists(idx_tmp): os.unlink(idx_tmp)
            if os.path.exists(meta_tmp): os.unlink(meta_tmp)
            raise


# ============================================================================
# INDEX REGISTRY (deduplication tracking)
# ============================================================================

class IndexRegistry:
    """Incremental Index Registry - Tracks previously indexed file hashes per user"""
    
    STORE_DIR = Path.home() / ".axyora"
    REGISTRY_PATH = STORE_DIR / "index_registry.json"

    def __init__(self):
        self.STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, dict] = {}
        if self.REGISTRY_PATH.exists():
            try:
                self._records = json.loads(self.REGISTRY_PATH.read_text())
            except Exception:
                self._records = {}

    @staticmethod
    def _key(user_id: str, file_hash: str) -> str:
        return f"{user_id}::{file_hash}"

    def get(self, user_id: str, file_hash: str) -> dict | None:
        return self._records.get(self._key(user_id, file_hash))

    def get_by_path(self, user_id: str, file_path: str) -> dict | None:
        prefix = f"{user_id}::"
        for key, value in self._records.items():
            if not key.startswith(prefix):
                continue
            if value.get("file_path") == file_path:
                return value
        return None

    def upsert(
        self,
        user_id: str,
        file_hash: str,
        file_name: str,
        file_path: str,
        chunks: int,
    ):
        self._records[self._key(user_id, file_hash)] = {
            "file_name": file_name,
            "file_path": file_path,
            "chunks": chunks,
            "updated_at": time.time(),
        }

    def delete_by_user(self, user_id: str) -> int:
        keys = [k for k in self._records.keys() if k.startswith(f"{user_id}::")]
        for key in keys:
            self._records.pop(key, None)
        return len(keys)

    def persist(self):
        self.REGISTRY_PATH.write_text(json.dumps(self._records, indent=2))


# ============================================================================
# Convenience singleton
# ============================================================================

_storage_instance = None

def get_local_storage() -> LocalStorageBackend:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalStorageBackend()
    return _storage_instance
