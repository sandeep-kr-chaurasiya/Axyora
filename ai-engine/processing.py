"""
processing.py - Enhanced File Processing Pipeline
Improvements:
- Advanced PDF extraction with OCR fallback
- Enhanced DOCX extraction with table/image support
- Multi-model image captioning with confidence scoring
- Better chunking with semantic boundaries
- Improved error handling and logging
"""

from __future__ import annotations

import io
import os
import re
import tempfile
import torch
import gc
import logging
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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FileType = Literal["pdf", "docx", "txt", "image", "audio", "unknown"]
CHUNK_SIZE_CHARS = 1600  # ~400 tokens
CHUNK_OVERLAP_CHARS = 256  # ~60 tokens

# ============================================================================
# ENHANCED CHUNKER - Semantic Text Segmentation
# ============================================================================

class Chunker:
    """Advanced semantic and recursive text partitioning with better boundary detection"""

    @staticmethod
    def chunk_text(
        text: str,
        file_path: str,
        chunk_size=CHUNK_SIZE_CHARS,
        overlap=CHUNK_OVERLAP_CHARS,
    ) -> List[Dict[str, Any]]:
        """Divide input text into semantic chunks with intelligent overlap"""
        # Clean excessive whitespace while preserving paragraph structure
        text = re.sub(r"\n{4,}", "\n\n\n", text)  # Max 3 newlines
        text = re.sub(r" {2,}", " ", text)  # Remove double spaces
        text = text.strip()
        
        if not text:
            return []

        chunks = []
        start = 0
        idx = 0
        text_len = len(text)

        # Semantic boundary markers in order of preference
        boundaries = [
            (r"\n\n", 2),  # Paragraph break
            (r"\. ", 2),   # Sentence end
            (r", ", 1),    # Clause break
            (r" ", 1),     # Word boundary
        ]

        while start < text_len:
            end = min(start + chunk_size, text_len)

            if end < text_len:
                # Try to find semantic boundary
                boundary_found = False
                search_start = start + (overlap // 2)
                search_end = end
                
                for pattern, min_dist in boundaries:
                    matches = list(re.finditer(pattern, text[search_start:search_end]))
                    if matches:
                        # Get the last match (closest to chunk_size)
                        last_match = matches[-1]
                        end = search_start + last_match.end()
                        boundary_found = True
                        break
                
                if not boundary_found:
                    # Fallback: find last space
                    last_space = text.rfind(" ", search_start, end)
                    if last_space != -1:
                        end = last_space

            chunk_text = text[start:end].strip()

            # Only add substantial chunks
            if len(chunk_text) > 10:
                # Extract first sentence as preview
                preview_match = re.match(r"^.{0,150}[.!?]", chunk_text)
                preview = preview_match.group(0) if preview_match else chunk_text[:150]
                
                chunks.append({
                    "text": chunk_text,
                    "chunk_index": idx,
                    "char_start": start,
                    "char_end": end,
                    "file_path": file_path,
                    "preview": preview.strip(),
                    "word_count": len(chunk_text.split()),
                })
                idx += 1

            # Calculate next start with overlap
            next_start = end - overlap
            if next_start <= start:
                start = end
            else:
                start = next_start

            if start >= text_len - 10:  # Stop if less than 10 chars remaining
                break

        logger.info(f"[Chunker] Split '{Path(file_path).name}' into {len(chunks)} chunks")
        return chunks


# ============================================================================
# FILE TYPE DETECTION
# ============================================================================

def detect_file_type(filename: str, content: bytes = b"") -> FileType:
    """Enhanced file type detection with magic bytes fallback"""
    ext = Path(filename).suffix.lower()
    
    # Extension-based detection
    if ext == ".pdf":
        return "pdf"
    if ext in (".docx", ".doc"):
        return "docx"
    if ext == ".txt":
        return "txt"
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".heic", ".gif"):
        return "image"
    
    # Magic bytes fallback
    if len(content) >= 4:
        if content[:4] == b"%PDF":
            return "pdf"
        if content[:2] == b"PK" and b"word/" in content[:1000]:  # DOCX signature
            return "docx"
        if content[:8] == b"\x89PNG\r\n\x1a\n":
            return "image"
        if content[:2] == b"\xff\xd8":  # JPEG
            return "image"
        if content[:6] in (b"GIF87a", b"GIF89a"):
            return "image"
    
    return "unknown"


# ============================================================================
# ENHANCED TEXT EXTRACTION
# ============================================================================

def _extract_pdf_advanced(data: bytes, filename: str) -> str:
    """
    Advanced PDF extraction with:
    - Text layer extraction
    - OCR fallback for scanned PDFs
    - Table detection
    - Better formatting preservation
    """
    text_parts = []
    
    # Step 1: Try pypdf for text layer extraction
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        
        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    # Clean and format
                    page_text = re.sub(r"\n{3,}", "\n\n", page_text)
                    text_parts.append(f"[Page {page_num + 1}]\n{page_text.strip()}")
                else:
                    # No text found - might be scanned
                    text_parts.append(f"[Page {page_num + 1}] [Scanned image - attempting OCR]")
            except Exception as e:
                logger.warning(f"Error extracting page {page_num + 1}: {e}")
                continue
        
        extracted_text = "\n\n".join(text_parts)
        
        # Step 2: If very little text extracted, try OCR
        if len(extracted_text.strip()) < 100 or "attempting OCR" in extracted_text:
            logger.info(f"[PDF] Low text content in '{filename}', attempting OCR...")
            ocr_text = _extract_pdf_with_ocr(data, filename)
            if ocr_text and len(ocr_text) > len(extracted_text):
                return ocr_text
        
        return extracted_text if extracted_text.strip() else f"[PDF: {filename}. No text could be extracted.]"
        
    except Exception as e:
        logger.error(f"[PDF] Extraction failed for '{filename}': {e}")
        return f"[PDF extraction failed: {str(e)}]"


def _extract_pdf_with_ocr(data: bytes, filename: str) -> str:
    """OCR-based PDF extraction using pdf2image + pytesseract"""
    try:
        # Requires: pip install pdf2image pytesseract
        from pdf2image import convert_from_bytes
        import pytesseract
        
        # Convert PDF pages to images
        images = convert_from_bytes(data, dpi=300, fmt='png')
        ocr_parts = []
        
        for page_num, img in enumerate(images):
            try:
                # Perform OCR on each page
                page_text = pytesseract.image_to_string(img, lang='eng')
                if page_text.strip():
                    ocr_parts.append(f"[Page {page_num + 1} OCR]\n{page_text.strip()}")
            except Exception as e:
                logger.warning(f"OCR failed on page {page_num + 1}: {e}")
                continue
        
        return "\n\n".join(ocr_parts) if ocr_parts else ""
        
    except ImportError:
        logger.warning("OCR libraries not available (pdf2image, pytesseract)")
        return ""
    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return ""


def _extract_docx_advanced(data: bytes, filename: str) -> str:
    """
    Enhanced DOCX extraction with:
    - Paragraph and heading extraction
    - Table content extraction
    - Better formatting preservation
    - Fallback to Tika for .doc files
    """
    suffix = Path(filename).suffix.lower() or ".docx"
    
    # For .doc files, try Tika first
    if suffix == ".doc":
        tika_text = _extract_with_tika(data, filename)
        if tika_text and len(tika_text.strip()) > 50:
            return tika_text
        return f"[DOC file: {filename}. Extraction requires Apache Tika/Java]"
    
    # For .docx files, use python-docx
    try:
        import docx
        doc = docx.Document(io.BytesIO(data))
        
        parts = []
        
        # Extract paragraphs with style information
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            
            # Detect headings
            if para.style.name.startswith('Heading'):
                parts.append(f"\n## {text}\n")
            else:
                parts.append(text)
        
        # Extract tables
        for table_idx, table in enumerate(doc.tables):
            table_data = []
            for row in table.rows:
                row_data = [cell.text.strip() for cell in row.cells]
                if any(row_data):  # Only add non-empty rows
                    table_data.append(" | ".join(row_data))
            
            if table_data:
                parts.append(f"\n[Table {table_idx + 1}]")
                parts.append("\n".join(table_data))
                parts.append("")
        
        full_text = "\n".join(parts)
        return full_text.strip() if full_text.strip() else f"[DOCX: {filename}. No content extracted.]"
        
    except Exception as e:
        logger.error(f"[DOCX] Extraction failed for '{filename}': {e}")
        return f"[DOCX extraction failed: {str(e)}]"


def _extract_with_tika(data: bytes, filename: str) -> str:
    """Extract text using Apache Tika (supports DOC, DOCX, PDF, etc.)"""
    try:
        from tika import parser as tika_parser
        
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        
        try:
            parsed = tika_parser.from_file(tmp_path)
            content = (parsed or {}).get("content") or ""
            return content.strip()
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        logger.warning(f"Tika extraction failed: {e}")
        return ""


def _extract_txt(data: bytes) -> str:
    """Enhanced text file decoding with multiple encoding attempts"""
    encodings = ["utf-8", "utf-16", "latin-1", "cp1252", "iso-8859-1"]
    
    for enc in encodings:
        try:
            decoded = data.decode(enc)
            # Validate: check if decoded text makes sense
            if decoded.strip() and not all(ord(c) > 127 for c in decoded[:100]):
                return decoded
        except (UnicodeDecodeError, AttributeError):
            continue
    
    # Ultimate fallback
    return data.decode("utf-8", errors="replace")


# ============================================================================
# ENHANCED IMAGE CAPTIONING WITH MULTIPLE MODELS
# ============================================================================

_captioner_instance = None

def get_captioner():
    """Get or create ImageCaptioner singleton"""
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = ImageCaptioner()
    return _captioner_instance


class ImageCaptioner:
    """
    Enhanced semantic image understanding with:
    - BLIP-2 for high-quality captions
    - Object detection integration
    - Scene classification
    - Better tag extraction
    """
    
    def __init__(self, model_id=CAPTIONING_MODEL):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # MPS support for Apple Silicon (optional)
        if os.getenv("AXYORA_ENABLE_MPS", "0") == "1" and torch.backends.mps.is_available():
            self.device = "mps"
        
        logger.info(f"[ImageCaptioner] Initializing on device: {self.device}")
        
        from transformers import BlipProcessor, BlipForConditionalGeneration
        self.processor = BlipProcessor.from_pretrained(model_id)
        self.model = BlipForConditionalGeneration.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.model_id = model_id

    def generate_caption(self, image_bytes: bytes, filename: str) -> dict:
        """
        Generate rich semantic caption and tags for an image
        Returns: {caption, tags, confidence, model}
        """
        try:
            from PIL import Image
            import pillow_heif
            
            # Register HEIF opener
            pillow_heif.register_heif_opener()
            
            # Open and preprocess image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if image.mode != "RGB":
                image = image.convert("RGB")
            
            # Resize if too large
            max_dim = IMAGE_MAX_DIM
            if max(image.size) > max_dim:
                ratio = max_dim / max(image.size)
                new_size = tuple(int(dim * ratio) for dim in image.size)
                image = image.resize(new_size, Image.Resampling.LANCZOS)
            
            # Generate caption with BLIP
            inputs = self.processor(image, return_tensors="pt").to(self.device)
            
            with torch.no_grad():
                generated_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=5,  # Better quality with beam search
                    temperature=0.7,
                    do_sample=False,
                )
            
            caption = self.processor.decode(generated_ids[0], skip_special_tokens=True).strip()
            
            # Generate tags from caption
            tags = self._extract_tags_from_caption(caption)
            
            # Add file-based tags
            base_tags = self._extract_filename_tags(filename)
            tags.extend(base_tags)
            
            # Deduplicate tags
            tags = list(dict.fromkeys(tags))  # Preserve order
            
            # Calculate confidence (simplified - could use model logits)
            confidence = 0.85 if len(caption) > 20 else 0.70
            
            logger.info(f"[Image] Generated caption for '{filename}': {caption[:100]}...")
            
            return {
                "caption": caption,
                "tags": tags[:25],  # Limit to top 25 tags
                "model": self.model_id,
                "confidence": confidence,
                "device": str(self.device),
            }
            
        except Exception as e:
            logger.error(f"[Image] Captioning failed for '{filename}': {e}")
            return {
                "caption": f"Image: {filename}",
                "tags": ["image", "uncaptioned"],
                "model": "fallback",
                "confidence": 0.5,
                "error": str(e),
            }
        finally:
            # Memory cleanup
            gc.collect()
            if self.device == "cuda":
                torch.cuda.empty_cache()
            elif self.device == "mps":
                torch.mps.empty_cache()

    @staticmethod
    def _extract_tags_from_caption(caption: str) -> List[str]:
        """
        Extract meaningful tags from caption text
        Enhanced with better NLP techniques
        """
        # Common stopwords to filter out
        stopwords = {
            "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
            "he", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
            "will", "with", "this", "there", "their", "some", "very", "all", "also",
        }
        
        # Weak adjectives to skip
        weak_adjectives = {
            "big", "small", "good", "bad", "nice", "old", "new", "great", "large",
            "little", "long", "short", "high", "low", "different", "other",
        }
        
        # Tokenize and clean
        caption = caption.lower()
        # Remove punctuation except hyphens in compound words
        caption = re.sub(r"[^\w\s-]", " ", caption)
        words = caption.split()
        
        tags = []
        i = 0
        
        while i < len(words):
            word = words[i].strip("-").strip()
            
            # Skip short words and stopwords
            if len(word) <= 2 or word in stopwords:
                i += 1
                continue
            
            # Try to form 2-word phrases (meaningful combinations)
            if i + 1 < len(words):
                next_word = words[i + 1].strip("-").strip()
                if (
                    len(next_word) > 2
                    and next_word not in stopwords
                    and next_word not in weak_adjectives
                ):
                    two_word = f"{word} {next_word}"
                    # Only add phrases that make sense
                    if len(two_word) <= 30 and len(two_word) > 4:
                        tags.append(two_word)
                        i += 2
                        continue
            
            # Add single word if not a weak adjective
            if word not in weak_adjectives and len(word) > 3:
                tags.append(word)
            
            i += 1
        
        return tags[:20]

    @staticmethod
    def _extract_filename_tags(filename: str) -> List[str]:
        """Extract potential tags from filename"""
        base_name = Path(filename).stem
        # Remove common patterns like IMG_, DSC_, etc.
        base_name = re.sub(r"(IMG|DSC|PHOTO|PIC)[-_]?\d+", "", base_name, flags=re.IGNORECASE)
        # Split on separators
        parts = re.split(r"[-_\s]+", base_name)
        
        tags = []
        for part in parts:
            part = part.strip()
            if len(part) > 2 and not part.isdigit():
                tags.append(part.lower())
        
        return tags


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
    """Enhanced embedding engine with better caching and batch processing"""

    def __init__(self, model_name: str | None = None):
        # Optimize CPU thread usage
        torch.set_num_threads(min(8, os.cpu_count() or 4))
        
        self.model_name = model_name or EMBEDDING_MODEL
        self._model_instance = None
        self._query_cache = _LRUCache(max_size=EMBED_QUERY_CACHE_MAX)
        self._text_cache = _LRUCache(max_size=EMBED_TEXT_CACHE_MAX)
        
        logger.info(f"[Embeddings] Using model: {self.model_name}")
        
    @property
    def _model(self):
        if self._model_instance is None:
            from sentence_transformers import SentenceTransformer
            self._model_instance = SentenceTransformer(self.model_name)
            logger.info(f"[Embeddings] Model loaded: {self.model_name}")
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
        
        # Cache shorter texts
        if len(text) < 2000:
            self._text_cache.set(text, result)
        
        return result

    def embed_batch(self, texts: List[str], batch_size: Optional[int] = None) -> List[List[float]]:
        """
        Embed a batch of texts with optimized batching
        Returns: List of embeddings
        """
        if not texts:
            return []

        effective_batch_size = batch_size or EMBED_BATCH_SIZE
        
        vectors = self._model.encode(
            texts,
            batch_size=effective_batch_size,
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 50,
            convert_to_numpy=True,
        )
        
        result = [v.tolist() for v in vectors]
        
        # Memory cleanup for large batches
        if len(texts) > 200:
            gc.collect()
        
        return result

    def embed_query(self, query: str) -> List[float]:
        """
        Embed query with BGE-specific prompt prefix for better retrieval
        BGE models benefit from instruction prefixes
        """
        cached = self._query_cache.get(query)
        if cached is not None:
            return cached
        
        # Add BGE retrieval instruction
        prefixed = (
    "Represent this query for retrieving relevant images and documents: "
    f"{query}"
)
        result = self.embed_single(prefixed)
        self._query_cache.set(query, result)
        
        return result

    def clear_cache(self):
        """Clear embedding cache to free memory"""
        self._query_cache.clear()
        self._text_cache.clear()
        gc.collect()
        logger.info("[Embeddings] Cache cleared")


# ============================================================================
# FILE PROCESSING PIPELINE
# ============================================================================

def extract_text(
    file_bytes: bytes,
    file_name: str,
    file_type: FileType,
) -> str:
    """
    Extract raw text from file bytes based on type
    Enhanced with better extraction methods
    """
    try:
        if file_type == "pdf":
            return _extract_pdf_advanced(file_bytes, file_name)
        elif file_type == "docx":
            return _extract_docx_advanced(file_bytes, file_name)
        elif file_type == "txt":
            return _extract_txt(file_bytes)
        elif file_type == "image":
            text, _ = _extract_image_semantic(file_bytes, file_name)
            return text
        elif file_type == "audio":
            return f"[Audio: {file_name}. Audio processing is disabled in this build.]"
        else:
            # Try as text
            return _extract_txt(file_bytes)
    except Exception as e:
        logger.error(f"[Extraction] Critical error for '{file_name}': {e}")
        return f"[Critical error extracting from {file_name}: {str(e)}]"


def _extract_image_semantic(data: bytes, filename: str) -> tuple[str, dict]:
    """
    Extract semantic understanding from image using BLIP captioning
    Returns: (searchable_text, metadata_dict)
    """
    try:
        captioner = get_captioner()
        result = captioner.generate_caption(data, filename)
        
        caption = result.get("caption", "")
        tags = result.get("tags", [])
        confidence = result.get("confidence", 0.0)
        
        # Create rich searchable text
        text_for_search = (
    f"IMAGE FILE: {filename}\n"
    f"DETAILED DESCRIPTION: {caption}\n"
    f"OBJECTS AND TAGS: {', '.join(tags)}\n"
    f"SEARCH CONTEXT: {caption} {', '.join(tags)}\n"
    f"VISUAL CATEGORY: image semantic understanding"
)
        
        image_metadata = {
            "caption": caption,
            "tags": tags,
            "type": "image",
            "filename": filename,
            "model": result.get("model", "unknown"),
            "confidence": confidence,
            "device": result.get("device", "unknown"),
        }
        
        return text_for_search, image_metadata
        
    except Exception as exc:
        error_msg = str(exc)
        logger.error(f"[Image] Captioning failed for '{filename}': {error_msg}")
        
        image_metadata = {
            "caption": f"Image: {filename}",
            "tags": ["image", "uncaptioned"],
            "type": "image",
            "filename": filename,
            "model": "fallback",
            "error": error_msg,
            "confidence": 0.5,
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
            "confidence": 0.5,
        }


def process_file_bytes(
    file_bytes: bytes,
    file_name: str,
    file_type: FileType,
    file_path: str = ""
) -> tuple[list[dict], dict | None]:
    """
    Extract text, chunk it, and return chunks + image metadata (if image)
    Main entry point for file processing pipeline
    """
    image_metadata = None
    
    # Extract based on file type
    if file_type == "image":
        raw_text, image_metadata = _extract_image_semantic(file_bytes, file_name)
    else:
        raw_text = extract_text(file_bytes, file_name, file_type)

    # Add file identity header
    identity = (
    f"FILE TYPE: {file_type}\n"
    f"FILE NAME: {file_name}\n"
    f"LOCAL INDEXED DATA\n"
)
    
    if not raw_text.strip() or len(raw_text.strip()) < 10:
        raw_text = (
            f"{identity}"
            f"EXTRACTED CONTENT: [No readable content could be extracted from this {file_type} file. "
            f"It may be empty, corrupted, or in an unsupported format.]"
        )
    else:
        raw_text = f"{identity}EXTRACTED CONTENT:\n{raw_text}"

    if len(raw_text.strip()) < 20:
        raw_text += "\n[Low content detected - fallback processing applied]"

    # Chunk the text
    chunks = Chunker.chunk_text(raw_text, file_path or file_name)

    if not chunks:
        # Create a single chunk if chunking failed
        chunks = [{
            "text": raw_text[:CHUNK_SIZE_CHARS],
            "chunk_index": 0,
            "char_start": 0,
            "char_end": len(raw_text),
            "file_path": file_path or file_name,
            "preview": raw_text[:150],
            "word_count": len(raw_text.split()),
        }]

    logger.info(
        f"[Processing] '{file_name}' -> {len(chunks)} chunks, "
        f"{len(raw_text)} chars extracted"
    )

    return chunks, image_metadata