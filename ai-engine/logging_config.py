"""
Structured logging for production traceability
"""

import json
import time
import sys
from typing import Any, Dict, Optional
from datetime import datetime

class StructuredLogger:
    """JSON-structured logging for production systems"""
    
    def __init__(self, service_name: str = "axyora-ai-engine"):
        self.service_name = service_name
    
    def _format_log(
        self,
        level: str,
        message: str,
        **context,
    ) -> str:
        """Format log message as JSON"""
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": self.service_name,
            "level": level,
            "message": message,
            **context,  # All context fields included
        }
        return json.dumps(log_entry)
    
    def info(self, message: str, **context):
        """Log info level"""
        log_line = self._format_log("INFO", message, **context)
        print(log_line, file=sys.stdout)
    
    def warning(self, message: str, **context):
        """Log warning level"""
        log_line = self._format_log("WARNING", message, **context)
        print(log_line, file=sys.stderr)
    
    def error(self, message: str, error: Optional[Exception] = None, **context):
        """Log error level"""
        if error:
            context["error_type"] = type(error).__name__
            context["error_message"] = str(error)
        log_line = self._format_log("ERROR", message, **context)
        print(log_line, file=sys.stderr)
    
    def debug(self, message: str, **context):
        """Log debug level"""
        log_line = self._format_log("DEBUG", message, **context)
        print(log_line, file=sys.stdout)
    
    def job_started(self, job_id: str, user_id: str, file_name: str, file_type: str):
        """Log job start"""
        self.info(
            "Job started",
            job_id=job_id,
            user_id=user_id,
            file_name=file_name,
            file_type=file_type,
        )
    
    def job_progress(self, job_id: str, step: str, progress: int, **extra):
        """Log job progress"""
        self.info(
            f"Job progress: {step}",
            job_id=job_id,
            step=step,
            progress=progress,
            **extra,
        )
    
    def job_completed(
        self,
        job_id: str,
        user_id: str,
        file_name: str,
        chunks: int,
        duration_s: float,
    ):
        """Log job completion"""
        self.info(
            "Job completed",
            job_id=job_id,
            user_id=user_id,
            file_name=file_name,
            chunks_processed=chunks,
            duration_seconds=round(duration_s, 2),
        )
    
    def job_failed(
        self,
        job_id: str,
        user_id: str,
        file_name: str,
        error: Exception,
        duration_s: float,
    ):
        """Log job failure"""
        self.error(
            "Job failed",
            error=error,
            job_id=job_id,
            user_id=user_id,
            file_name=file_name,
            duration_seconds=round(duration_s, 2),
        )
    
    def query_started(self, user_id: str, query: str):
        """Log query start"""
        self.info(
            "Query started",
            user_id=user_id,
            query=query[:100],  # truncate for logging
        )
    
    def query_completed(self, user_id: str, duration_ms: int, fallback: bool):
        """Log query completion"""
        self.info(
            "Query completed",
            user_id=user_id,
            duration_ms=duration_ms,
            fallback=fallback,
        )
    
    def query_failed(self, user_id: str, error: Exception):
        """Log query failure"""
        self.error(
            "Query failed",
            error=error,
            user_id=user_id,
        )
    
    def index_operation(self, operation: str, user_id: str, count: int):
        """Log index operations (clear, delete, etc)"""
        self.info(
            f"Index operation: {operation}",
            operation=operation,
            user_id=user_id,
            affected_count=count,
        )
    
    def circuit_breaker_event(self, service: str, state: str, reason: str = ""):
        """Log circuit breaker state changes"""
        self.warning(
            f"Circuit breaker: {service} → {state}",
            service=service,
            state=state,
            reason=reason,
        )


# Global logger instance
logger = StructuredLogger()
