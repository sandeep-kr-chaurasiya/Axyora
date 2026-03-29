"""
Axyora — FAISS Vector Store with Optimized Deletion and Caching
Persists index + metadata to ~/.axyora/ between restarts.
Supports per-user CRUD and bulk similarity search with efficient deletion.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, List

import numpy as np

STORE_DIR = Path.home() / ".axyora"
INDEX_PATH = STORE_DIR / "faiss_index.bin"
META_PATH = STORE_DIR / "metadata.json"


class VectorStore:
    """
    FAISS IndexFlatIP (inner product on normalized vectors = cosine similarity).
    All vectors are expected to be L2-normalized before insertion.
    Optimized with efficient batch operations and lazy index rebuilding.
    """

    def __init__(self):
        import faiss  # type: ignore
        STORE_DIR.mkdir(parents=True, exist_ok=True)
        self._faiss = faiss

        # Metadata list: index position → dict
        self._metadata: list[dict] = []
        self._needs_rebuild = False  # Lazy rebuild flag
        self._deleted_indices: set[int] = set()  # Track deleted indices

        if INDEX_PATH.exists() and META_PATH.exists():
            self._index = faiss.read_index(str(INDEX_PATH))
            with open(META_PATH, "r") as f:
                self._metadata = json.load(f)
            print(f"[VectorStore] Loaded {self._index.ntotal} vectors from disk.")
        else:
            # Dim 384 matches BGE-small
            self._index = faiss.IndexFlatIP(384)
            print("[VectorStore] Created fresh index (dim=384).")

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    def add(self, embedding: List[float], metadata: dict) -> int:
        """Insert one vector + its metadata. Returns the assigned vector id."""
        vec = np.array([embedding], dtype=np.float32)
        self._index.add(vec)
        pos = len(self._metadata)
        self._metadata.append({**metadata, "_vec_id": pos, "_added_at": time.time()})
        return pos

    def add_batch(self, embeddings: List[List[float]], metadatas: list[dict]):
        """Bulk insert multiple vectors with optimized batch processing."""
        if not embeddings:
            return
        mat = np.array(embeddings, dtype=np.float32)
        base = len(self._metadata)
        self._index.add(mat)
        for i, meta in enumerate(metadatas):
            self._metadata.append({**meta, "_vec_id": base + i, "_added_at": time.time()})

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query_embedding: List[float],
        top_k: int = 5,
        user_id: str | None = None,
    ) -> list[dict]:
        """
        Returns top_k most similar chunks.
        Each result: { score, text, file_name, file_type, file_id, chunk_index, ... }
        """
        if self._index.ntotal == 0:
            return []

        vec = np.array([query_embedding], dtype=np.float32)
        # Fetch more than top_k so we can filter by user and deleted indices
        fetch_k = min(top_k * 15, self._index.ntotal)
        scores, indices = self._index.search(vec, fetch_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            if idx in self._deleted_indices:  # Skip deleted
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
        """
        Returns top_k chunks of a specific file type (e.g., 'image', 'pdf').
        Each result includes score and full metadata.
        """
        if self._index.ntotal == 0:
            return []

        vec = np.array([query_embedding], dtype=np.float32)
        # Fetch more to account for filtering
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

    # ------------------------------------------------------------------
    # Delete (Optimized with lazy rebuild)
    # ------------------------------------------------------------------

    def delete_by_file(self, file_id: str) -> int:
        """Mark all vectors for deletion by file_id. Returns count marked."""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("file_id") == file_id:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def delete_by_user(self, user_id: str) -> int:
        """Mark all vectors for deletion by user. Returns count marked."""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("user_id") == user_id:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def delete_by_path(self, user_id: str, local_path: str) -> int:
        """Mark all vectors for deletion by user + path. Returns count marked."""
        count = 0
        for i, m in enumerate(self._metadata):
            if m.get("user_id") == user_id and m.get("local_path") == local_path:
                self._deleted_indices.add(i)
                count += 1
        if count > 0:
            self._needs_rebuild = True
        return count

    def _rebuild_index_if_needed(self, force: bool = False):
        """Rebuild FAISS index if marked dirty (lazy rebuild for performance)."""
        if not force and not self._needs_rebuild:
            return
        if not self._deleted_indices:
            self._needs_rebuild = False
            return

        # Keep indices that aren't deleted
        keep_indices = [i for i in range(len(self._metadata)) if i not in self._deleted_indices]
        removed = len(self._metadata) - len(keep_indices)

        # Rebuild index and metadata
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

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def total_vectors(self) -> int:
        return self._index.ntotal

    def user_stats(self, user_id: str) -> dict:
        """Get indexing statistics for a user."""
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

    # ------------------------------------------------------------------
    # Persistence (Atomic)
    # ------------------------------------------------------------------

    def persist(self):
        """Save index and metadata to disk with atomic write behavior."""
        if not self._metadata and not INDEX_PATH.exists():
            return
            
        self._rebuild_index_if_needed(force=True)
        
        # Temp paths for atomic swap
        idx_tmp = str(INDEX_PATH) + ".tmp"
        meta_tmp = str(META_PATH) + ".tmp"
        
        try:
            self._faiss.write_index(self._index, idx_tmp)
            with open(meta_tmp, "w") as f:
                json.dump(self._metadata, f, indent=2)
            
            # Atomic swap
            os.replace(idx_tmp, str(INDEX_PATH))
            os.replace(meta_tmp, str(META_PATH))
            print(f"[VectorStore] Persisted {self._index.ntotal} vectors atomicially.")
        except Exception as e:
            print(f"[VectorStore] ERROR: Persistence failed: {e}")
            if os.path.exists(idx_tmp): os.unlink(idx_tmp)
            if os.path.exists(meta_tmp): os.unlink(meta_tmp)
            raise
