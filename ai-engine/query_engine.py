"""
Axyora — RAG Query Engine with Optimized Retrieval and Error Handling
Pipeline:
  1. Embed query with BGE prefix
  2. FAISS top-k retrieval
  3. Build context string from chunks
  4. Call Ollama (llama3:8b / mistral:7b) for answer synthesis
  5. Graceful fallback: return retrieved chunks if Ollama is unavailable
"""

from __future__ import annotations
from typing import Dict, Any, List

from context_builder import ContextBuilder
from embeddings import EmbeddingEngine
from vector_store import VectorStore
from groq_client import GroqClient
from logging_config import logger

class QueryEngine:

    def __init__(self, embedding_engine: EmbeddingEngine, vector_store: VectorStore):
        self._embed = embedding_engine
        self._vs = vector_store
        self._cb = ContextBuilder()
        try:
            self._llm = GroqClient()
        except Exception as e:
            logger.error("[QueryEngine] Groq client unavailable, using local fallback", error=e)
            self._llm = None

    def answer(
        self,
        query: str,
        user_id: str,
        top_k: int = 5,  # Efficient for Groq token context
        model: str = "llama-3.3-70b-versatile",
        include_images: bool = True,
    ) -> Dict[str, Any]:
        """
        Main RAG entry point powered by Groq API.
        Returns standardized JSON:
        {
            answer: string,
            sources: [{file_name, file_path, preview, type}],
            images: [{file_name, file_path, caption, image_uri}]
        }
        """
        try:
            # 1. Local Vector Search (includes all types)
            query_vec = self._embed.embed_query(query)
            results = self._vs.search(query_vec, top_k=top_k * 2, user_id=user_id)

            if not results:
                return {
                    "answer": "I have no memory of this topic in your indexed files.",
                    "sources": [],
                    "images": [],
                }

            # 2. Separate text and image results
            text_results = self._cb.extract_text_chunks_for_context(results)
            image_results = self._cb.extract_image_sources(results)

            # 3. Build context from text chunks for LLM reasoning
            context = self._cb.build_context(text_results) if text_results else ""
            sources = self._cb.extract_sources(text_results) if text_results else []

            # 4. Cloud LLM Reasoning (Groq) — only with text context
            answer = ""
            if context.strip():
                if self._llm is not None:
                    answer = self._llm.ask(query, context)
                else:
                    preview = context[:220].replace("\n", " ").strip()
                    answer = f"Local answer from indexed memory: {preview}"
            else:
                # No text context, but might have images
                if image_results:
                    answer = f"I found {len(image_results)} image(s) related to your query."
                else:
                    answer = "I have no memory of this topic in your indexed files."

            return {
                "answer": answer,
                "sources": sources,
                "images": image_results if include_images else [],
            }

        except Exception as e:
            logger.error(f"[QueryEngine] Query processing failed", error=e)
            return {"answer": "The reasoning engine encountered a critical error. Please try again.", "sources": [], "images": []}

    def search_images(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
    ) -> Dict[str, Any]:
        """
        Search for images based on natural language query.
        Returns: { images: [{file_name, file_path, caption, image_uri, score}] }
        """
        try:
            # 1. Embed query
            query_vec = self._embed.embed_query(query)

            # 2. Search for image chunks
            image_results = self._vs.search_by_type(
                query_vec, file_type="image", top_k=top_k, user_id=user_id
            )

            if not image_results:
                return {"images": [], "count": 0}

            # 3. Extract image metadata
            images = self._cb.extract_image_sources(image_results)

            return {"images": images, "count": len(images)}

        except Exception as e:
            logger.error(f"[QueryEngine] Image search failed", error=e)
            return {"images": [], "count": 0, "error": str(e)}

    # ... (_call_ollama and other helpers remain, using self._cb for fallbacks)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_sources(self, results: list[dict]) -> list[dict]:
        """Deduplicate and format source file cards for the UI."""
        seen: dict[str, dict] = {}
        # ... (rest of sources logic remains same)

    @staticmethod
    def _infer_path(file_name: str) -> str:
        """Return a plausible display path based on file extension."""
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        path_map = {
            "pdf": "/Documents/",
            "docx": "/Documents/",
            "doc": "/Documents/",
            "txt": "/Documents/Notes/",
            "png": "/DCIM/Camera/",
            "jpg": "/DCIM/Camera/",
            "jpeg": "/DCIM/Camera/",
            "mp3": "/Recordings/",
            "m4a": "/Recordings/",
            "wav": "/Recordings/",
        }
        return path_map.get(ext, "/Files/") + file_name
