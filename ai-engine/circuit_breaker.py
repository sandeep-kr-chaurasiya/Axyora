"""
Circuit breaker for Ollama graceful degradation
Prevents cascading failures when Ollama is unavailable
"""

import time
from enum import Enum
from typing import Callable, TypeVar, Optional
from production_config import (
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    CIRCUIT_BREAKER_TIMEOUT,
)
from logging_config import logger

T = TypeVar("T")

class CircuitBreakerState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"          # Normal operation
    OPEN = "open"              # Failing, reject requests
    HALF_OPEN = "half_open"    # Testing if recovered


class CircuitBreaker:
    """Circuit breaker for Ollama service"""
    
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
                logger.circuit_breaker_event(
                    self.service_name,
                    "half_open",
                    f"Testing recovery after {self.timeout}s",
                )
            else:
                # Still open, use fallback
                if fallback:
                    logger.warning(
                        f"Circuit breaker OPEN for {self.service_name}, using fallback",
                    )
                    return fallback(*args, **kwargs)
                raise RuntimeError(f"Circuit breaker OPEN: {self.service_name} unavailable")
        
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            
            if self.state == CircuitBreakerState.HALF_OPEN:
                # Failed during recovery test, go back to OPEN
                self.state = CircuitBreakerState.OPEN
                self.last_failure_time = time.time()
                logger.circuit_breaker_event(
                    self.service_name,
                    "open",
                    f"Recovery test failed: {str(e)[:100]}",
                )
            
            # Try fallback if available
            if fallback:
                logger.warning(
                    f"Function call failed for {self.service_name}, using fallback",
                    error=e,
                )
                return fallback(*args, **kwargs)
            
            raise
    
    def _record_success(self):
        """Record successful call"""
        self.failure_count = 0
        
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitBreakerState.CLOSED
                self.success_count = 0
                logger.circuit_breaker_event(
                    self.service_name,
                    "closed",
                    f"Recovered after {self.success_threshold} successes",
                )
    
    def _record_failure(self):
        """Record failed call"""
        self.failure_count += 1
        self.last_failure_time = time.time()
        self.success_count = 0
        
        if self.state == CircuitBreakerState.CLOSED:
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitBreakerState.OPEN
                logger.circuit_breaker_event(
                    self.service_name,
                    "open",
                    f"Threshold reached: {self.failure_count}/{self.failure_threshold} failures",
                )
    
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


# Global circuit breaker for Ollama
ollama_circuit_breaker = CircuitBreaker(
    service_name="ollama",
    failure_threshold=CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    success_threshold=CIRCUIT_BREAKER_SUCCESS_THRESHOLD,
    timeout=CIRCUIT_BREAKER_TIMEOUT,
)
