"""
context_builder.py - RAG Context Preparation Layer
Constructs optimized, ranked, and deduplicated context prompts from retrieved vectors.
Ensures context fits within LLM token constraints.
"""

from __future__ import annotations
from typing import List, Dict, Any

class ContextBuilder:
    """
    Orchestrates the assembly of retrieved information for LLM reasoning.
    Handles partitioning, ranking, and deduplication of source materials.
    """

    def __init__(self, max_chars: int = 12000): # ~3k tokens (conservative for 8k window)
        self.max_chars = max_chars

    def build_context(self, retrieved_chunks: List[Dict[str, Any]]) -> str:
        """
        Takes a list of search results and returns a formatted context string.
        Each chunk: { text, file_name, local_path, score, chunk_index, ... }
        """
        if not retrieved_chunks:
            return ""

        # 1. Deduplication (Sometimes very similar chunks or overlap chunks are returned)
        seen_texts = set()
        unique_chunks = []
        
        for chunk in retrieved_chunks:
            text = chunk.get("text", "").strip()
            # Basic deduplication for redundant chunks
            # In a real system, we'd use embedding similarity but exact match is a good proxy for retrieval noise
            if text and text not in seen_texts:
                unique_chunks.append(chunk)
                seen_texts.add(text)

        # 2. Re-ranking (Sort by higher score = better match)
        unique_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)

        # 3. Assemble context with clear headers for source identification
        context_parts = []
        current_len = 0
        
        for i, chunk in enumerate(unique_chunks):
            fname = chunk.get("file_name", "Unknown Document")
            text_snippet = chunk.get("text", "").strip()
            
            # Format: [Source 1]: document.pdf
            # Content...
            source_header = f"[Source {i+1}]: {fname}"
            snippet_formatted = f"\n{text_snippet}\n"
            full_segment = f"{source_header}{snippet_formatted}\n---\n"
            
            # 4. Check length constraints
            if current_len + len(full_segment) > self.max_chars:
                # If we're at the very first chunk and it's HUGE, truncate it
                if not context_parts:
                    context_parts.append(full_segment[:self.max_chars] + "... [Truncated]")
                break
            
            context_parts.append(full_segment)
            current_len += len(full_segment)

        return "\n".join(context_parts).strip()

    @staticmethod
    def extract_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """
        Extract unique source metadata for UI rendering.
        Each result: { file_name, file_path, preview, type }
        Handles both text and image sources.
        """
        seen_files = set()
        sources = []

        # Keep same order (highest score first)
        for chunk in retrieved_chunks:
            # use path or name as unique key
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

                # Image-specific fields
                if file_type == "image":
                    source_entry["image_uri"] = chunk.get("local_path")
                    source_entry["caption"] = chunk.get("text", "")[:200]
                    source_entry["thumbnail_path"] = chunk.get("local_path")

                sources.append(source_entry)
                seen_files.add(fid)

        return sources

    @staticmethod
    def extract_image_sources(retrieved_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract image sources specifically.
        Returns metadata optimized for image display in UI.
        """
        seen_images = set()
        image_sources = []

        for chunk in retrieved_chunks:
            if chunk.get("file_type") != "image":
                continue

            fid = chunk.get("local_path") or chunk.get("file_name", "")
            if fid and fid not in seen_images:
                image_sources.append(
                    {
                        "file_name": chunk.get("file_name", "Unknown Image"),
                        "file_path": chunk.get("local_path", "Local Machine"),
                        "caption": chunk.get("text", ""),
                        "preview": chunk.get("text", "")[:200].strip(),
                        "image_uri": chunk.get("local_path"),
                        "thumbnail_path": chunk.get("local_path"),
                        "score": chunk.get("score", 0),
                        "type": "image",
                    }
                )
                seen_images.add(fid)

        return image_sources

    @staticmethod
    def extract_text_chunks_for_context(
        retrieved_chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Filter retrieved chunks to only text-based results for LLM context.
        Excludes image chunks since they don't contribute text context for reasoning.
        """
        return [c for c in retrieved_chunks if c.get("file_type") != "image"]
