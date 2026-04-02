"""
rag.py - Consolidated RAG Engine
Combines: QueryEngine, ContextBuilder, GroqClient, ConversationMemory
"""

from __future__ import annotations

import os
import time
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from production_config import QUERY_CACHE_TTL_SECONDS, QUERY_CACHE_MAX
from groq import Groq

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

# ============================================================================
# CONVERSATION MEMORY
# ============================================================================

class ConversationMemory:
    """Maintains a rolling window of conversation turns"""
    
    MAX_TURNS = 12
    MAX_CHARS = 6_000

    def __init__(self):
        self._turns: List[Dict[str, str]] = []
        self._user_profile: Dict[str, Any] = {}

    def add(self, role: str, content: str) -> None:
        self._turns.append({"role": role, "content": content})
        if len(self._turns) > self.MAX_TURNS * 2:
            self._turns = self._turns[2:]

    def get_history(self) -> List[Dict[str, str]]:
        """Return history trimmed to MAX_CHARS"""
        history = list(self._turns)
        total = sum(len(m["content"]) for m in history)
        while total > self.MAX_CHARS and len(history) > 2:
            removed = history.pop(0)
            total -= len(removed["content"])
        return history

    def update_profile(self, key: str, value: Any) -> None:
        self._user_profile[key] = value

    def get_profile_summary(self) -> str:
        if not self._user_profile:
            return ""
        lines = [f"- {k}: {v}" for k, v in self._user_profile.items()]
        return "Known facts about this user:\n" + "\n".join(lines)

    def clear(self) -> None:
        self._turns.clear()
        self._user_profile.clear()

    @property
    def turn_count(self) -> int:
        return len(self._turns) // 2


# ============================================================================
# CONTEXT BUILDER
# ============================================================================

class ContextBuilder:
    """Constructs optimized context prompts from retrieved vectors"""

    def __init__(self, max_chars: int = 12000, max_chunks: int = 5):
        self.max_chars = max_chars
        self.max_chunks = max_chunks

    def build_context(self, retrieved_chunks: List[Dict[str, Any]]) -> str:
        """Build formatted context string from search results"""
        if not retrieved_chunks:
            return ""

        seen_texts = set()
        unique_chunks = []
        
        for chunk in retrieved_chunks:
            text = chunk.get("text", "").strip()
            if text and text not in seen_texts:
                unique_chunks.append(chunk)
                seen_texts.add(text)

        unique_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
        unique_chunks = unique_chunks[:self.max_chunks]

        context_parts = []
        current_len = 0
        
        for i, chunk in enumerate(unique_chunks):
            fname = chunk.get("file_name", "Unknown Document")
            text_snippet = chunk.get("text", "").strip()
            
            source_header = f"[Source {i+1}]: {fname}"
            snippet_formatted = f"\n{text_snippet}\n"
            full_segment = f"{source_header}{snippet_formatted}\n---\n"
            
            if current_len + len(full_segment) > self.max_chars:
                if not context_parts:
                    context_parts.append(full_segment[:self.max_chars] + "... [Truncated]")
                break
            
            context_parts.append(full_segment)
            current_len += len(full_segment)

        return "\n".join(context_parts).strip()

    @staticmethod
    def extract_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Extract unique source metadata for UI rendering"""
        seen_files = set()
        sources = []

        for chunk in retrieved_chunks:
            fid = chunk.get("local_path") or chunk.get("file_name", "")
            file_type = chunk.get("file_type", "doc")

            if fid and fid not in seen_files:
                source_entry = {
                    "name": chunk.get("file_name", "Unknown File"),
                    "file_name": chunk.get("file_name", "Unknown File"),
                    "path": chunk.get("local_path", "Local Machine"),
                    "file_path": chunk.get("local_path", "Local Machine"),
                    "preview": chunk.get("text", "")[:150].strip() + "...",
                    "file_type": file_type,
                    "type": file_type,
                    "score": chunk.get("score", 0),
                    "chunk_index": chunk.get("chunk_index", 0),
                }

                if file_type == "image":
                    source_entry["image_uri"] = chunk.get("local_path")
                    source_entry["caption"] = chunk.get("text", "")[:200]
                    source_entry["thumbnail_path"] = chunk.get("local_path")

                sources.append(source_entry)
                seen_files.add(fid)

        return sources

    @staticmethod
    def extract_image_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract image sources specifically"""
        seen_images = set()
        image_sources = []

        for chunk in retrieved_chunks:
            if chunk.get("file_type") != "image":
                continue

            fid = chunk.get("local_path") or chunk.get("file_name", "")
            if fid and fid not in seen_images:
                full_caption = chunk.get("primary_caption") or chunk.get("text", "")
                secondary_caption = chunk.get("secondary_caption", "")
                
                preview = full_caption[:150].strip()
                if secondary_caption:
                    preview = f"{preview} | {secondary_caption[:100]}"
                
                image_entry = {
                    "file_name": chunk.get("file_name", "Unknown Image"),
                    "file_path": chunk.get("local_path", "Local Machine"),
                    "caption": full_caption,
                    "primary_caption": full_caption,
                    "secondary_caption": secondary_caption,
                    "preview": preview,
                    "image_uri": chunk.get("local_path"),
                    "thumbnail_path": chunk.get("local_path"),
                    "tags": chunk.get("tags", []),
                    "score": chunk.get("score", 0),
                    "type": "image",
                }
                
                image_sources.append(image_entry)
                seen_images.add(fid)

        return image_sources

    @staticmethod
    def extract_text_chunks_for_context(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter retrieved chunks to only text-based results"""
        return [c for c in retrieved_chunks if c.get("file_type") != "image"]


# ============================================================================
# GROQ CLIENT (LLM Interface)
# ============================================================================

class GroqClient:
    """Interfaces with Groq API for LLM reasoning"""
    
    DEFAULT_MODEL = "llama-3.3-70b-versatile"
    TIMEOUT = 45.0
    MAX_CONTEXT_CHARS = 10_000
    MAX_TOKENS = 1_200
    TEMPERATURE = 0.55
    TOP_P = 0.92

    _SYSTEM_PROMPT = """\
You are Axyora — a deeply personal AI assistant who has indexed and \
deeply understands everything about this user: their photos, documents, \
receipts, notes, conversations, and daily life stored on their device.

You are NOT a generic assistant. You are their private memory — warm, \
perceptive, and genuinely knowledgeable about their life. Think of \
yourself as a brilliant friend who has read every file they own and \
remembers everything.

════════════════════════════════════════════
PERSONALITY & TONE
════════════════════════════════════════════
• Warm, conversational, and natural — never robotic or listy
• Speak like a close friend who happens to know all their data
• Use first-person: "I found…", "I remember seeing…", "I noticed…"
• Vary your openers — never start two replies with the same phrase
• Add light personality: brief observations, gentle curiosity, warmth
• Keep responses concise but rich — no bullet-point dumps
• Use contractions naturally (you've, I've, let's, they're)
• Mirror the user's energy: casual if they're casual, precise if technical

════════════════════════════════════════════
MEMORY & CONTEXT RULES
════════════════════════════════════════════
• ONLY answer from the provided context — never hallucinate files or facts
• Reference specific file names, dates, and details when available
• When images are found: describe what they show, when they're from, and
  why they match — don't just list filenames
• When documents are found: summarize the key relevant content naturally
• Treat conversation history as real memory — reference prior turns
• If context is empty or unhelpful: be honest but warm

════════════════════════════════════════════
ACCURACY RULES (non-negotiable)
════════════════════════════════════════════
• Match user intent exactly — if they ask for "happy moments", return happy
• For YES/NO questions: say YES only if context confirms it
• Never contradict or invert what the context clearly shows
• For type-specific queries (photos / docs / videos): return only that type
• For time-specific queries: respect the timeframe
• If unsure: say so honestly rather than guessing

════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════
• Lead with the answer, not a preamble
• For single results: one rich, natural sentence or two
• For multiple results: flowing prose, not bullet points
• End with a natural follow-up when it makes sense
• Never use markdown headers, asterisks, or numbered lists
• Keep responses under ~150 words unless the user asks for detail
"""

    def __init__(self, model: str = DEFAULT_MODEL):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key) if self.api_key else None
        self.model = model
        self.memory = ConversationMemory()

        if self.client is None:
            pass
        else:
            pass

    def ask(
        self,
        query: str,
        context: str,
        timeout: Optional[float] = None,
        result_count: int = 0,
        result_types: Optional[List[str]] = None,
    ) -> str:
        """Send a context-augmented query to Groq"""
        if not self.client:
            return self._offline_response(query)

        enriched_context = self._enrich_context(context, result_count, result_types or [])

        if len(enriched_context) > self.MAX_CONTEXT_CHARS:
            enriched_context = enriched_context[:self.MAX_CONTEXT_CHARS] + "\n… [context truncated]"

        messages = self._build_messages(query, enriched_context)

        effective_timeout = timeout or self.TIMEOUT
        try:
            start = time.time()
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.TEMPERATURE,
                max_tokens=self.MAX_TOKENS,
                top_p=self.TOP_P,
                timeout=effective_timeout,
                stream=False,
            )

            answer = completion.choices[0].message.content.strip()
            duration = time.time() - start

            answer = self._post_process(query, answer)
            self.memory.add("user", query)
            self.memory.add("assistant", answer)
            self._infer_user_profile(query, answer)

            return answer

        except TimeoutError:
            return "That took a bit too long on my end — want to try a slightly simpler search?"
        except Exception as e:
            return "I'm having a moment — the reasoning engine is briefly unavailable. Try again in a second?"

    def clear_memory(self) -> None:
        """Reset conversation history"""
        self.memory.clear()

    def _build_messages(self, query: str, context: str) -> List[Dict[str, str]]:
        """Assemble full message list"""
        profile_snippet = self.memory.get_profile_summary()
        system_content = self._SYSTEM_PROMPT
        if profile_snippet:
            system_content += f"\n\n{profile_snippet}"

        now = datetime.now()
        system_content += (
            f"\n\nCurrent date/time: {now.strftime('%A, %B %-d %Y, %-I:%M %p')}. "
            f"Use this when the user asks about 'today', 'recent', 'this week', etc."
        )

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_content}
        ]

        messages.extend(self.memory.get_history())

        user_content = (
            f"[Retrieved from my local files]\n{context}\n\n"
            f"[My message] {query}"
        )
        messages.append({"role": "user", "content": user_content})

        return messages

    @staticmethod
    def _enrich_context(context: str, result_count: int, result_types: List[str]) -> str:
        """Prepend metadata about search results"""
        if not context:
            return ""

        lines = ["[Search result metadata]"]
        if result_count:
            lines.append(f"Total results found: {result_count}")
        if result_types:
            type_summary = GroqClient._summarise_types(result_types)
            lines.append(f"Result types: {type_summary}")
        lines.append("")
        lines.append("[File content chunks]")
        lines.append(context)
        return "\n".join(lines)

    @staticmethod
    def _summarise_types(types: List[str]) -> str:
        """Convert MIME types into human-readable summary"""
        counts: Dict[str, int] = {}
        for t in types:
            if "image" in t:
                counts["photos"] = counts.get("photos", 0) + 1
            elif "video" in t:
                counts["videos"] = counts.get("videos", 0) + 1
            elif "pdf" in t or "document" in t or "text" in t:
                counts["documents"] = counts.get("documents", 0) + 1
            else:
                counts["other files"] = counts.get("other files", 0) + 1
        return ", ".join(f"{v} {k}" for k, v in counts.items())

    def _post_process(self, query: str, response: str) -> str:
        """Light post-processing of response"""
        response = re.sub(r"\*{1,2}(.+?)\*{1,2}", r"\1", response)
        response = re.sub(r"^#{1,3}\s+", "", response, flags=re.MULTILINE)
        response = re.sub(r"^\s*[-•]\s+", "", response, flags=re.MULTILINE)
        response = re.sub(r"\n{3,}", "\n\n", response).strip()

        hollow = ["certainly!", "of course!", "absolutely!", "great question", "sure thing"]
        if any(response.lower().startswith(h) for h in hollow):
            pass

        self._check_inversion(query, response)
        return response

    def _check_inversion(self, query: str, response: str) -> None:
        """Log warning if response contradicts query"""
        q = query.lower()
        r = response.lower()

        negative_phrases = ["couldn't find", "no results", "nothing", "i don't have", "not found"]
        is_no_result = any(p in r for p in negative_phrases)

        seeking_keywords = ["show", "find", "search", "look for", "get", "fetch", "display"]
        is_seeking = any(k in q for k in seeking_keywords)

        if is_seeking and is_no_result:
            pass

    def _infer_user_profile(self, query: str, response: str) -> None:
        """Passively infer facts about the user"""
        q = query.lower()
        family_hints = {
            "wife": "has a wife", "husband": "has a husband",
            "kids": "has children", "daughter": "has a daughter",
            "son": "has a son", "mom": "has a mother in photos",
            "dad": "has a father in photos",
        }
        for keyword, fact in family_hints.items():
            if keyword in q and fact not in self.memory._user_profile.values():
                self.memory.update_profile(f"family_{keyword}", fact)

    @staticmethod
    def _offline_response(query: str) -> str:
        """Fallback when Groq client is not configured"""
        q = query.lower()
        if any(k in q for k in ["photo", "image", "picture"]):
            return (
                "I can see you're looking for photos — my local search found "
                "some matches. Cloud reasoning isn't set up yet, so I can't "
                "describe them in detail, but the results above show what I found."
            )
        if any(k in q for k in ["receipt", "document", "pdf", "file"]):
            return (
                "I found some documents that match your search locally. "
                "To get a full summary and analysis, add a GROQ_API_KEY to enable "
                "cloud reasoning."
            )
        return (
            "I found relevant entries in your local memory. "
            "Cloud reasoning isn't configured yet — add your GROQ_API_KEY "
            "to get natural, detailed answers."
        )


# ============================================================================
# QUERY ENGINE (RAG Pipeline)
# ============================================================================

class QueryEngine:
    """RAG Query Engine powered by Groq API"""

    def __init__(self, embedding_engine, vector_store):
        self._embed = embedding_engine
        self._vs = vector_store
        self._cb = ContextBuilder(max_chunks=5)
        self._answer_cache: dict[str, tuple[float, Dict[str, Any]]] = {}
        try:
            self._llm = GroqClient()
        except Exception as e:
            self._llm = None

    def answer(
        self,
        query: str,
        user_id: str,
        top_k: int = 5,
        model: str = "llama-3.3-70b-versatile",
        include_images: bool = True,
    ) -> Dict[str, Any]:
        """Main RAG entry point"""
        try:
            cache_key = f"{user_id}::{model}::{top_k}::{include_images}::{query.strip().lower()}"
            cached = self._answer_cache.get(cache_key)
            if cached:
                ts, payload = cached
                if time.time() - ts < QUERY_CACHE_TTL_SECONDS:
                    return payload
                else:
                    self._answer_cache.pop(cache_key, None)

            
            query_vec = self._embed.embed_query(query)
            results = self._vs.search(query_vec, top_k=top_k * 2, user_id=user_id)


            if not results:
                return {
                    "answer": "I have no memory of this topic in your indexed files.",
                    "sources": [],
                    "images": [],
                }

            results = self._rerank_results(query, results)
            text_results = self._cb.extract_text_chunks_for_context(results)
            image_results = self._cb.extract_image_sources(results)

            context = self._cb.build_context(text_results) if text_results else ""
            sources = self._cb.extract_sources(text_results) if text_results else []

            answer = ""
            if context.strip():
                if self._llm is not None:
                    answer = self._llm.ask(query, context)
                else:
                    preview = context[:220].replace("\n", " ").strip()
                    answer = f"Local answer from indexed memory: {preview}"
            else:
                if image_results:
                    answer = f"I found {len(image_results)} image(s) related to your query."
                else:
                    answer = "I have no memory of this topic in your indexed files."

            final_response = {
                "answer": answer,
                "sources": sources,
                "images": image_results if include_images else [],
            }
            
            if len(self._answer_cache) >= QUERY_CACHE_MAX:
                oldest_key = min(self._answer_cache.keys(), key=lambda k: self._answer_cache[k][0])
                self._answer_cache.pop(oldest_key, None)
            self._answer_cache[cache_key] = (time.time(), final_response)
            return final_response

        except Exception as e:
            return {"answer": "The reasoning engine encountered an error. Please try again.", "sources": [], "images": []}

    def search_images(
        self,
        query: str,
        user_id: str,
        top_k: int = 10,
        min_confidence: float = 0.60,
    ) -> Dict[str, Any]:
        """Search for images based on natural language query"""
        try:
            query_vec = self._embed.embed_query(query)
            raw_results = self._vs.search_by_type(
                query_vec, file_type="image", top_k=top_k * 3, user_id=user_id
            )

            if not raw_results:
                return {"images": [], "count": 0}

            filtered_results = [r for r in raw_results if r.get("score", 0) >= min_confidence]
            
            if len(filtered_results) < 3 and raw_results:
                filtered_results = raw_results[:top_k]
            else:
                filtered_results = filtered_results[:top_k]

            images = self._cb.extract_image_sources(filtered_results)
            
            for img in images:
                score = img.get("score", 0)
                img["relevance_score"] = min(100, max(0, int(score * 100)))
                img["confidence_level"] = self._confidence_label(score)

            return {
                "images": images,
                "count": len(images),
                "query": query,
                "min_confidence": min_confidence,
            }

        except Exception as e:
            return {"images": [], "count": 0, "error": str(e)}

    @staticmethod
    def _confidence_label(score: float) -> str:
        """Convert numeric score to human-readable confidence label"""
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

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return [t for t in re.split(r"[^a-zA-Z0-9]+", text.lower()) if len(t) > 2]

    def _rerank_results(self, query: str, results: list[dict]) -> list[dict]:
        """Lightweight hybrid scoring: vector score + keyword overlap"""
        if not results:
            return results
        query_terms = set(self._tokenize(query))
        if not query_terms:
            return results

        def keyword_score(result: dict) -> float:
            blob = " ".join([
                str(result.get("text", "")),
                str(result.get("caption", "")),
                str(result.get("file_name", "")),
                str(result.get("local_path", "")),
            ])
            tokens = set(self._tokenize(blob))
            if not tokens:
                return 0.0
            overlap = len(tokens & query_terms)
            return overlap / max(len(query_terms), 1)

        scored: list[dict] = []
        for r in results:
            base = float(r.get("score", 0.0))
            kw = keyword_score(r)
            hybrid = (0.75 * base) + (0.25 * kw)
            enriched = {**r, "hybrid_score": hybrid, "keyword_score": kw}
            scored.append(enriched)

        scored.sort(key=lambda r: r.get("hybrid_score", 0.0), reverse=True)
        return scored
