# Axyora AI Engine

Local FastAPI service that powers file processing, embedding generation, and RAG query answering.

## Setup

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Install Tesseract OCR (for image processing)
# macOS:
brew install tesseract
# Ubuntu/Debian:
sudo apt install tesseract-ocr
# Windows: https://github.com/UB-Mannheim/tesseract/wiki

# 4. Install and start Ollama (for LLM synthesis)
# https://ollama.com
ollama pull llama3:8b      # ~4.7 GB — recommended
# Or lighter alternatives:
# ollama pull mistral:7b
# ollama pull phi3:mini

# 5. Start the AI engine
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health + vector count |
| POST | `/process-file` | Upload + index a file |
| GET | `/status/{job_id}` | Real-time job progress |
| POST | `/generate-embedding` | Embed a single text |
| POST | `/query` | RAG: answer a question |
| DELETE | `/clear?user_id=` | Wipe user's vector index |
| GET | `/index-stats?user_id=` | Files indexed per user |

## Architecture

```
File Upload
    │
    ▼
processing.py ──► Extract text (PyPDF / Apache Tika / Tesseract OCR / Whisper)
    │
    ▼
Chunk text (512 tokens, 64 overlap)
    │
    ▼
embeddings.py ──► BAAI/bge-small-en-v1.5 (384-dim, normalized)
    │
    ▼
vector_store.py ──► FAISS IndexFlatIP (cosine sim) → persisted to ~/.axyora/
index_registry.py ──► Hash-based incremental cache (skip unchanged files)
    │
Query
    │
    ▼
query_engine.py ──► Embed query → FAISS search → Build context → Ollama LLM
    │
    ▼
Answer + Source File Cards
```

## Notes

- All data stays local. No file content is ever sent to cloud.
- `/process-file` pushes jobs to async background workers (non-blocking queue).
- DOC/DOCX extraction uses Apache Tika (with python-docx fallback).
- Whisper downloads model weights (~150 MB for `base`) on first audio file.
- BGE model (~90 MB) is cached in `~/.cache/huggingface/`.
- FAISS index is persisted at `~/.axyora/`.
- Incremental hash registry is persisted at `~/.axyora/index_registry.json`.
- If Ollama is not running, the engine falls back to returning raw retrieved chunks.
