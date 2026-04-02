"""
processing.py - Consolidated File Processing Pipeline
Combines: Chunker, File Type Detection, Text Extraction, Embeddings, Image Captioning
"""

from __future__ import annotations

import io
import os
import re
import tempfile
import torch
import gc
from pathlib import Path
from typing import Literal, List, Dict, Any, Optional, Tuple
from collections import OrderedDict
import numpy as np
from production_config import (
    EMBEDDING_MODEL,
    EMBED_BATCH_SIZE,
    EMBED_QUERY_CACHE_MAX,
    EMBED_TEXT_CACHE_MAX,
    CAPTIONING_MODEL,
    IMAGE_MAX_DIM,
    IMAGE_CAPTION_MAX_NEW_TOKENS,
)

FileType = Literal["pdf", "docx", "txt", "image", "audio", "unknown"]
CHUNK_SIZE_CHARS = 1600  # ~400 tokens
CHUNK_OVERLAP_CHARS = 256  # ~60 tokens

# ============================================================================
# CHUNKER - Text Segmentation
# ============================================================================

class Chunker:
    """Semantic and Recursive Text Partitioning"""

    @staticmethod
    def chunk_text(
        text: str,
        file_path: str,
        chunk_size=CHUNK_SIZE_CHARS,
        overlap=CHUNK_OVERLAP_CHARS,
    ) -> List[Dict[str, Any]]:
        """Divide input text into semantic chunks with overlap"""
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            return []

        chunks = []
        start = 0
        idx = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + chunk_size, text_len)

            if end < text_len:
                boundary = text.rfind(".", start + (overlap // 2), end)
                if boundary != -1:
                    end = boundary + 1
                else:
                    last_space = text.rfind(" ", start + (overlap // 2), end)
                    if last_space != -1:
                        end = last_space

            chunk_text = text[start:end].strip()

            if len(chunk_text) > 5:
                chunks.append({
                    "text": chunk_text,
                    "chunk_index": idx,
                    "char_start": start,
                    "char_end": end,
                    "file_path": file_path,
                })
                idx += 1

            next_start = end - overlap
            if next_start <= start:
                start = end
            else:
                start = next_start

            if start >= text_len - 1:
                break

        return chunks

    @staticmethod
    def summarize_chunks(chunks: List[Dict]) -> str:
        """Utility to get a brief summary of what was chunked"""
        if not chunks:
            return "No content to chunk."
        return f"Split into {len(chunks)} chunks across {chunks[0]['file_path']}"


# ============================================================================
# FILE TYPE DETECTION
# ============================================================================

def detect_file_type(filename: str, content: bytes = b"") -> FileType:
    """Detect file type from extension and magic bytes"""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in (".docx", ".doc"):
        return "docx"
    if ext == ".txt":
        return "txt"
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".heic"):
        return "image"
    if ext in (".mp3", ".m4a", ".wav", ".ogg", ".flac", ".opus"):
        return "audio"
    # Fallback: sniff magic bytes
    if content[:4] == b"%PDF":
        return "pdf"
    if content[:2] in (b"\xff\xfb", b"ID3"):
        return "audio"
    return "unknown"


# ============================================================================
# TEXT EXTRACTION
# ============================================================================

def _extract_pdf(data: bytes) -> str:
    """Extract text from PDF using pypdf"""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text.strip())
        return "\n\n".join(parts)
    except Exception as e:
        return f"[PDF extraction failed: {str(e)}]"


def _extract_docx(data: bytes, filename: str) -> str:
    """Extract text from DOC/DOCX using Tika or python-docx"""
    suffix = Path(filename).suffix.lower() or ".docx"
    tika_available = False
    try:
        from tika import parser as tika_parser
        tika_available = True
    except Exception:
        tika_parser = None

    if tika_available and tika_parser is not None:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        try:
            parsed = tika_parser.from_file(tmp_path)
            content = (parsed or {}).get("content") or ""
            if content.strip():
                return content.strip()
        except Exception:
            pass
        finally:
            os.unlink(tmp_path)

    if suffix == ".doc":
        return f"[DOC file: {filename}. Extraction failed - missing Tika/Java]"

    try:
        import docx
        doc = docx.Document(io.BytesIO(data))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as e:
        return f"[DOCX extraction failed: {str(e)}]"


def _extract_txt(data: bytes) -> str:
    """Decode plain text file with proper encoding detection"""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _extract_audio_whisper(data: bytes, filename: str) -> str:
    """Transcribe audio using OpenAI Whisper"""
    try:
        import whisper
    except Exception as exc:
        return f"[Audio transcription engine missing: {str(exc)}]"

    suffix = Path(filename).suffix or ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        model = whisper.load_model("base")
        result = model.transcribe(tmp_path, fp16=False)
        return result.get("text", "").strip() or f"[Audio: {filename}. No speech detected]"
    except Exception as e:
        return f"[Audio: {filename}. Transcription error: {str(e)}]"
    finally:
        os.unlink(tmp_path)


# ============================================================================
# IMAGE CAPTIONING
# ============================================================================

_captioner_instance = None

def get_captioner():
    """Get or create ImageCaptioner singleton"""
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = ImageCaptioner()
    return _captioner_instance


class ImageCaptioner:
    """Semantic image understanding using BLIP model"""
    
    def __init__(self, model_id=CAPTIONING_MODEL):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # BLIP on Apple MPS can hang on some HEIC/image workloads. Keep CPU as default
        # unless explicitly opted in via AXYORA_ENABLE_MPS=1.
        if os.getenv("AXYORA_ENABLE_MPS", "0") == "1" and torch.backends.mps.is_available():
            self.device = "mps"
        
        from transformers import BlipProcessor, BlipForConditionalGeneration
        self.processor = BlipProcessor.from_pretrained(model_id)
        self.model = BlipForConditionalGeneration.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.model_id = model_id

    def generate_caption(self, image_bytes: bytes, filename: str) -> dict:
        """Generate rich semantic caption and tags for an image"""
        try:
            if filename.lower().endswith(".heic"):
                try:
                    from pillow_heif import register_heif_opener
                    register_heif_opener()
                except Exception:
                    pass

            from PIL import Image
            image = Image.open(io.BytesIO(image_bytes))
            if image.mode != "RGB":
                image = image.convert("RGB")

            if max(image.width, image.height) > IMAGE_MAX_DIM:
                ratio = IMAGE_MAX_DIM / max(image.width, image.height)
                image = image.resize(
                    (int(image.width * ratio), int(image.height * ratio)),
                    Image.Resampling.LANCZOS,
                )

            inputs = self.processor(image, return_tensors="pt").to(self.device)

            with torch.inference_mode():
                out = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=4,
                    do_sample=False,
                    temperature=0.5,
                )
                caption = self.processor.decode(out[0], skip_special_tokens=True)
                
                out_alt = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=3,
                    do_sample=True,
                    temperature=0.8,
                )
                caption_alt = self.processor.decode(out_alt[0], skip_special_tokens=True)

            tags = self._extract_semantic_tags(caption)
            tags_alt = self._extract_semantic_tags(caption_alt)
            all_tags = list(dict.fromkeys(tags + tags_alt))[:20]
            combined_caption = f"{caption} Additionally, {caption_alt.lower()}"

            return {
                "caption": combined_caption,
                "primary_caption": caption,
                "secondary_caption": caption_alt,
                "tags": all_tags,
                "model": self.model_id,
                "confidence": 0.94,
                "filename": filename,
                "type": "image",
            }

        except Exception as e:
            raise e

    def _extract_semantic_tags(self, caption: str) -> list:
        """Extract meaningful semantic tags from caption"""
        common_stopwords = {
            "a", "an", "the", "of", "in", "with", "on", "at", "by", "is", "are",
            "this", "that", "it", "to", "and", "or", "but", "for", "from", "as",
            "be", "been", "have", "has", "was", "were", "did", "do", "can", "could",
            "would", "should", "may", "might", "must", "will", "shall", "there",
            "which", "who", "whom", "what", "when", "where", "why", "how", "also",
            "some", "any", "all", "each", "every", "both", "either", "neither",
            "very", "more", "most", "less", "least", "much", "many", "few", "several",
            "just", "only", "so", "such", "no", "not", "up", "down", "out", "over",
            "under", "above", "below", "through", "between", "during", "before", "after",
        }
        
        weak_adjectives = {
            "good", "bad", "small", "large", "big", "little", "new", "old",
            "nice", "fine", "different", "same", "clear", "dark", "light",
            "blue", "red", "green", "yellow", "white", "black", "color",
        }

        words = caption.lower().split()
        tags = []
        i = 0
        while i < len(words):
            word = words[i].strip(".,!?;:'\"")
            if (len(word) > 2 and word not in common_stopwords and any(c.isalpha() for c in word)):
                if i + 1 < len(words):
                    next_word = words[i + 1].strip(".,!?;:'\"")
                    if (len(next_word) > 2 and next_word not in common_stopwords and
                        next_word not in weak_adjectives and any(c.isalpha() for c in next_word)):
                        two_word = f"{word} {next_word}"
                        if len(two_word) < 30:
                            tags.append(two_word)
                            i += 2
                            continue
                if word not in weak_adjectives:
                    tags.append(word)
            i += 1

        seen = set()
        unique_tags = []
        for tag in tags:
            normalized = tag.lower().strip()
            if normalized not in seen:
                seen.add(normalized)
                unique_tags.append(normalized)

        return unique_tags[:20]


# ============================================================================
# EMBEDDING ENGINE
# ============================================================================

class _LRUCache:
    """Simple LRU cache for embeddings"""
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


_embedding_instance = None

def get_embedding_engine():
    """Get or create EmbeddingEngine singleton"""
    global _embedding_instance
    if _embedding_instance is None:
        _embedding_instance = EmbeddingEngine()
    return _embedding_instance


class EmbeddingEngine:
    """Wraps sentence-transformers for batch embedding generation"""

    def __init__(self, model_name: str | None = None):
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
        """Embed one string with caching"""
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
        
        if len(text) < 1000:
            self._text_cache.set(text, result)
        
        return result

    def embed_batch(self, texts: List[str], batch_size: Optional[int] = None) -> List[List[float]]:
        """Embed a batch of texts"""
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
        
        if len(texts) > 100:
            gc.collect()
        
        return result

    def embed_query(self, query: str) -> List[float]:
        """Embed query with BGE prefix for retrieval"""
        cached = self._query_cache.get(query)
        if cached is not None:
            return cached
        
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        result = self.embed_single(prefixed)
        self._query_cache.set(query, result)
        
        return result

    def clear_cache(self):
        """Clear embedding cache to free memory"""
        self._query_cache.clear()
        self._text_cache.clear()
        gc.collect()
        print("[Embeddings] Cache cleared")


# ============================================================================
# FILE PROCESSING PIPELINE
# ============================================================================

def extract_text(
    file_bytes: bytes,
    file_name: str,
    file_type: FileType,
) -> str:
    """Extract raw text from file bytes based on type"""
    try:
        if file_type == "pdf":
            return _extract_pdf(file_bytes)
        elif file_type == "docx":
            return _extract_docx(file_bytes, file_name)
        elif file_type == "txt":
            return _extract_txt(file_bytes)
        elif file_type == "image":
            text, _ = _extract_image_semantic(file_bytes, file_name)
            return text
        elif file_type == "audio":
            return _extract_audio_whisper(file_bytes, file_name)
        else:
            return _extract_txt(file_bytes)
    except Exception as e:
        return f"[Critical error extracting from {file_name}: {str(e)}]"


def _extract_image_semantic(data: bytes, filename: str) -> tuple[str, dict]:
    """Extract semantic understanding from image using BLIP-2 captioning"""
    try:
        captioner = get_captioner()
        result = captioner.generate_caption(data, filename)
        caption = result.get("caption", "")
        tags = result.get("tags", [])
        text_for_search = f"Image caption: {caption}. Tags: {', '.join(tags)}."
        image_metadata = {
            "caption": caption,
            "tags": tags,
            "type": "image",
            "filename": filename,
            "model": result.get("model", "unknown"),
            "confidence": result.get("confidence", 0.0),
        }
        return text_for_search, image_metadata
    except Exception as exc:
        error_msg = str(exc)
        image_metadata = {
            "caption": f"Image: {filename}",
            "tags": ["image"],
            "type": "image",
            "filename": filename,
            "model": "fallback",
            "error": error_msg,
        }
        return f"[Image: {filename}. Captioning failed: {error_msg}]", image_metadata


def extract_image_metadata(
    file_bytes: bytes,
    file_name: str,
) -> dict:
    """Extract image metadata (caption, tags) from image"""
    try:
        _, metadata = _extract_image_semantic(file_bytes, file_name)
        return metadata
    except Exception as e:
        return {
            "caption": f"Image: {file_name}",
            "tags": ["image"],
            "type": "image",
            "filename": file_name,
            "error": str(e),
        }


def process_file_bytes(
    file_bytes: bytes,
    file_name: str,
    file_type: FileType,
    file_path: str = ""
) -> tuple[list[dict], dict | None]:
    """Extract text, chunk it, and return chunks + image metadata (if image)"""
    image_metadata = None
    if file_type == "image":
        raw_text, image_metadata = _extract_image_semantic(file_bytes, file_name)
    else:
        raw_text = extract_text(file_bytes, file_name, file_type)

    identity = f"FILE IDENTITY: This is a {file_type} file named '{file_name}'.\n"
    if not raw_text.strip():
        raw_text = f"{identity}EXTRACTED CONTENT: [No readable content could be extracted from this {file_type} file.]"
    else:
        raw_text = f"{identity}EXTRACTED CONTENT:\n{raw_text}"

    chunks = Chunker.chunk_text(raw_text, file_path or file_name)
    return chunks, image_metadata
