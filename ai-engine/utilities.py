"""
utilities.py - Consolidated Utility Layer
Combines: CircuitBreaker, RetryPolicy, and other utilities
"""

import time
from enum import Enum
from typing import Callable, TypeVar, Optional
from production_config import (
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    CIRCUIT_BREAKER_TIMEOUT,
    MAX_RETRIES,
    INITIAL_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    EXPONENTIAL_BASE,
)

T = TypeVar("T")

# ============================================================================
# CIRCUIT BREAKER
# ============================================================================

class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"          # Normal operation
    OPEN = "open"              # Failing, reject requests
    HALF_OPEN = "half_open"    # Testing if recovered


class CircuitBreaker:
    """Circuit breaker for service resilience"""
    
    def __init__(
        self,
        service_name: str,
        failure_threshold: int = CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        success_threshold: int = CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
        timeout: int = CIRCUIT_BREAKER_TIMEOUT,
    ):
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.timeout = timeout
        
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[float] = None
    
    def call(
        self,
        func: Callable[..., T],
        *args,
        fallback: Optional[Callable[..., T]] = None,
        **kwargs,
    ) -> T:
        """Execute function with circuit breaker protection"""
        if self.state == CircuitBreakerState.OPEN:
            if self._should_attempt_reset():
                self.state = CircuitBreakerState.HALF_OPEN
                self.success_count = 0
            else:
                if fallback:
                    try:
                        return fallback(*args, **kwargs)
                    except Exception:
                        pass
                raise RuntimeError(f"Circuit breaker OPEN: {self.service_name} unavailable")
        
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.OPEN
                self.last_failure_time = time.time()
            
            if fallback:
                try:
                    return fallback(*args, **kwargs)
                except Exception:
                    pass
            raise
    
    def _record_success(self):
        """Record successful call"""
        self.failure_count = 0
        
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitBreakerState.CLOSED
                self.success_count = 0
    
    def _record_failure(self):
        """Record failed call"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.success_count = 0
        
        if self.state == CircuitBreakerState.CLOSED:
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitBreakerState.OPEN
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt recovery"""
        if not self.last_failure_time:
            return True
        elapsed = time.time() - self.last_failure_time
        return elapsed >= self.timeout
    
    def status(self) -> dict:
        """Get circuit breaker status"""
        return {
            "service": self.service_name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time,
        }


# ============================================================================
# RETRY POLICY
# ============================================================================

class RetryPolicy:
    """Exponential backoff retry utilities"""
    
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
        """Calculate delay in milliseconds for given attempt (0-indexed) with jitter"""
        import random

        if attempt >= self.max_retries:
            return self.max_delay_ms

        base_delay = int(self.initial_delay_ms * (self.exponential_base ** attempt))
        jitter = random.randint(0, int(base_delay * 0.2))
        delay_ms = base_delay + jitter

        return min(delay_ms, self.max_delay_ms)
    
    def should_retry(self, error: Exception) -> bool:
        """Determine if error is retriable"""
        retriable_types = (
            TimeoutError,
            ConnectionError,
            OSError,
        )
        
        non_retriable_types = (
            ValueError,
            TypeError,
            FileNotFoundError,
        )
        
        if isinstance(error, non_retriable_types):
            return False
        
        if isinstance(error, retriable_types):
            return True
        
        error_str = str(error).lower()
        non_retriable_keywords = ["too large", "unsupported", "not found", "invalid", "unauthorized", "forbidden"]
        for keyword in non_retriable_keywords:
            if keyword in error_str:
                return False
        
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
                    raise
                
                if attempt == self.max_retries - 1:
                    raise
                
                delay_ms = self.calculate_delay_ms(attempt)
                delay_s = delay_ms / 1000.0

                # Lightweight debug log
                print(f"[RetryPolicy] Attempt {attempt+1} failed. Retrying in {delay_s:.2f}s...")

                time.sleep(delay_s)
        
        if last_error:
            raise last_error
        raise RuntimeError("Retry exhausted with unknown error")


# ============================================================================
# TIMEOUT UTILITY
# ============================================================================

def run_with_timeout(func: Callable[..., T], timeout_sec: float, *args, **kwargs) -> T:
    """Run a blocking function with timeout protection"""
    import threading

    result = {"value": None, "error": None}

    def target():
        try:
            result["value"] = func(*args, **kwargs)
        except Exception as e:
            result["error"] = e

    thread = threading.Thread(target=target)
    thread.daemon = True
    thread.start()
    thread.join(timeout_sec)

    if thread.is_alive():
        raise TimeoutError("Function execution timed out")

    if result["error"]:
        raise result["error"]

    return result["value"]

# ============================================================================
# Global instances
# ============================================================================

# Global retry policy instance
retry_policy = RetryPolicy()

# Global circuit breaker for Groq
groq_circuit_breaker = CircuitBreaker(
    service_name="groq",
    failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    success_threshold=CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    timeout=CIRCUIT_BREAKER_TIMEOUT,
)


# ============================================================================
# Convenience functions
# ============================================================================

def with_retry(func: Callable[..., T], *args, **kwargs) -> T:
    """Convenience function for retry execution"""
    return retry_policy.execute_with_retry(func, *args, **kwargs)


def async_retry_wrapper(max_retries: int = MAX_RETRIES):
    """Decorator for async functions with retry"""
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

                    # Lightweight debug log
                    print(f"[AsyncRetry] Attempt {attempt+1} failed. Retrying in {delay_s:.2f}s...")

                    import asyncio
                    await asyncio.sleep(delay_s)
            
            if last_error:
                raise last_error
        
        return wrapper
    return decorator