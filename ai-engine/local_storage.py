"""
Local Storage Integration - Ensures backend respects local-first storage model
Stage 1: Store files locally
Stage 2: Queue for processing
Stage 3: Index/Extract (only from queue)
"""

import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class LocalStorageBackend:
    def __init__(self, storage_dir: str = "./.axyora_local"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)

        # Initialize storage structure
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

    # ==================== STAGE 1: STORE LOCALLY ====================

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
            logger.error(f"Failed to compute hash for {file_path}: {e}")
            return ""

    def store_discovered_files(
        self, files: List[Dict]
    ) -> Tuple[int, List[str]]:
        """
        Stage 1: Store all discovered files locally FIRST

        Args:
            files: List of file dicts with keys: name, path, uri, type, mimeType, size

        Returns:
            (total_stored, new_file_ids)
        """
        try:
            existing = self._read_json(self.files_db)
            hash_map = {f["hash"]: f for f in existing}

            new_ids = []
            for file in files:
                try:
                    # Compute hash for deduplication
                    file_hash = self._compute_hash(file["path"])
                    if not file_hash:
                        continue

                    # Skip if already exists
                    if file_hash in hash_map:
                        continue

                    # Create new file record
                    file_record = {
                        "id": f"file_{len(hash_map)}_{int(datetime.now().timestamp() * 1000)}",
                        "name": file["name"],
                        "path": file["path"],
                        "uri": file.get("uri", ""),
                        "type": file["type"],
                        "mimeType": file["mimeType"],
                        "size": file["size"],
                        "hash": file_hash,
                        "discoveredAt": int(datetime.now().timestamp() * 1000),
                        "indexed": False,
                        "indexedAt": None,
                    }

                    hash_map[file_hash] = file_record
                    new_ids.append(file_record["id"])

                except Exception as e:
                    logger.error(f"Failed to process file {file.get('name')}: {e}")
                    continue

            # Save all files
            all_files = list(hash_map.values())
            self._write_json(self.files_db, all_files)

            # Update metadata
            self._update_metadata(
                totalFiles=len(all_files),
                totalSize=sum(f["size"] for f in all_files),
            )

            logger.info(
                f"[LocalStorage] Stored {len(all_files)} files locally ({len(new_ids)} new)"
            )
            return len(all_files), new_ids

        except Exception as e:
            logger.error(f"Failed to store discovered files: {e}")
            return 0, []

    # ==================== STAGE 2: QUEUE FOR PROCESSING ====================

    def queue_files_for_processing(self, file_ids: List[str]) -> int:
        """
        Stage 2: Move files from storage to processing queue

        Args:
            file_ids: List of file IDs to queue

        Returns:
            Number of files queued
        """
        try:
            files = self._read_json(self.files_db)
            queue = self._read_json(self.queue_db)

            # Only queue files that exist and aren't indexed
            files_to_queue = [
                f for f in files if f["id"] in file_ids and not f["indexed"]
            ]

            # Add to queue
            for file in files_to_queue:
                queue_item = {
                    "id": f"queue_{file['id']}_{int(datetime.now().timestamp() * 1000)}",
                    "fileId": file["id"],
                    "status": "pending",  # pending -> storing -> indexing -> complete/failed
                    "progress": 0,
                    "error": None,
                    "addedAt": int(datetime.now().timestamp() * 1000),
                    "completedAt": None,
                }
                queue.append(queue_item)

            self._write_json(self.queue_db, queue)
            logger.info(f"[LocalStorage] Queued {len(files_to_queue)} files for processing")
            return len(files_to_queue)

        except Exception as e:
            logger.error(f"Failed to queue files: {e}")
            return 0

    # ==================== STAGE 3: UPDATE PROCESSING STATUS ====================

    def update_processing_status(
        self,
        queue_item_id: str,
        status: str,
        progress: Optional[int] = None,
        error: Optional[str] = None,
    ) -> bool:
        """
        Stage 3: Update processing status for a queued file

        Args:
            queue_item_id: Queue item ID
            status: 'pending' | 'storing' | 'indexing' | 'complete' | 'failed'
            progress: 0-100
            error: Error message if failed

        Returns:
            Success status
        """
        try:
            queue = self._read_json(self.queue_db)
            item = next((i for i in queue if i["id"] == queue_item_id), None)

            if not item:
                logger.warning(f"Queue item {queue_item_id} not found")
                return False

            item["status"] = status
            if progress is not None:
                item["progress"] = progress
            if error:
                item["error"] = error
            if status in ["complete", "failed"]:
                item["completedAt"] = int(datetime.now().timestamp() * 1000)

            # Mark file as indexed if complete
            if status == "complete":
                files = self._read_json(self.files_db)
                file = next((f for f in files if f["id"] == item["fileId"]), None)
                if file:
                    file["indexed"] = True
                    file["indexedAt"] = int(datetime.now().timestamp() * 1000)
                    self._write_json(self.files_db, files)

            self._write_json(self.queue_db, queue)
            return True

        except Exception as e:
            logger.error(f"Failed to update processing status: {e}")
            return False

    # ==================== QUERIES ====================

    def get_files_by_type(self, file_type: str) -> List[Dict]:
        """Get all stored files of a specific type"""
        try:
            files = self._read_json(self.files_db)
            return [f for f in files if f["type"] == file_type]
        except Exception as e:
            logger.error(f"Failed to get files by type: {e}")
            return []

    def get_pending_files(self) -> List[Dict]:
        """Get all files waiting to be indexed (in queue, not indexed)"""
        try:
            queue = self._read_json(self.queue_db)
            return [
                item
                for item in queue
                if item["status"] in ["pending", "storing", "indexing"]
            ]
        except Exception as e:
            logger.error(f"Failed to get pending files: {e}")
            return []

    def get_failed_files(self) -> List[Dict]:
        """Get all files that failed processing"""
        try:
            queue = self._read_json(self.queue_db)
            return [item for item in queue if item["status"] == "failed"]
        except Exception as e:
            logger.error(f"Failed to get failed files: {e}")
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
            logger.error(f"Failed to get progress: {e}")
            return {
                "total": 0,
                "indexed": 0,
                "pending": 0,
                "processing": 0,
                "failed": 0,
                "percentComplete": 0,
            }

    # ==================== UTILITIES ====================

    def _read_json(self, file_path: Path) -> any:
        try:
            with open(file_path) as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read {file_path}: {e}")
            return [] if file_path.suffix == ".json" and "db" in str(file_path) else {}

    def _write_json(self, file_path: Path, data: any):
        try:
            with open(file_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to write {file_path}: {e}")

    def _update_metadata(self, **kwargs):
        try:
            metadata = self._read_json(self.metadata_db)
            metadata.update(kwargs)
            metadata["lastSync"] = datetime.now().isoformat()
            self._write_json(self.metadata_db, metadata)
        except Exception as e:
            logger.error(f"Failed to update metadata: {e}")

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
            logger.info("[LocalStorage] All local data cleared")
        except Exception as e:
            logger.error(f"Failed to clear local data: {e}")

    def export_database(self) -> Dict:
        """Export entire local database for backup/debugging"""
        try:
            return {
                "files": self._read_json(self.files_db),
                "queue": self._read_json(self.queue_db),
                "metadata": self._read_json(self.metadata_db),
            }
        except Exception as e:
            logger.error(f"Failed to export database: {e}")
            return {"files": [], "queue": [], "metadata": {}}


# Singleton instance
_storage_instance = None


def get_local_storage() -> LocalStorageBackend:
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = LocalStorageBackend()
    return _storage_instance
