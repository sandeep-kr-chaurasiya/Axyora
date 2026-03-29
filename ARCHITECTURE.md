# Axyora Core Architecture (Mobile + Local AI Engine)

## 1. Text Architecture Diagram

Axyora Mobile (React Native)
  -> Permission Manager (Media Library + Document Provider)
  -> Data Access Layer
     - Document Picker (PDF/DOC/TXT)
     - Media Library (Images/Audio)
     - App Directories (FileSystem)
  -> Ingestion Worker
     - Incremental scanner
     - Queue scheduler
     - Upload transport (multipart)
  -> Query Client
     - /query request
     - Source cards rendering (file_name + file_path)

Local AI Engine (FastAPI, on-device or localhost)
  -> /scan
     - Evaluates candidate files for incremental indexing
  -> /process-file
     - Type detection
     - Text extraction (PyPDF / Tika / OCR / Whisper)
     - Chunking
     - Embedding generation (BGE-small)
     - Vector persistence (FAISS)
     - Job status tracking
  -> /generate-embedding
  -> /query
     - Query embedding
     - Vector retrieval
     - RAG synthesis with Ollama (Llama 3 / Mistral)
     - Fallback retrieval response when LLM unavailable
  -> /status/{job_id}
  -> /index-stats
  -> /clear

Storage Layers (Local only)
  -> ~/.axyora/faiss_index.bin
  -> ~/.axyora/metadata.json
  -> ~/.axyora/index_registry.json

Privacy Boundary
  -> All files, extracted content, embeddings, and retrieval remain local
  -> Firebase usage limited to auth + settings on mobile side

## 2. End-to-End Data Pipeline

1. Mobile asks permissions for media and file access.
2. Scanner enumerates user-selectable documents, media assets, and app directories.
3. iOS URI normalization ensures uploadable file paths (file:// or content://), avoiding ph-upload:// transport failures.
4. Mobile sends optional file manifest to /scan for incremental queue decisions.
5. Queue uploads files to /process-file with metadata (user_id, file_path, modified_at, job_id).
6. Backend detects type and extracts text with real processors:
   - PDF: pypdf
   - DOC/DOCX: Apache Tika, python-docx fallback for DOCX
   - Image: Tesseract OCR
   - Audio: Whisper local model
7. Text is chunked and embedded using BAAI/bge-small-en-v1.5.
8. Embeddings + metadata are stored in FAISS with file_name and file_path.
9. Query flow:
   - embed user query
   - top-k retrieval
   - RAG prompt to Ollama
   - return structured answer + sources with file_name and file_path
10. Mobile renders answer and source cards.

## 3. FastAPI Contract

POST /scan
- Input: user_id, files[] { file_name, file_path, file_type, size, modified_at, fingerprint }
- Output: scanned, supported, queued, skipped, queue[]

POST /process-file (multipart)
- Fields: file, user_id, job_id, file_path, modified_at
- Output: job status object

GET /status/{job_id}
- Output: queued/processing/done/error, progress, current_step

POST /query
- Input: query, user_id, model, top_k
- Output:
  {
    answer,
    sources: [
      {
        file_name,
        file_path,
        preview,
        score,
        type,
        chunk_index
      }
    ],
    duration_ms,
    fallback
  }

## 4. Background and Incremental Behavior

- Queue is non-blocking and emits progress events to the UI.
- File dedupe uses hash and path-based cache checks.
- Re-indexing same local path replaces prior vectors for that path.
- Registry persistence avoids repeated indexing across restarts.

## 5. Operational Requirements

- Start AI engine before using chat/indexing from mobile:
  - cd ai-engine
  - ./.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
- Optional LLM service:
  - ollama serve
  - ollama pull llama3:8b

If Ollama is unavailable, /query returns retrieval-mode fallback content and still includes source paths.
