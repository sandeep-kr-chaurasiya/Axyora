"""
Production configuration and constants
"""
import os

# File size limits
MAX_FILE_SIZE_MB = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# AI Models
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
CAPTIONING_MODEL = os.getenv("CAPTIONING_MODEL", "Salesforce/blip-image-captioning-base")
IMAGE_MAX_DIM = int(os.getenv("IMAGE_MAX_DIM", 1024))
IMAGE_CAPTION_MAX_NEW_TOKENS = int(os.getenv("IMAGE_CAPTION_MAX_NEW_TOKENS", 24))

# Retrieval
MAX_CONTEXT_CHUNKS = int(os.getenv("MAX_CONTEXT_CHUNKS", 5))
CONTEXT_RELEVANCE_THRESHOLD = float(os.getenv("CONTEXT_RELEVANCE_THRESHOLD", 0.1))

# Supported file types
SUPPORTED_FILE_TYPES = {"pdf", "docx", "txt", "image", "audio"}

# Retry policy
MAX_RETRIES = 3
INITIAL_RETRY_DELAY_MS = 100
MAX_RETRY_DELAY_MS = 60000
EXPONENTIAL_BASE = 2.0

# Timeouts (seconds)
FILE_PROCESSING_TIMEOUT = 300  # 5 minutes
OLLAMA_TIMEOUT = 30
EMBEDDING_TIMEOUT = 60

# Circuit breaker (Ollama/Groq)
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 2
CIRCUIT_BREAKER_TIMEOUT = 60  # seconds before retry

# Job cleanup (old jobs removed after this many seconds)
JOB_RETENTION_SECONDS = 3600  # 1 hour

# Database
DB_PATH = "axyora_jobs.db"
DB_TIMEOUT = 30

print(f"[Config] Production settings loaded. Default model: {GROQ_MODEL}")
