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
        self.timeout = 20.0

        if self.client is None:
            logger.warning("[Groq] GROQ_API_KEY missing. Cloud reasoning disabled; using local fallback answers.")
        else:
            logger.info(f"[Groq] Reasoning engine initialized with {self.model}")

    def ask(self, query: str, context: str) -> str:
        """
        Send a context-augmented query to Groq.
        Returns the synthesized answer.
        """
        if not context:
            return "No relevant context found to answer your question."

        if self.client is None:
            return "Cloud reasoning is not configured on this device. I found relevant local memory entries in your indexed files."

        try:
            start_time = time.time()
            
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Axyora, a local AI memory assistant. "
                            "You answer questions using the provided file context, including file names and text. "
                            "If a file name matches the user's intent (e.g., 'leaf.jpg' for 'leaf'), identify it. "
                            "If the answer isn't in the context, politely say you can't find it in their memory. "
                            "Be concise, cite source file names, and prioritize accurate file identification."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Context from my local files:\n\n{context}\n\nQuestion: {query}"
                    }
                ],
                temperature=0.1,
                max_tokens=1024,
                top_p=1,
                stream=False
            )

            answer = completion.choices[0].message.content.strip()
            duration = time.time() - start_time
            logger.info(f"[Groq] Inference completed in {duration:.2f}s")
            return answer

        except Exception as e:
            logger.error(f"[Groq] API request failed", error=e)
            return f"Error: The reasoning engine is currently unavailable. ({str(e)[:100]})"

if __name__ == "__main__":
    # Test
    try:
        g = GroqClient()
        print(g.ask("What is Axyora?", "Axyora is a local AI memory engine."))
    except Exception as e:
        print(e)
