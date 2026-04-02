"""
rag.py - Enhanced RAG Engine
Improvements:
- Better context building with relevance filtering
- Advanced re-ranking with hybrid scoring
- Improved query understanding and intent detection
- Better source deduplication
- Enhanced answer generation with citations
"""

from __future__ import annotations

import os
import time
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from production_config import QUERY_CACHE_TTL_SECONDS, QUERY_CACHE_MAX, MAX_CONTEXT_CHUNKS, CONTEXT_RELEVANCE_THRESHOLD
from groq import Groq

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# CONVERSATION MEMORY
# ============================================================================

class ConversationMemory:
    """Enhanced conversation memory with user profiling"""
    
    MAX_TURNS = 15
    MAX_CHARS = 8_000

    def __init__(self):
        self._turns: List[Dict[str, str]] = []
        self._user_profile: Dict[str, Any] = {}

    def add(self, role: str, content: str) -> None:
        """Add a conversation turn"""
        self._turns.append({"role": role, "content": content})
        if len(self._turns) > self.MAX_TURNS * 2:
            # Keep last MAX_TURNS exchanges
            self._turns = self._turns[-(self.MAX_TURNS * 2):]

    def get_history(self) -> List[Dict[str, str]]:
        """Return history trimmed to MAX_CHARS"""
        history = list(self._turns)
        total = sum(len(m["content"]) for m in history)
        
        # Trim from the beginning if too long
        while total > self.MAX_CHARS and len(history) > 2:
            removed = history.pop(0)
            total -= len(removed["content"])
        
        return history

    def update_profile(self, key: str, value: Any) -> None:
        """Update user profile information"""
        self._user_profile[key] = value

    def get_profile_summary(self) -> str:
        """Get formatted user profile summary"""
        if not self._user_profile:
            return ""
        lines = [f"- {k}: {v}" for k, v in self._user_profile.items()]
        return "Known facts about this user:\n" + "\n".join(lines)

    def clear(self) -> None:
        """Clear all conversation history"""
        self._turns.clear()
        self._user_profile.clear()

    @property
    def turn_count(self) -> int:
        return len(self._turns) // 2


# ============================================================================
# ENHANCED CONTEXT BUILDER
# ============================================================================

class ContextBuilder:
    """
    Advanced context construction with:
    - Relevance filtering
    - Smart deduplication
    - Source diversity
    - Token budget management
    """

    def __init__(self, max_chars: int = 15000, max_chunks: int = 5):
        self.max_chars = max_chars
        self.max_chunks = max_chunks

    def build_context(
        self,
        retrieved_chunks: List[Dict[str, Any]],
        min_score: float = max(CONTEXT_RELEVANCE_THRESHOLD, 0.55)
    ) -> str:
        """
        Build formatted context string from search results
        Enhanced with better filtering and formatting
        """
        if not retrieved_chunks:
            return ""

        # Step 1: Filter by minimum relevance score
        filtered_chunks = [
            c for c in retrieved_chunks
            if c.get("hybrid_score", c.get("score", 0)) >= min_score
        ]

        if not filtered_chunks:
            return ""

        # Step 2: Deduplicate by content
        seen_texts = set()
        unique_chunks = []
        
        for chunk in filtered_chunks:
            text = chunk.get("text", "").strip()
            # Use first 100 chars as dedup key
            dedup_key = text[:100].lower()
            
            if text and dedup_key not in seen_texts:
                unique_chunks.append(chunk)
                seen_texts.add(dedup_key)

        # Step 3: Sort by score and limit to max_chunks
        unique_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        unique_chunks = unique_chunks[:self.max_chunks]

        # Step 4: Build formatted context
        context_parts = []
        current_len = 0
        
        for i, chunk in enumerate(unique_chunks):
            fname = chunk.get("file_name", "Unknown Document")
            ftype = chunk.get("file_type", "document")
            score = chunk.get("hybrid_score", chunk.get("score", 0))
            text_snippet = chunk.get("text", "").strip()
            
            # Format source header with metadata
            source_header = f"\n{'='*60}\n[Source {i+1}]: {fname} ({ftype}) [Relevance: {score:.2f}]\n{'='*60}"
            snippet_formatted = f"\n{text_snippet}\n"
            full_segment = f"{source_header}{snippet_formatted}"
            
            # Check token budget
            if current_len + len(full_segment) > self.max_chars:
                if not context_parts:
                    # At least include truncated first result
                    truncated = full_segment[:self.max_chars] + "\n... [Truncated due to length]"
                    context_parts.append(truncated)
                break
            
            context_parts.append(full_segment)
            current_len += len(full_segment)

        context = "\n".join(context_parts).strip()
        
        logger.info(
            f"[Context] Built context from {len(unique_chunks)} chunks, "
            f"{current_len} chars total"
        )
        
        return context

    @staticmethod
    def extract_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Extract unique source metadata for UI rendering
        Enhanced with better deduplication and metadata
        """
        seen_files = set()
        sources = []

        for chunk in retrieved_chunks:
            # Use file path as unique identifier
            fid = chunk.get("local_path") or chunk.get("file_path") or chunk.get("file_name", "")
            
            if not fid or fid in seen_files:
                continue

            file_type = chunk.get("file_type", "document")
            file_name = chunk.get("file_name", "Unknown File")
            score = chunk.get("hybrid_score", chunk.get("score", 0))
            
            # Extract preview text
            preview_text = chunk.get("text", "")
            if len(preview_text) > 200:
                preview_text = preview_text[:200] + "..."
            
            source_entry = {
                "name": file_name,
                "file_name": file_name,
                "path": chunk.get("local_path", "Local Machine"),
                "file_path": chunk.get("local_path", "Local Machine"),
                "preview": preview_text.strip(),
                "file_type": file_type,
                "type": file_type,
                "score": round(score, 3),
                "relevance": f"{int(score * 100)}%",
                "chunk_index": chunk.get("chunk_index", 0),
            }

            # Add image-specific metadata
            if file_type == "image":
                source_entry["image_uri"] = chunk.get("local_path")
                source_entry["caption"] = chunk.get("caption", preview_text[:200])
                source_entry["thumbnail_path"] = chunk.get("local_path")
                source_entry["tags"] = chunk.get("tags", [])

            sources.append(source_entry)
            seen_files.add(fid)

        # Sort by relevance score
        sources.sort(key=lambda s: s.get("score", 0), reverse=True)
        
        logger.info(f"[Sources] Extracted {len(sources)} unique sources")
        
        return sources

    @staticmethod
    def extract_image_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract image sources specifically with enhanced metadata
        """
        seen_images = set()
        image_sources = []

        for chunk in retrieved_chunks:
            if chunk.get("file_type") != "image":
                continue

            fid = chunk.get("local_path") or chunk.get("file_path") or chunk.get("file_name", "")
            
            if not fid or fid in seen_images:
                continue

            # Extract captions
            primary_caption = chunk.get("primary_caption") or chunk.get("caption") or chunk.get("text", "")
            secondary_caption = chunk.get("secondary_caption", "")
            
            # Build preview
            preview = primary_caption[:150].strip()
            if secondary_caption:
                preview = f"{preview} | {secondary_caption[:100]}"
            
            image_entry = {
                "file_name": chunk.get("file_name", "Unknown Image"),
                "file_path": chunk.get("local_path", "Local Machine"),
                "caption": primary_caption,
                "primary_caption": primary_caption,
                "secondary_caption": secondary_caption,
                "preview": preview,
                "image_uri": chunk.get("local_path"),
                "thumbnail_path": chunk.get("local_path"),
                "tags": chunk.get("tags", []),
                "score": round(chunk.get("hybrid_score", chunk.get("score", 0)), 3),
                "relevance": f"{int(chunk.get('hybrid_score', chunk.get('score', 0)) * 100)}%",
                "type": "image",
                "model": chunk.get("model", "unknown"),
                "confidence": chunk.get("confidence", 0.0),
            }
            
            image_sources.append(image_entry)
            seen_images.add(fid)

        # Sort by relevance
        image_sources.sort(key=lambda i: i.get("score", 0), reverse=True)
        
        return image_sources

    @staticmethod
    def extract_text_chunks_for_context(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter retrieved chunks to only text-based results"""
        return [c for c in retrieved_chunks if c.get("file_type") != "image"]


# ============================================================================
# ENHANCED GROQ CLIENT (LLM Interface)
# ============================================================================

class GroqClient:
    """
    Enhanced Groq API interface with:
    - Better prompt engineering
    - Citation support
    - Error handling
    - Response validation
    """
    
    DEFAULT_MODEL = "llama-3.3-70b-versatile"
    TIMEOUT = 60.0
    MAX_CONTEXT_CHARS = 4_000
    MAX_TOKENS = 1_500
    TEMPERATURE = 0.4
    TOP_P = 0.85

    _SYSTEM_PROMPT = """\
You are Axyora — an intelligent AI assistant with deep knowledge of the user's personal data.

You have indexed and analyzed everything stored on their device: documents, photos, receipts, \
notes, conversations, and more. Your goal is to provide precise, helpful answers based ONLY \
on the context provided from their indexed files.

CRITICAL RULES:
1. Answer ONLY based on the provided context - never make up information
2. If the context doesn't contain the answer, clearly state: "I don't have this information in your indexed files"
3. Be conversational and natural - avoid robotic or overly formal language
4. When referencing sources, mention the file name naturally in your response
5. For queries about images, describe what you see based on the captions and tags
6. If information is ambiguous or uncertain, acknowledge it
7. Keep responses concise but complete - aim for 2-4 sentences unless more detail is needed
8. Use natural language, not bullet points, unless specifically asked for a list

RESPONSE STYLE:
- Direct and helpful
- Conversational tone
- Reference sources naturally (e.g., "According to your file...")
- Acknowledge limitations when data is incomplete
- Be precise with numbers, dates, and factual information

Remember: You are answering questions about THIS user's personal data. Be helpful, accurate, and respectful of their privacy."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("GROQ_API_KEY not found in environment")
        
        self.model = model or self.DEFAULT_MODEL
        self.client = Groq(api_key=self.api_key)
        self.memory = ConversationMemory()
        
        logger.info(f"[GroqClient] Initialized with model: {self.model}")

    def ask(
        self,
        query: str,
        context: str,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """
        Generate answer from query and context
        Enhanced with better prompt construction
        """
        effective_model = model or self.model
        effective_max_tokens = max_tokens or self.MAX_TOKENS

        safe_context = self._sanitize_context_for_cloud(context)
        
        # Trim context if too long
        if len(safe_context) > self.MAX_CONTEXT_CHARS:
            safe_context = safe_context[:self.MAX_CONTEXT_CHARS] + "\n... [Context truncated]"
        
        # Build enhanced prompt
        user_prompt = self._build_user_prompt(query, safe_context)
        
        try:
            logger.info(f"[GroqClient] Querying '{effective_model}' with {len(safe_context)} chars context")
            
            response = self.client.chat.completions.create(
                model=effective_model,
                messages=[
                    {"role": "system", "content": self._SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=self.TEMPERATURE,
                max_tokens=effective_max_tokens,
                top_p=self.TOP_P,
                timeout=self.TIMEOUT,
            )
            
            answer = response.choices[0].message.content.strip()
            
            # Validate response
            if not answer or len(answer) < 5:
                return "I apologize, but I couldn't generate a proper response. Please try rephrasing your question."
            
            # Store in conversation memory
            self.memory.add("user", query)
            self.memory.add("assistant", answer)
            
            logger.info(f"[GroqClient] Generated answer: {len(answer)} chars")
            
            return answer
            
        except Exception as e:
            logger.error(f"[GroqClient] Error: {e}")
            return self._error_response(str(e))

    def _build_user_prompt(self, query: str, context: str) -> str:
        """
        Build enhanced user prompt with context and query
        """
        prompt_parts = []
        
        # Add context
        if context.strip():
            prompt_parts.append("CONTEXT FROM USER'S FILES:")
            prompt_parts.append(context)
            prompt_parts.append("")  # Blank line
        
        # Add query
        prompt_parts.append("USER'S QUESTION:")
        prompt_parts.append(query)
        prompt_parts.append("")
        
        # Add instructions
        prompt_parts.append("INSTRUCTIONS:")
        prompt_parts.append(
            "Answer the user's question based ONLY on the context provided above. "
            "If the context doesn't contain enough information, say so clearly. "
            "Be conversational and helpful. Reference sources naturally when relevant."
        )
        
        return "\n".join(prompt_parts)

    def _sanitize_context_for_cloud(self, context: str) -> str:
        """Minimize and redact sensitive patterns before sending any context to Groq."""
        if not context:
            return ""

        sanitized = context

        redaction_patterns = [
            (r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[REDACTED_EMAIL]"),
            (r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b", "[REDACTED_PHONE]"),
            (r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),
            (r"\b(?:\d[ -]*?){13,19}\b", "[REDACTED_CARD]"),
            (r"\b(?:iban|account|routing|swift)\s*[:#-]?\s*[a-z0-9-]{6,}\b", "[REDACTED_ACCOUNT]"),
        ]

        for pattern, replacement in redaction_patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

        return sanitized

    def _error_response(self, error_msg: str) -> str:
        """Generate user-friendly error response"""
        if "timeout" in error_msg.lower():
            return "The request took too long to process. Please try again with a simpler query."
        elif "rate" in error_msg.lower() or "limit" in error_msg.lower():
            return "API rate limit reached. Please wait a moment and try again."
        elif "authentication" in error_msg.lower() or "api key" in error_msg.lower():
            return "There's an issue with the API configuration. Please check your GROQ_API_KEY."
        else:
            return "I encountered an error while processing your request. Please try again."

    @staticmethod
    def _offline_response(query: str) -> str:
        """Fallback response when Groq client is not configured"""
        q = query.lower()
        
        if any(k in q for k in ["photo", "image", "picture"]):
            return (
                "I found some images that might match your query. "
                "To get detailed descriptions and analysis, please configure your GROQ_API_KEY."
            )
        
        if any(k in q for k in ["receipt", "document", "pdf", "file"]):
            return (
                "I found relevant documents in your indexed files. "
                "For detailed summaries and analysis, please add your GROQ_API_KEY."
            )
        
        return (
            "I found some relevant content in your indexed files. "
            "To get natural language answers and analysis, please configure your GROQ_API_KEY."
        )


# ============================================================================
# ENHANCED QUERY ENGINE (RAG Pipeline)
# ============================================================================

class QueryEngine:
    """
    Enhanced RAG Query Engine with:
    - Hybrid search (vector + keyword)
    - Advanced re-ranking
    - Better result filtering
    - Smarter caching
    """

    def __init__(self, embedding_engine, vector_store):
        self._embed = embedding_engine
        self._vs = vector_store
        self._cb = ContextBuilder(max_chunks=MAX_CONTEXT_CHUNKS)
        self._answer_cache: dict[str, tuple[float, Dict[str, Any]]] = {}
        
        try:
            self._llm = GroqClient()
        except Exception as e:
            logger.warning(f"[QueryEngine] Groq client not available: {e}")
            self._llm = None

    def answer(
        self,
        query: str,
        user_id: str,
        top_k: int = 5,
        model: str = "llama-3.3-70b-versatile",
        include_images: bool = True,
        search_type: str = "all",  # NEW: "all" | "image" | "document"
    ) -> Dict[str, Any]:
        """
        Main RAG entry point with enhanced processing
        """
        try:
            # Normalize inputs
            query = query.strip()
            top_k = max(3, min(top_k, 20))  # Clamp to [3, 20]
            
            # Check cache
            cache_key = f"{user_id}::{model}::{top_k}::{include_images}::{search_type}::{query.lower()}"
            cached = self._answer_cache.get(cache_key)
            if cached:
                ts, payload = cached
                if time.time() - ts < QUERY_CACHE_TTL_SECONDS:
                    logger.info(f"[QueryEngine] Cache hit for query: {query[:50]}...")
                    return payload
                else:
                    self._answer_cache.pop(cache_key, None)

            # Embed query
            logger.info(f"[QueryEngine] Processing query: {query[:100]}...")
            query_vec = self._embed.embed_query(query)
            
            # Search vector store (fetch more than needed for re-ranking)
            if search_type == "image":
                raw_results = self._vs.search_by_type(
                    query_vec,
                    file_type="image",
                    top_k=top_k * 3,
                    user_id=user_id
                )
            elif search_type == "document":
                raw_results = self._vs.search_by_type(
                    query_vec,
                    file_type="document",
                    top_k=top_k * 3,
                    user_id=user_id
                )
            else:
                raw_results = self._vs.search(
                    query_vec,
                    top_k=top_k * 3,
                    user_id=user_id
                )

            if not raw_results:
                logger.info(f"[QueryEngine] No results found for user {user_id}")
                return {
                    "answer": "I don't have any indexed files that match your query. Try uploading relevant documents first.",
                    "sources": [],
                    "images": [],
                }

            # Re-rank results with strict relevance filtering
            ranked_results = self._rerank_results(query, raw_results, search_type=search_type)
            
            # Filter for only highly relevant results (using hybrid_score)
            MIN_RELEVANCE_SCORE = 0.30 if search_type == "image" else 0.70
            highly_relevant = [
                r for r in ranked_results
                if r.get("hybrid_score", 0) >= MIN_RELEVANCE_SCORE
            ]

            filtered_ranked = highly_relevant

            # Image-only fallback: if strict lexical filters produce no hits,
            # return at most one very-high-confidence semantic candidate.
            if not filtered_ranked and search_type == "image":
                semantic_fallback = sorted(
                    raw_results,
                    key=lambda r: float(r.get("score", 0.0)),
                    reverse=True,
                )
                semantic_fallback = [
                    {**r, "hybrid_score": float(r.get("score", 0.0)), "semantic_fallback": True}
                    for r in semantic_fallback
                    if float(r.get("score", 0.0)) >= 0.88
                ]
                filtered_ranked = semantic_fallback[:1]

            if not filtered_ranked:
                return {
                    "answer": "No highly relevant results found for this query.",
                    "sources": [],
                    "images": [],
                    "total_results": 0,
                    "text_results": 0,
                    "image_results": 0,
                }
            
            # Separate text and image results
            if search_type == "image":
                text_results = []
                image_results = self._cb.extract_image_sources(filtered_ranked[:top_k * 2])
            elif search_type == "document":
                text_results = self._cb.extract_text_chunks_for_context(filtered_ranked[:top_k])
                image_results = []
            else:
                text_results = self._cb.extract_text_chunks_for_context(filtered_ranked[:top_k])
                image_results = self._cb.extract_image_sources(filtered_ranked[:top_k * 2])

            # Build context from text results
            context = ""
            sources = []
            
            if text_results:
                context = self._cb.build_context(
                    text_results,
                    min_score=CONTEXT_RELEVANCE_THRESHOLD
                )
                sources = self._cb.extract_sources(text_results)

            # Generate answer
            answer = ""
            
            if context.strip() and search_type != "image":
                if self._llm is not None:
                    answer = self._llm.ask(query, context, model=model)
                else:
                    # Fallback when LLM not available
                    preview = context[:300].replace("\n", " ").strip()
                    answer = f"Based on your indexed files: {preview}..."
            else:
                # No text context but might have images
                if image_results:
                    answer = (
                        f"I found {len(image_results)} image(s) that might be relevant to your query. "
                        f"Check the image results below."
                    )
                else:
                    answer = "I couldn't find any relevant information in your indexed files for this query."

            # Build final response
            final_response = {
                "answer": answer,
                "sources": sources,
                "images": image_results if include_images and search_type != "document" else [],
                "total_results": len(filtered_ranked),
                "text_results": len(text_results),
                "image_results": len(image_results),
            }
            
            # Cache the result
            if len(self._answer_cache) >= QUERY_CACHE_MAX:
                oldest_key = min(self._answer_cache.keys(), key=lambda k: self._answer_cache[k][0])
                self._answer_cache.pop(oldest_key, None)
            
            self._answer_cache[cache_key] = (time.time(), final_response)
            
            logger.info(
                f"[QueryEngine] Completed: {len(sources)} text sources, "
                f"{len(image_results)} images (filtered from {len(raw_results)} candidates)"
            )
            
            return final_response

        except Exception as e:
            logger.error(f"[QueryEngine] Error processing query: {e}")
            return {
                "answer": "An error occurred while processing your query. Please try again.",
                "sources": [],
                "images": [],
                "error": str(e),
            }

    def search_images(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
        min_confidence: float = 0.60,
    ) -> Dict[str, Any]:
        """
        Enhanced image search with stricter relevance filtering
        """
        try:
            query = query.strip()
            top_k = max(3, min(top_k, 50))
            
            logger.info(f"[ImageSearch] Query: {query[:100]}...")
            
            # Embed query
            query_vec = self._embed.embed_query(query)
            
            # Search for images
            raw_results = self._vs.search_by_type(
                query_vec,
                file_type="image",
                top_k=top_k * 4,  # Fetch more for filtering
                user_id=user_id
            )

            if not raw_results:
                return {
                    "images": [],
                    "count": 0,
                    "query": query,
                    "message": "No images found matching your query.",
                }

            # Re-rank image results with stricter relevance
            ranked_results = self._rerank_results(query, raw_results, search_type="image")
            
            # Filter by hybrid_score (stricter relevance)
            # Use hybrid_score which includes keyword matching requirement
            IMAGES_MIN_SCORE = max(0.30, min_confidence * 0.5)
            filtered_results = [
                r for r in ranked_results
                if r.get("hybrid_score", 0) >= IMAGES_MIN_SCORE
            ]
            
            # Limit results to top_k relevant ones
            filtered_results = filtered_results[:top_k]

            if not filtered_results:
                logger.info(f"[ImageSearch] No images met relevance threshold {IMAGES_MIN_SCORE}")
                return {
                    "images": [],
                    "count": 0,
                    "query": query,
                    "message": "No highly relevant images found. Try a different search term.",
                }

            # Extract image metadata
            images = self._cb.extract_image_sources(filtered_results)
            
            # Add relevance metrics
            for img, result in zip(images, filtered_results):
                score = result.get("hybrid_score", 0)
                img["relevance_score"] = min(100, max(0, int(score * 100)))
                img["confidence_level"] = self._confidence_label(score)

            logger.info(f"[ImageSearch] Found {len(images)} relevant images (filtered from {len(raw_results)})")
            
            return {
                "images": images,
                "count": len(images),
                "query": query,
                "min_confidence": IMAGES_MIN_SCORE,
                "total_candidates": len(raw_results),
            }

        except Exception as e:
            logger.error(f"[ImageSearch] Error: {e}")
            return {
                "images": [],
                "count": 0,
                "error": str(e),
            }

    @staticmethod
    def _confidence_label(score: float) -> str:
        """Convert numeric score to human-readable confidence label"""
        if score >= 0.90:
            return "excellent"
        elif score >= 0.80:
            return "very_high"
        elif score >= 0.70:
            return "high"
        elif score >= 0.60:
            return "moderate"
        elif score >= 0.50:
            return "low"
        else:
            return "very_low"

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Tokenize text for keyword matching"""
        # Remove special chars and split
        tokens = re.split(r"[^a-zA-Z0-9]+", text.lower())
        normalized: list[str] = []
        for token in tokens:
            if len(token) <= 2 or token.isdigit():
                continue
            normalized.append(token)
            # Simple singularization for common plural forms.
            if token.endswith("es") and len(token) > 4:
                normalized.append(token[:-2])
            elif token.endswith("s") and len(token) > 3:
                normalized.append(token[:-1])
        return normalized

    def _rerank_results(self, query: str, results: list[dict], search_type: str = "all") -> list[dict]:
        """
        Stricter hybrid re-ranking with:
        - Keyword matching requirement (query terms must exist in result)
        - Vector similarity (cosine)
        - Minimum confidence threshold
        - Minimum keyword overlap threshold
        """
        if not results:
            return results
        
        query_terms = set(self._tokenize(query))
        query_lower = query.lower()

        image_term_expansions: dict[str, set[str]] = {
            "eye": {"eyes", "iris", "pupil", "eyeball", "face", "portrait", "closeup", "close-up"},
            "eyes": {"eye", "iris", "pupil", "eyeball", "face", "portrait", "closeup", "close-up"},
        }

        expanded_image_terms = set(query_terms)
        for term in list(query_terms):
            expanded_image_terms.update(image_term_expansions.get(term, set()))
        
        if not query_terms:
            # No keywords to match, return by vector score only
            return sorted(results, key=lambda r: r.get("score", 0), reverse=True)

        def hybrid_score(result: dict) -> float:
            """Calculate hybrid score for a result with stricter requirements"""
            # Base vector similarity score
            vec_score = max(0.0, min(1.0, float(result.get("score", 0.0))))
            
            # Build searchable text blob
            text_fields = [
                str(result.get("text", "")),
                str(result.get("caption", "")),
                str(result.get("file_name", "")),
                " ".join(result.get("tags", [])),
            ]
            blob = " ".join(text_fields).lower()
            
            # Keyword overlap score - STRICTER requirement
            result_terms = set(self._tokenize(blob))
            if result_terms:
                matching_terms = query_terms & result_terms
                overlap_score = len(matching_terms) / len(query_terms)
            else:
                overlap_score = 0.0
            
            # Exact phrase match (strong signal)
            phrase_match = 1.0 if query_lower in blob else 0.0

            effective_type = search_type
            if effective_type == "all":
                effective_type = "image" if result.get("file_type") == "image" else "document"

            if effective_type == "image":
                caption_blob = " ".join(
                    [
                        str(result.get("text", "")),
                        str(result.get("caption", "")),
                        str(result.get("primary_caption", "")),
                        " ".join(result.get("tags", [])),
                    ]
                ).lower()

                caption_terms = set(self._tokenize(caption_blob))
                caption_overlap = 1.0 if (expanded_image_terms & caption_terms) else 0.0
                substring_overlap = 1.0 if any(
                    re.search(rf"\\b{re.escape(term)}\\b", caption_blob)
                    for term in expanded_image_terms
                ) else 0.0

                objects = result.get("objects", [])
                object_terms: set[str] = set()
                object_confidence = 0.0

                for obj in objects:
                    if isinstance(obj, dict):
                        label = str(obj.get("label") or obj.get("name") or obj.get("class") or "").lower()
                        conf = float(obj.get("confidence", 0.0) or 0.0)
                        object_terms.update(self._tokenize(label))
                        if expanded_image_terms & set(self._tokenize(label)):
                            object_confidence = max(object_confidence, conf)
                    else:
                        label = str(obj).lower()
                        object_terms.update(self._tokenize(label))
                        if expanded_image_terms & set(self._tokenize(label)):
                            object_confidence = max(object_confidence, 0.75)

                for tag in result.get("tags", []):
                    tag_tokens = set(self._tokenize(str(tag)))
                    object_terms.update(tag_tokens)
                    if expanded_image_terms & tag_tokens:
                        object_confidence = max(object_confidence, 0.70)

                object_overlap = 1.0 if (expanded_image_terms & object_terms) else 0.0

                # For image mode, keep a semantic fallback path using vector score
                # even when lexical/object terms do not directly overlap.
                if caption_overlap <= 0.0 and substring_overlap <= 0.0 and object_overlap <= 0.0 and phrase_match == 0.0:
                    return vec_score * 0.20

                ocr_blob = str(result.get("ocr_text", "")).lower()
                ocr_terms = set(self._tokenize(ocr_blob))
                ocr_overlap = 1.0 if (expanded_image_terms & ocr_terms) else 0.0

                caption_score = max(caption_overlap, substring_overlap, phrase_match)
                object_score = max(object_confidence, object_overlap)

                return (
                    0.40 * caption_score +
                    0.30 * object_score +
                    0.10 * ocr_overlap +
                    0.20 * vec_score
                )
            
            # Mandatory hard filter for document search
            if overlap_score <= 0.0 and phrase_match == 0.0:
                return 0.0

            lexical_score = max(overlap_score, phrase_match)
            return (0.60 * vec_score) + (0.40 * lexical_score)

        # Score and sort
        scored_results = []
        MINIMUM_SCORE_THRESHOLD = 0.30 if search_type == "image" else 0.70
        
        for r in results:
            score = hybrid_score(r)
            if score < MINIMUM_SCORE_THRESHOLD:
                continue  # SKIP results below threshold
                
            enriched = {
                **r,
                "hybrid_score": score,
                "original_score": r.get("score", 0),
            }
            scored_results.append(enriched)

        scored_results.sort(key=lambda r: r.get("hybrid_score", 0.0), reverse=True)
        
        top_score_msg = f"{scored_results[0].get('hybrid_score', 0):.3f}" if scored_results else "N/A"
        logger.info(
            f"[Rerank] Filtered {len(results)} results -> {len(scored_results)} relevant results, "
            f"top score: {top_score_msg}"
        )
        
        return scored_results