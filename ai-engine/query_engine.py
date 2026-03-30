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
        self._cb = ContextBuilder(max_chunks=5)  # Enforce 3-5 chunks max (per spec)
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
            logger.info(f"[QueryEngine] Processing query: {query[:100]}")
            logger.info(f"[QueryEngine] User ID: {user_id}, top_k: {top_k}")
            
            # 1. Local Vector Search (includes all types)
            query_vec = self._embed.embed_query(query)
            results = self._vs.search(query_vec, top_k=top_k * 2, user_id=user_id)

            logger.info(f"[QueryEngine] Search returned {len(results)} results")

            if not results:
                logger.info(f"[QueryEngine] No results found for query")
                return {
                    "answer": "I have no memory of this topic in your indexed files.",
                    "sources": [],
                    "images": [],
                }

            # 2. Separate text and image results
            text_results = self._cb.extract_text_chunks_for_context(results)
            image_results = self._cb.extract_image_sources(results)

            logger.info(f"[QueryEngine] Separated results: {len(text_results)} text, {len(image_results)} images")
            
            if image_results:
                logger.info(f"[QueryEngine] Image results:")
                for img in image_results:
                    logger.info(f"  - {img.get('file_name')}: uri={img.get('image_uri')}, score={img.get('score')}")

            # 3. Build context from text chunks for LLM reasoning
            context = self._cb.build_context(text_results) if text_results else ""
            sources = self._cb.extract_sources(text_results) if text_results else []

            # 4. Cloud LLM Reasoning (Groq) — only with text context
            answer = ""
            if context.strip():
                if self._llm is not None:
                    logger.info(f"[QueryEngine] Calling Groq LLM with context ({len(context)} chars)")
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

            final_response = {
                "answer": answer,
                "sources": sources,
                "images": image_results if include_images else [],
            }
            
            logger.info(f"[QueryEngine] Returning response with {len(final_response.get('images', []))} images")
            return final_response

        except Exception as e:
            logger.error(f"[QueryEngine] Query processing failed", error=e)
            return {"answer": "The reasoning engine encountered a critical error. Please try again.", "sources": [], "images": []}

    def search_images(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
        min_confidence: float = 0.60,  # Filter out low-confidence matches
    ) -> Dict[str, Any]:
        """
        Search for images based on natural language query with relevance filtering.
        Returns: { images: [{file_name, file_path, caption, image_uri, score}] }
        
        Args:
            query: Natural language search query
            user_id: User identifier for scoped search
            top_k: Maximum number of results to return
            min_confidence: Minimum relevance score threshold (0-1)
        """
        try:
            # 1. Embed query with semantic context
            query_vec = self._embed.embed_query(query)

            # 2. Search for image chunks with higher k to allow filtering
            raw_results = self._vs.search_by_type(
                query_vec, file_type="image", top_k=top_k * 3, user_id=user_id
            )

            if not raw_results:
                return {"images": [], "count": 0}

            # 3. Filter by confidence threshold for better accuracy
            filtered_results = [r for r in raw_results if r.get("score", 0) >= min_confidence]
            
            # If too few results after filtering, relax threshold slightly
            if len(filtered_results) < 3 and raw_results:
                filtered_results = raw_results[:top_k]
            else:
                filtered_results = filtered_results[:top_k]

            # 4. Extract and rank image metadata
            images = self._cb.extract_image_sources(filtered_results)
            
            # 5. Add relevance ranking with improved scoring
            for img in images:
                score = img.get("score", 0)
                # Normalize score to 0-100 percentage
                img["relevance_score"] = min(100, max(0, int(score * 100)))
                img["confidence_level"] = self._confidence_label(score)

            return {
                "images": images,
                "count": len(images),
                "query": query,
                "min_confidence": min_confidence,
            }

        except Exception as e:
            logger.error(f"[QueryEngine] Image search failed", error=e)
            return {"images": [], "count": 0, "error": str(e)}

    @staticmethod
    def _confidence_label(score: float) -> str:
        """Convert numeric score to human-readable confidence label."""
        if score >= 0.85:
            return "very_high"
        elif score >= 0.75:
            return "high"
        elif score >= 0.65:
            return "moderate"
        elif score >= 0.50:
            return "low"
        else:
            return "very_low"

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
