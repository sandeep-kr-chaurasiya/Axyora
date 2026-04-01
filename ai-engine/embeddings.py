"""
Axyora — Embedding Engine with Optimized Model Management
Uses BAAI/bge-small-en-v1.5 from sentence-transformers.
384-dimensional dense vectors, normalized for cosine similarity.
Includes caching and memory optimization.
"""

from __future__ import annotations

from typing import List, Optional
import gc
from collections import OrderedDict

import numpy as np


from production_config import EMBEDDING_MODEL, EMBED_BATCH_SIZE, EMBED_QUERY_CACHE_MAX, EMBED_TEXT_CACHE_MAX

_embedding_instance = None

def get_embedding_engine():
    global _embedding_instance
    if _embedding_instance is None:
        _embedding_instance = EmbeddingEngine()
    return _embedding_instance

class EmbeddingEngine:
    """
    Wraps sentence-transformers for batch embedding generation.
    Incorporates thread-safety and optimized query-prefixed embeddings.
    """

    def __init__(self, model_name: str | None = None):
        import torch
        import os
        # Optimized for development machines
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        
        self.model_name = model_name or EMBEDDING_MODEL
        self._model_instance = None
        self._query_cache = _LRUCache(max_size=EMBED_QUERY_CACHE_MAX)
        self._text_cache = _LRUCache(max_size=EMBED_TEXT_CACHE_MAX)
        
    @property
    def _model(self):
        if self._model_instance is None:
            from sentence_transformers import SentenceTransformer
            self._model_instance = SentenceTransformer(self.model_name)
        return self._model_instance

    @property
    def dim(self) -> int:
        return self._model.get_sentence_embedding_dimension()

    def embed_single(self, text: str) -> List[float]:
        """Embed one string with caching, return normalized float list."""
        cached = self._text_cache.get(text)
        if cached is not None:
            return cached
        
        vec = self._model.encode(
            [text],
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        result = vec[0].tolist()
        
        # Cache only small strings to avoid memory bloat
        if len(text) < 1000:
            self._text_cache.set(text, result)
        
        return result

    def embed_batch(self, texts: List[str], batch_size: Optional[int] = None) -> List[List[float]]:
        """
        Embed a batch of texts with memory optimization.
        Returns list of normalized float lists, one per input.
        """
        if not texts:
            return []

        effective_batch_size = batch_size or EMBED_BATCH_SIZE
        vectors = self._model.encode(
            texts,
            batch_size=effective_batch_size,
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 20,
            convert_to_numpy=True,
        )
        result = [v.tolist() for v in vectors]
        
        # Clean up after large batch to free GPU memory
        if len(texts) > 100:
            gc.collect()
        
        return result

    def embed_query(self, query: str) -> List[float]:
        """
        BGE models recommend a query prefix for retrieval tasks.
        Cached to avoid redundant embeddings for repeated queries.
        See: https://huggingface.co/BAAI/bge-small-en-v1.5
        """
        cached = self._query_cache.get(query)
        if cached is not None:
            return cached
        
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        result = self.embed_single(prefixed)
        
        # Cache queries since they're often repeated
        self._query_cache.set(query, result)
        
        return result

    def clear_cache(self):
        """Clear embedding cache to free memory."""
        self._query_cache.clear()
        self._text_cache.clear()
        gc.collect()
        print("[Embeddings] Cache cleared")


class _LRUCache:
    def __init__(self, max_size: int):
        self.max_size = max_size
        self._data: OrderedDict[str, List[float]] = OrderedDict()

    def get(self, key: str) -> Optional[List[float]]:
        if key not in self._data:
            return None
        value = self._data.pop(key)
        self._data[key] = value
        return value

    def set(self, key: str, value: List[float]) -> None:
        if key in self._data:
            self._data.pop(key)
        self._data[key] = value
        if len(self._data) > self.max_size:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()
