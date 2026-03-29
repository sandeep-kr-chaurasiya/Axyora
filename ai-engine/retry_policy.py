"""
Retry policy with exponential backoff
"""

import time
from typing import Callable, TypeVar, Optional
from production_config import (
    MAX_RETRIES,
    INITIAL_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    EXPONENTIAL_BASE,
)

T = TypeVar("T")

class RetryPolicy:
    """Exponential backoff retry decorator and utilities"""
    
    def __init__(
        self,
        max_retries: int = MAX_RETRIES,
        initial_delay_ms: int = INITIAL_RETRY_DELAY_MS,
        max_delay_ms: int = MAX_RETRY_DELAY_MS,
        exponential_base: float = EXPONENTIAL_BASE,
    ):
        self.max_retries = max_retries
        self.initial_delay_ms = initial_delay_ms
        self.max_delay_ms = max_delay_ms
        self.exponential_base = exponential_base
    
    def calculate_delay_ms(self, attempt: int) -> int:
        """Calculate delay in milliseconds for given attempt (0-indexed)"""
        if attempt >= self.max_retries:
            return self.max_delay_ms
        
        # Exponential: initial * (base ^ attempt)
        delay_ms = int(self.initial_delay_ms * (self.exponential_base ** attempt))
        return min(delay_ms, self.max_delay_ms)
    
    def should_retry(self, error: Exception) -> bool:
        """Determine if error is retriable"""
        # Retriable errors
        retriable_types = (
            TimeoutError,
            ConnectionError,
            OSError,  # network-related
        )
        
        # Non-retriable errors
        non_retriable_types = (
            ValueError,  # file too large, unsupported
            TypeError,
            FileNotFoundError,
        )
        
        if isinstance(error, non_retriable_types):
            return False
        
        if isinstance(error, retriable_types):
            return True
        
        # Check error message for keywords
        error_str = str(error).lower()
        non_retriable_keywords = ["too large", "unsupported", "not found"]
        for keyword in non_retriable_keywords:
            if keyword in error_str:
                return False
        
        # Default: retriable
        return True
    
    def execute_with_retry(
        self,
        func: Callable[..., T],
        *args,
        **kwargs,
    ) -> T:
        """Execute function with exponential backoff retry"""
        last_error: Optional[Exception] = None
        
        for attempt in range(self.max_retries):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_error = e
                
                if not self.should_retry(e):
                    print(f"[Retry] Non-retriable error on attempt {attempt + 1}: {e}")
                    raise
                
                if attempt == self.max_retries - 1:
                    print(f"[Retry] Max retries ({self.max_retries}) exceeded: {e}")
                    raise
                
                delay_ms = self.calculate_delay_ms(attempt)
                delay_s = delay_ms / 1000.0
                
                print(f"[Retry] Attempt {attempt + 1}/{self.max_retries} failed: {e}")
                print(f"[Retry] Retrying in {delay_s:.2f}s...")
                time.sleep(delay_s)
        
        # Fallback (should not reach here)
        if last_error:
            raise last_error
        raise RuntimeError("Retry exhausted with unknown error")


# Global instance
retry_policy = RetryPolicy()


def with_retry(func: Callable[..., T], *args, **kwargs) -> T:
    """Convenience function for retry execution"""
    return retry_policy.execute_with_retry(func, *args, **kwargs)


def async_retry_wrapper(max_retries: int = MAX_RETRIES):
    """Decorator for async functions"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            retry = RetryPolicy(max_retries=max_retries)
            last_error = None
            
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if not retry.should_retry(e):
                        raise
                    if attempt == max_retries - 1:
                        raise
                    
                    delay_ms = retry.calculate_delay_ms(attempt)
                    delay_s = delay_ms / 1000.0
                    print(f"[AsyncRetry] Attempt {attempt + 1}/{max_retries} failed, retrying in {delay_s}s")
                    
                    import asyncio
                    await asyncio.sleep(delay_s)
            
            if last_error:
                raise last_error
        
        return wrapper
    return decorator
