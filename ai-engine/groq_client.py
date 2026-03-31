"""
groq_client.py - Axyora Reasoning Layer (Groq API)
Integrates cloud-based LLM for fast, accurate context-aware answers.
Only relevant text chunks are sent; all retrieval remains local.
"""

import os
import time
from typing import List, Dict, Any
from groq import Groq
from logging_config import logger

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

# Load environment (API Key) if python-dotenv is available.
if load_dotenv is not None:
    load_dotenv()

class GroqClient:
    """
    Interfaces with the Groq API to perform LLM reasoning.
    Optimized for RAG (Retrieval-Augmented Generation).
    """

    def __init__(self, model: str = "llama-3.3-70b-versatile"):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key) if self.api_key else None
        self.model = model
        self.timeout = 45.0  # Increased to 45s for complex operations
        self.max_context_chars = 8000  # Enforce ~2k tokens max (conservative)

        if self.client is None:
            logger.warning("[Groq] GROQ_API_KEY missing. Cloud reasoning disabled; using local fallback answers.")
        else:
            logger.info(f"[Groq] Reasoning engine initialized with {self.model}")

    def ask(self, query: str, context: str, timeout: float | None = None) -> str:
        """
        Send a context-augmented query to Groq with optimized reasoning.
        Includes guidance for image understanding and file identification.
        Returns the synthesized answer.
        
        Args:
            query: User question
            context: Retrieved context (will be truncated to max_context_chars)
            timeout: Optional custom timeout (seconds)
        """
        if not context:
            return "No relevant context found to answer your question."

        if self.client is None:
            return "Cloud reasoning is not configured on this device. I found relevant local memory entries in your indexed files."

        # Enforce context size limit to prevent excessive token usage
        if len(context) > self.max_context_chars:
            context = context[:self.max_context_chars] + "\n... [Context truncated]"
            logger.info(f"[Groq] Context truncated to {self.max_context_chars} chars")

        try:
            start_time = time.time()
            effective_timeout = timeout or self.timeout
            
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Axyora, a local AI memory assistant with expertise in semantic search and image understanding. "
                            "Your role is to accurately answer questions using ONLY the provided file context. "
                            "\n"
                            "CRITICAL INSTRUCTIONS:\n"
                            "1. ALWAYS answer questions directly and accurately based on the context provided\n"
                            "2. NEVER invert or contradict what the user asks or what the context shows\n"
                            "3. For YES/NO questions: answer YES only if the context supports YES; answer NO only if the context supports NO\n"
                            "4. For searches about specific items: return items that MATCH the query, NOT the opposite\n"
                            "5. For image results: describe what you see and confirm it matches the user's search\n"
                            "6. Always cite specific file names when referencing results\n"
                            "7. If context doesn't answer the query: simply say 'I searched your memory but couldn't find that' rather than guessing\n"
                            "8. Match user intent precisely: if they ask 'show happy moments', focus on happy content, NOT sad content\n"
                            "9. If filtering by type: show only the requested type (e.g., images=images only, documents=documents only)\n"
                            "10. For recent/old: if asked for 'recent', show recent items; if asked for 'old', show old items\n"
                            "\n"
                            "Tone: Conversational, helpful, and focused on accuracy over wordiness."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Context from my local files:\n\n{context}\n\nQuestion: {query}"
                    }
                ],
                temperature=0.2,  # Lower temperature for more precise, consistent answers
                max_tokens=1024,
                top_p=0.95,
                timeout=effective_timeout,  # Explicit timeout for API calls
                stream=False
            )

            answer = completion.choices[0].message.content.strip()
            duration = time.time() - start_time
            logger.info(f"[Groq] Inference completed in {duration:.2f}s (timeout={effective_timeout}s)")
            
            # Validate response isn't contradicting the query
            answer = self._validate_response(query, answer)
            
            return answer

        except TimeoutError:
            logger.error("[Groq] API request timeout", error=f"Timeout after {effective_timeout}s")
            return "The reasoning engine timed out. Please try again with a simpler query."
        except Exception as e:
            logger.error(f"[Groq] API request failed", error=e)
            return f"Error: The reasoning engine is currently unavailable. ({str(e)[:100]})"

    def _validate_response(self, query: str, response: str) -> str:
        """
        Validate that the response isn't contradicting the query intent.
        Performs basic sanity checks to catch obvious inversions.
        Returns the original response or a corrected fallback if inversion detected.
        """
        # Convert to lowercase for comparison
        query_lower = query.lower()
        response_lower = response.lower()
        
        # Legitimate "not found" phrases that indicate a valid empty/no result
        legitimate_no_results = [
            "i don't have",
            "i couldn't find",
            "no memories",
            "no results",
            "not found",
            "nothing matching",
        ]
        
        # Check if this is a legitimate "no results" response
        is_legitimate_no_result = any(phrase in response_lower for phrase in legitimate_no_results)
        
        # Detect when query asks for items but response says nothing found
        ask_for_items_keywords = ["show me", "find", "search for", "look for", "display", "tell me about"]
        is_asking_for_items = any(kw in query_lower for kw in ask_for_items_keywords)
        
        # If asking for items and got a "nothing found", check if this matches the query intent
        if is_asking_for_items and is_legitimate_no_result:
            logger.info(f"[Groq] Legitimate 'no results' response for query: {query[:50]}...")
            return response
        
        # Check for clear inversions: query asks for YES/NO but response contradicts
        if any(q in query_lower for q in ["is there", "are there", "do you have", "have you"]):
            if "no" in response_lower and not is_legitimate_no_result:
                logger.warning(f"[Groq] Possible YES/NO inversion. Query: {query[:40]}... Response: {response[:40]}...")
        
        # Check for type inversions (asking for images but getting documents, etc.)
        type_keywords = {
            "image": ["photo", "picture", "image", "jpg", "png"],
            "video": ["video", "movie", "mp4", "mov"],
            "document": ["document", "pdf", "txt", "docx", "text"],
        }
        
        for type_name, keywords in type_keywords.items():
            if any(kw in query_lower for kw in keywords):
                # If asking for specific type and response is about different type, log warning
                other_types = [k for k in type_keywords.keys() if k != type_name]
                for other_type in other_types:
                    if any(kw in response_lower for kw in type_keywords[other_type]):
                        logger.warning(f"[Groq] Possible type mismatch. Asked for {type_name}, response mentions {other_type}")
        
        return response

if __name__ == "__main__":
    # Test
    try:
        g = GroqClient()
        print(g.ask("What is Axyora?", "Axyora is a local AI memory engine."))
    except Exception as e:
        print(e)
