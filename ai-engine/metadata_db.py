"""
SQLite job persistence layer
Replaces in-memory _jobs dict to survive service restarts
"""

import sqlite3
import json
import time
from typing import Optional, Dict, List
from production_config import DB_PATH, DB_TIMEOUT

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
            
            # Image metadata table for storing captions, tags, and visual information
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
            
            # Index for user queries and cleanup
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_id ON jobs(user_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_created_at ON jobs(created_at)
            """)
            
            # Image metadata indices
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_image_user_id ON image_metadata(user_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_image_file_hash ON image_metadata(file_hash)
            """)
            
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
            
            # Build dynamic UPDATE query
            fields = []
            values = []
            for key, value in kwargs.items():
                if key in ["status", "progress", "current_step", "chunks_processed", 
                           "error", "completed_at"]:
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
            
            if not row:
                return None
            
            return dict(row)
        except Exception as e:
            print(f"[JobStore] ERROR: Failed to get job {job_id}: {e}")
            return None
    
    def get_user_jobs(self, user_id: str, limit: int = 100) -> List[Dict]:
        """Get all jobs for a user (ordered by creation time desc)"""
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

    # ========================================================================
    # Image Metadata (Captions, Tags, Semantic Information)
    # ========================================================================

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
            # Parse JSON tags
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
