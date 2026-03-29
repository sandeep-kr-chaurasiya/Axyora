"""
Axyora — File Processing Pipeline
Handles: PDF, DOCX, TXT, Images (OCR), Audio (Whisper)
Returns: list of text chunks with metadata
"""

from __future__ import annotations

import io
import os
import re
import tempfile
from pathlib import Path
from typing import Literal

from chunker import Chunker

FileType = Literal["pdf", "docx", "txt", "image", "audio", "unknown"]

CHUNK_SIZE = 512       # target tokens per chunk (approx chars / 4)
CHUNK_OVERLAP = 64     # overlap in tokens


# ---------------------------------------------------------------------------
# File type detection
# ---------------------------------------------------------------------------

def detect_file_type(filename: str, content: bytes = b"") -> FileType:
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


# ---------------------------------------------------------------------------
# Text extraction per type
# ---------------------------------------------------------------------------

def _extract_pdf(data: bytes) -> str:
    """Extract all text from PDF using pypdf."""
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text.strip())
    return "\n\n".join(parts)


def _extract_docx(data: bytes, filename: str) -> str:
    """
    Extract text from DOC/DOCX using Apache Tika.
    Falls back to python-docx for DOCX files when Tika is unavailable.
    """
    suffix = Path(filename).suffix.lower() or ".docx"
    tika_available = False
    try:
        from tika import parser as tika_parser  # type: ignore
        tika_available = True
    except Exception:
        tika_parser = None  # type: ignore[assignment]

    if tika_available and tika_parser is not None:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        try:
            parsed = tika_parser.from_file(tmp_path)
            content = (parsed or {}).get("content") or ""
            content = content.strip()
            if content:
                return content
        except Exception:
            pass
        finally:
            os.unlink(tmp_path)

    if suffix == ".doc":
        return f"[DOC file: {filename}. Extraction failed - missing Tika/Java]"

    try:
        import docx
    except Exception:
        return f"[DOCX file: {filename}. Extraction failed - missing python-docx]"

    try:
        doc = docx.Document(io.BytesIO(data))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as e:
        return f"[DOCX file: {filename}. Error: {str(e)}]"


def _extract_txt(data: bytes) -> str:
    """Decode plain text file."""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _extract_image_semantic(data: bytes, filename: str) -> tuple[str, dict]:
    """
    Extract semantic understanding from image using BLIP-2 captioning.
    Returns: (text_for_search, image_metadata)
    """
    try:
        from image_captioner import get_captioner
    except Exception as exc:
        return (
            f"[Image captioning engine missing: {str(exc)}]",
            {"caption": "", "tags": [], "type": "image", "filename": filename},
        )

    try:
        captioner = get_captioner()
        result = captioner.generate_caption(data, filename)

        caption = result.get("caption", "")
        tags = result.get("tags", [])
        model = result.get("model", "unknown")

        # Build searchable text combining caption and tags
        text_for_search = f"Image caption: {caption}. Tags: {', '.join(tags)}."

        image_metadata = {
            "caption": caption,
            "tags": tags,
            "type": "image",
            "filename": filename,
            "model": model,
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


def _extract_image_ocr_fallback(data: bytes, filename: str) -> str:
    """
    Fallback: Extract text from an image using Tesseract OCR via pytesseract.
    Used when caption generation is not needed (legacy support).
    """
    try:
        import pytesseract
        from PIL import Image
    except Exception as exc:
        return f"[Image OCR engine missing: {str(exc)}]"

    # Common Tesseract paths on macOS/Linux
    tess_paths = [
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        "/usr/bin/tesseract",
    ]

    if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
        for path in tess_paths:
            if os.path.exists(path):
                pytesseract.pytesseract.tesseract_cmd = path
                break

    try:
        # HEIC support via pillow-heif if available
        if filename.lower().endswith(".heic"):
            try:
                from pillow_heif import register_heif_opener

                register_heif_opener()
            except ImportError:
                return f"[HEIC file: {filename}. Install pillow-heif for support]"

        img = Image.open(io.BytesIO(data))
        # Convert to RGB if needed
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Optimize memory: Downscale if over 2048px (usually plenty for OCR)
        max_dim = 2048
        if max(img.width, img.height) > max_dim:
            ratio = max_dim / max(img.width, img.height)
            img = img.resize(
                (int(img.width * ratio), int(img.height * ratio)), Image.Resampling.LANCZOS
            )

        text = pytesseract.image_to_string(img, config="--psm 3 --oem 3")
        return (
            text.strip()
            or f"This is an image file named '{filename}'. No text was detected within the image using OCR."
        )
    except Exception as exc:
        msg = str(exc)
        if "tesseract is not installed" in msg.lower():
            return f"This is an image file named '{filename}'. OCR is currently unavailable on this system."
        return f"This is an image file named '{filename}'. OCR failed with error: {msg}"


def _extract_audio_whisper(data: bytes, filename: str) -> str:
    """Transcribe audio using OpenAI Whisper (local model)."""
    try:
        import whisper  # type: ignore
    except Exception as exc:
        return f"[Audio transcription engine missing: {str(exc)}]"

    # Write to a temp file — Whisper needs a file path
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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text(
    file_bytes: bytes,
    file_name: str,
    file_type: FileType,
) -> str:
    """
    Extract raw text from file bytes based on type.
    For images: returns caption + tags (semantic understanding).
    """
    try:
        if file_type == "pdf":
            return _extract_pdf(file_bytes)
        elif file_type == "docx":
            return _extract_docx(file_bytes, file_name)
        elif file_type == "txt":
            return _extract_txt(file_bytes)
        elif file_type == "image":
            # Use semantic image captioning instead of OCR
            text, _ = _extract_image_semantic(file_bytes, file_name)
            return text
        elif file_type == "audio":
            return _extract_audio_whisper(file_bytes, file_name)
        else:
            return _extract_txt(file_bytes)
    except Exception as e:
        return f"[Critical error extracting from {file_name}: {str(e)}]"


def extract_image_metadata(
    file_bytes: bytes,
    file_name: str,
) -> dict:
    """
    Extract image metadata (caption, tags) from image.
    Returns metadata dict with caption and tags.
    """
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
    """
    Extracts text, chunks it, and returns chunks + image metadata (if image).
    Returns: (chunks_list, image_metadata_or_none)
    """
    image_metadata = None
    if file_type == "image":
        # Run semantic image extraction only once to avoid duplicate model inference.
        raw_text, image_metadata = _extract_image_semantic(file_bytes, file_name)
    else:
        raw_text = extract_text(file_bytes, file_name, file_type)

    # Semantic enrichment: always include file identity in indexed text
    identity = f"FILE IDENTITY: This is a {file_type} file named '{file_name}'.\n"
    if not raw_text.strip():
        raw_text = f"{identity}EXTRACTED CONTENT: [No readable content could be extracted from this {file_type} file.]"
    else:
        raw_text = f"{identity}EXTRACTED CONTENT:\n{raw_text}"

    chunks = Chunker.chunk_text(raw_text, file_path or file_name)
    return chunks, image_metadata
