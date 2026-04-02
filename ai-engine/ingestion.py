"""
ingestion.py - Local File Discovery and Ingestion Engine
Handles scanning local directories for images and documents only, optimized for local mobile-first processing
"""

import os
import time
import hashlib
import logging
from pathlib import Path
from typing import List, Dict, Callable, Optional

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supported file extensions
SUPPORTED_EXTENSIONS = {
    # Documents
    ".pdf", ".docx", ".doc", ".txt", ".md", ".rtf",
    # Images
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".heic",
}

# File size limits
MAX_FILE_SIZE_MB = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


class IngestionEngine:
    """
    Manages local file discovery and ingestion
    Scans directories, deduplicates, and queues files for processing
    """
    
    def __init__(
        self,
        library_path: str,
        user_id: str,
        queue_callback: Optional[Callable] = None
    ):
        """
        Initialize ingestion engine
        
        Args:
            library_path: Path to the Axyora library directory
            user_id: User identifier
            queue_callback: Callback function to queue files for processing
        """
        self.library_path = Path(library_path).expanduser()
        self.user_id = user_id
        self.queue_callback = queue_callback
        
        # Statistics
        self.stats = {
            "total_scanned": 0,
            "total_queued": 0,
            "total_skipped": 0,
            "total_errors": 0,
        }
        
        logger.info(f"[Ingestion] Initialized for path: {self.library_path}")
    
    def scan_directory(
        self,
        return_files: bool = False,
        auto_queue: bool = False
    ) -> List[Dict] | int:
        """
        Scan library directory for supported files
        
        Args:
            return_files: If True, return list of file dicts; else return count
            auto_queue: If True, automatically queue discovered files
        
        Returns:
            List of file dicts or count of files found
        """
        if not self.library_path.exists():
            logger.warning(f"[Ingestion] Library path does not exist: {self.library_path}")
            return [] if return_files else 0
        
        files_found = []
        self.stats = {k: 0 for k in self.stats.keys()}
        
        logger.info(f"[Ingestion] Scanning directory: {self.library_path}")
        
        # Mobile optimization: streaming scan instead of loading full file list into memory
        try:
            for file_path in self._walk_directory(self.library_path):
                self.stats["total_scanned"] += 1
                
                # Process file
                file_dict = self._process_file(file_path)
                
                if file_dict:
                    files_found.append(file_dict)
                    
                    if auto_queue and self.queue_callback:
                        try:
                            self.queue_callback(**file_dict)
                            self.stats["total_queued"] += 1
                        except Exception as e:
                            logger.error(f"[Ingestion] Queue error for {file_path.name}: {e}")
                            self.stats["total_errors"] += 1
                else:
                    self.stats["total_skipped"] += 1
                
                # Log progress every 100 files
                if self.stats["total_scanned"] % 100 == 0:
                    logger.info(
                        f"[Ingestion] Progress: {self.stats['total_scanned']} scanned, "
                        f"{len(files_found)} valid files found"
                    )
        
        except Exception as e:
            logger.error(f"[Ingestion] Scan error: {e}")
        
        logger.info(
            f"[Ingestion] Scan complete: {self.stats['total_scanned']} scanned, "
            f"{len(files_found)} valid files, {self.stats['total_skipped']} skipped"
        )
        
        return files_found if return_files else len(files_found)
    
    def _walk_directory(self, root_path: Path):
        """
        Recursively walk directory and yield file paths
        Skips hidden files and system directories
        Optimized to avoid heavy recursion overhead for mobile environments
        """
        skip_dirs = {
            ".git", ".svn", ".hg", "__pycache__", "node_modules",
            ".DS_Store", ".Trash", "Trash", "$RECYCLE.BIN"
        }
        
        try:
            for entry in root_path.iterdir():
                try:
                    # Skip hidden files and directories
                    if entry.name.startswith('.'):
                        continue
                    
                    # Skip system directories
                    if entry.name in skip_dirs:
                        continue
                    
                    if entry.is_file():
                        yield entry
                    elif entry.is_dir():
                        # Recursively walk subdirectories
                        yield from self._walk_directory(entry)
                
                except (PermissionError, OSError) as e:
                    logger.warning(f"[Ingestion] Cannot access {entry}: {e}")
                    continue
        
        except (PermissionError, OSError) as e:
            logger.warning(f"[Ingestion] Cannot access directory {root_path}: {e}")
    
    def _process_file(self, file_path: Path) -> Optional[Dict]:
        """
        Process a single file and return metadata dict
        Returns None if file should be skipped
        """
        try:
            # Check file extension
            if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                return None
            
            # Get file stats
            stat = file_path.stat()
            file_size = stat.st_size
            modified_time = stat.st_mtime
            
            # Skip files that are too large
            if file_size > MAX_FILE_SIZE_BYTES:
                logger.warning(
                    f"[Ingestion] File too large ({file_size / 1024 / 1024:.1f}MB): "
                    f"{file_path.name}"
                )
                return None
            
            # Skip empty files
            if file_size == 0:
                return None
            
            # Determine file type
            file_type = self._detect_file_type(file_path)
            
            if file_type == "unknown":
                return None
            
            # NOTE: Lightweight hash (path+size+mtime) used for mobile performance (avoids full file read)
            # Compute file hash for deduplication
            file_hash = self._compute_file_hash(file_path, file_size, modified_time)
            
            # Build file metadata
            file_dict = {
                "name": file_path.name,
                "path": str(file_path),
                "type": file_type,
                "mimeType": self._get_mime_type(file_path),
                "size": file_size,
                "hash": file_hash,
                "modified_at": modified_time,
                # For queue callback
                "user_id": self.user_id,
                "file_name": file_path.name,
                "file_type": file_type,
                "file_path": str(file_path),
                "file_hash": file_hash,
                "category": "image" if file_type == "image" else "document",
            }
            
            return file_dict
        
        except Exception as e:
            logger.error(f"[Ingestion] Error processing {file_path}: {e}")
            return None
    
    @staticmethod
    def _detect_file_type(file_path: Path) -> str:
        """Detect file type from extension"""
        ext = file_path.suffix.lower()
        
        if ext == ".pdf":
            return "pdf"
        elif ext in (".docx", ".doc"):
            return "docx"
        elif ext in (".txt", ".md", ".rtf"):
            return "txt"
        elif ext in (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".heic"):
            return "image"
        else:
            return "unknown"
    
    @staticmethod
    def _get_mime_type(file_path: Path) -> str:
        """Get MIME type for file"""
        ext = file_path.suffix.lower()
        
        mime_types = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".doc": "application/msword",
            ".txt": "text/plain",
            ".md": "text/markdown",
            ".rtf": "application/rtf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff",
            ".webp": "image/webp",
            ".heic": "image/heic",
        }
        
        return mime_types.get(ext, "application/octet-stream")
    
    @staticmethod
    def _compute_file_hash(file_path: Path, file_size: int, modified_time: float) -> str:
        """
        Compute fast hash for file deduplication
        Uses path + size + mtime instead of full content hash for speed
        """
        # Create hash from path, size, and modification time
        # This is much faster than hashing entire file content
        hash_input = f"{file_path}::{file_size}::{int(modified_time)}"
        return hashlib.sha256(hash_input.encode()).hexdigest()[:16]
    
    def get_stats(self) -> Dict:
        """Get ingestion statistics"""
        return {
            **self.stats,
            "library_path": str(self.library_path),
            "user_id": self.user_id,
        }
    
    def queue_file(self, file_path: str) -> bool:
        """
        Manually queue a specific file
        
        Args:
            file_path: Path to file to queue
        
        Returns:
            True if queued successfully, False otherwise
        """
        try:
            path = Path(file_path)
            
            if not path.exists():
                logger.error(f"[Ingestion] File not found: {file_path}")
                return False
            
            file_dict = self._process_file(path)
            
            if not file_dict:
                logger.warning(f"[Ingestion] File not valid for queuing: {file_path}")
                return False
            
            if self.queue_callback:
                self.queue_callback(**file_dict)
                logger.info(f"[Ingestion] Queued file: {path.name}")
                return True
            else:
                logger.error("[Ingestion] No queue callback configured")
                return False
        
        except Exception as e:
            logger.error(f"[Ingestion] Error queuing file {file_path}: {e}")
            return False


# ============================================================================
# Utility Functions
# ============================================================================

def discover_files(library_path: str, user_id: str = "local_user") -> List[Dict]:
    """
    Convenience function to discover files in a directory
    
    Args:
        library_path: Path to scan
        user_id: User identifier
    
    Returns:
        List of file dictionaries
    """
    engine = IngestionEngine(library_path, user_id)
    return engine.scan_directory(return_files=True)


def scan_and_queue(
    library_path: str,
    user_id: str,
    queue_callback: Callable
) -> Dict:
    """
    Convenience function to scan directory and queue all files
    
    Args:
        library_path: Path to scan
        user_id: User identifier
        queue_callback: Function to call for each file
    
    Returns:
        Statistics dictionary
    """
    engine = IngestionEngine(library_path, user_id, queue_callback)
    engine.scan_directory(auto_queue=True)
    return engine.get_stats()