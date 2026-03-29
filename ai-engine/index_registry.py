"""
Axyora — Incremental Index Registry
Tracks previously indexed file hashes per user to avoid redundant processing.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

STORE_DIR = Path.home() / ".axyora"
REGISTRY_PATH = STORE_DIR / "index_registry.json"


class IndexRegistry:
    def __init__(self):
        STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, dict] = {}
        if REGISTRY_PATH.exists():
            try:
                self._records = json.loads(REGISTRY_PATH.read_text())
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
        REGISTRY_PATH.write_text(json.dumps(self._records, indent=2))
