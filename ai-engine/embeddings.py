"""
Axyora — Embedding Engine with Optimized Model Management
Uses BAAI/bge-small-en-v1.5 from sentence-transformers.
384-dimensional dense vectors, normalized for cosine similarity.
Includes caching and memory optimization.
"""

from __future__ import annotations

from typing import List
import gc

import numpy as np


from production_config import EMBEDDING_MODEL

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
        self._query_cache: dict[str, List[float]] = {}
        self._text_cache: dict[str, List[float]] = {}
        
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
        if text in self._text_cache:
            return self._text_cache[text]
        
        vec = self._model.encode(
            [text],
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        result = vec[0].tolist()
        
        # Cache only small strings to avoid memory bloat
        if len(text) < 1000:
            self._text_cache[text] = result
        
        return result

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Embed a batch of texts with memory optimization.
        Returns list of normalized float lists, one per input.
        """
        if not texts:
            return []

        vectors = self._model.encode(
            texts,
            batch_size=batch_size,
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
        if query in self._query_cache:
            return self._query_cache[query]
        
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        result = self.embed_single(prefixed)
        
        # Cache queries since they're often repeated
        if len(self._query_cache) < 1000:
            self._query_cache[query] = result
        
        return result

    def clear_cache(self):
        """Clear embedding cache to free memory."""
        self._query_cache.clear()
        self._text_cache.clear()
        gc.collect()
        print("[Embeddings] Cache cleared")
