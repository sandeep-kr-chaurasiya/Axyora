"""
chunker.py - Semantic and Recursive Text Partitioning
Splits long extracted text into optimized segments for vector search.
Ensures overlap and metadata preservation for high-quality RAG.
"""

from __future__ import annotations
import re
from typing import List, Dict, Any

# Recommended limits for local BGE-small embeddings
CHUNK_SIZE_CHARS = 1600  # ~400 tokens
CHUNK_OVERLAP_CHARS = 256 # ~60 tokens

class Chunker:
    """
    Handles dividing text into semantic chunks with overlap.
    Includes normalization and boundary detection.
    """

    @staticmethod
    def chunk_text(text: str, file_path: str, chunk_size=CHUNK_SIZE_CHARS, overlap=CHUNK_OVERLAP_CHARS) -> List[Dict[str, Any]]:
        """
        Divide input text into segments.
        Returns: list of { text, chunk_index, char_start, char_end, file_path }
        """
        # 1. Normalize whitespace (remove redundant newlines/tabs)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            return []

        chunks = []
        start = 0
        idx = 0
        text_len = len(text)

        while start < text_len:
            # Calculate preliminary end point
            end = min(start + chunk_size, text_len)

            # 2. Try to find a natural boundary (sentence end or paragraph)
            # We look backwards from the end of the chunk to find a period or newline.
            if end < text_len:
                # Look for the last sentence boundary in the chunk window
                boundary = text.rfind(".", start + (overlap // 2), end)
                if boundary != -1:
                    end = boundary + 1
                else:
                    # Fallback to last space if no period found
                    last_space = text.rfind(" ", start + (overlap // 2), end)
                    if last_space != -1:
                        end = last_space

            chunk_text = text[start:end].strip()
            
            # 3. Only add non-empty chunks
            if len(chunk_text) > 5:  # Ignore tiny noise chunks
                chunks.append({
                    "text": chunk_text,
                    "chunk_index": idx,
                    "char_start": start,
                    "char_end": end,
                    "file_path": file_path
                })
                idx += 1

            # 4. Advance window with overlap
            # Ensure we actually move forward (prevent infinite loops)
            next_start = end - overlap
            if next_start <= start:
                start = end # No overlap if chunk is smaller than overlap
            else:
                start = next_start
            
            # Break if we've reached the end
            if start >= text_len - 1:
                break

        return chunks

    @staticmethod
    def summarize_chunks(chunks: List[Dict]) -> str:
        """Utility to get a brief summary of what was chunked."""
        if not chunks:
            return "No content to chunk."
        return f"Split into {len(chunks)} chunks across {chunks[0]['file_path']}"
