"""
ingestion.py - Data Ingestion Layer
Monitors local file system for changes and queues them for processing.
Features: Incremental indexing, deduplication, and background monitoring.
"""

from __future__ import annotations
import os
import time
import hashlib
import threading
from pathlib import Path
from typing import Callable, List, Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from logging_config import logger
from processor import detect_file_type

class IngestionHandler(FileSystemEventHandler):
    """Handles watchdog events for file system changes."""
    def __init__(self, on_change: Callable[[str, str], None]):
        self.on_change = on_change

    def on_created(self, event):
        if not event.is_directory:
            self.on_change(event.src_path, "created")

    def on_modified(self, event):
        if not event.is_directory:
            self.on_change(event.src_path, "modified")

class IngestionEngine:
    """
    Manages scanning and monitoring of local directories.
    Calculates hashes for deduplication and triggers processing.
    """

    def __init__(self, monitor_path: str, user_id: str, queue_callback: Callable):
        self.monitor_path = Path(monitor_path).expanduser().resolve()
        self.user_id = user_id
        self.queue_callback = queue_callback
        self.observer: Optional[Observer] = None
        self._running = False
        
        # Ensure path exists
        self.monitor_path.mkdir(parents=True, exist_ok=True)

    def calculate_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of a file for duplicate detection."""
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                # Read in 4K chunks to keep memory usage low
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            logger.error(f"Hash calculation failed for {file_path}", error=e)
            return ""

    def scan_directory(self):
        """Perform a full recursive scan of the monitored directory."""
        logger.info(f"[Ingestion] Full scan started: {self.monitor_path}")
        files_found = 0
        for root, _, files in os.walk(self.monitor_path):
            for file in files:
                full_path = str(Path(root) / file)
                self._process_path(full_path, "initial_scan")
                files_found += 1
        logger.info(f"[Ingestion] Full scan completed: {files_found} files identified.")

    def _process_path(self, path: str, event_type: str):
        """Internal logic to evaluate a file and decide if it needs processing."""
        # Filter out hidden files and OS metadata
        if Path(path).name.startswith("."):
            return

        try:
            # wait a tiny bit for file to be ready (if just created)
            if event_type == "created":
                time.sleep(0.5)

            file_size = os.path.getsize(path)
            if file_size == 0 or file_size > 100 * 1024 * 1024: # 100MB limit
                return

            # detect type
            file_type = detect_file_type(path)
            if file_type == "unknown":
                return

            file_hash = self.calculate_hash(path)
            if not file_hash:
                return

            # Trigger the callback to check against registry and queue if new
            self.queue_callback(
                user_id=self.user_id,
                file_path=path,
                file_name=os.path.basename(path),
                file_hash=file_hash,
                file_type=file_type,
                modified_at=os.path.getmtime(path)
            )

        except Exception as e:
            logger.error(f"Error evaluating file {path}", error=e)

    def start_monitoring(self):
        """Start the background watchdog observer."""
        if self._running:
            return

        self._running = True
        event_handler = IngestionHandler(self._process_path)
        self.observer = Observer()
        self.observer.schedule(event_handler, str(self.monitor_path), recursive=True)
        self.observer.start()
        logger.info(f"[Ingestion] Background monitoring active on: {self.monitor_path}")

    def stop_monitoring(self):
        """Stop the background observer."""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self._running = False
            logger.info("[Ingestion] Monitoring stopped.")

# Example standalone usage
if __name__ == "__main__":
    def dummy_callback(**kwargs):
        print(f"Queued for processing: {kwargs['file_name']} ({kwargs['file_type']})")

    engine = IngestionEngine("~/Axyora_Library", "local_dev", dummy_callback)
    engine.scan_directory()
    engine.start_monitoring()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        engine.stop_monitoring()
