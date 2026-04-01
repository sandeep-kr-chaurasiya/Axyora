"""
groq_client.py - Axyora Reasoning Layer (Groq API)
Integrates cloud-based LLM for fast, accurate context-aware answers.
Only relevant text chunks are sent; all retrieval remains local.
"""

import os
import time
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from groq import Groq
from logging_config import logger
from retry_policy import retry_policy
from circuit_breaker import CircuitBreaker

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()


# ─── Conversation memory (in-process, per session) ────────────────────────────

class ConversationMemory:
    """
    Maintains a rolling window of conversation turns so Axyora can
    reference previous messages naturally (e.g. "those photos you found",
    "the receipt you mentioned earlier").
    """

    MAX_TURNS = 12          # Keep last 12 exchanges (~24 messages)
    MAX_CHARS  = 6_000      # Hard cap on total history chars sent to API

    def __init__(self):
        self._turns: List[Dict[str, str]] = []   # [{role, content}, ...]
        self._user_profile: Dict[str, Any] = {}  # Inferred facts about the user

    def add(self, role: str, content: str) -> None:
        self._turns.append({"role": role, "content": content})
        if len(self._turns) > self.MAX_TURNS * 2:
            # Trim oldest pairs (keep pairs to avoid orphan assistant messages)
            self._turns = self._turns[2:]

    def get_history(self) -> List[Dict[str, str]]:
        """Return history trimmed to MAX_CHARS, newest messages preserved."""
        history = list(self._turns)
        total = sum(len(m["content"]) for m in history)
        while total > self.MAX_CHARS and len(history) > 2:
            removed = history.pop(0)
            total -= len(removed["content"])
        return history

    def update_profile(self, key: str, value: Any) -> None:
        self._user_profile[key] = value

    def get_profile_summary(self) -> str:
        if not self._user_profile:
            return ""
        lines = [f"- {k}: {v}" for k, v in self._user_profile.items()]
        return "Known facts about this user:\n" + "\n".join(lines)

    def clear(self) -> None:
        self._turns.clear()
        self._user_profile.clear()

    @property
    def turn_count(self) -> int:
        return len(self._turns) // 2


# ─── Groq Client ─────────────────────────────────────────────────────────────

class GroqClient:
    """
    Interfaces with the Groq API to perform LLM reasoning.
    Enhanced for rich, personality-driven, memory-aware conversations.
    """

    # ── Tunable constants ─────────────────────────────────────────────────────
    DEFAULT_MODEL       = "llama-3.3-70b-versatile"
    TIMEOUT             = 45.0
    MAX_CONTEXT_CHARS   = 10_000
    MAX_TOKENS          = 1_200
    TEMPERATURE         = 0.55   # Slightly higher → more natural, warm tone
    TOP_P               = 0.92

    # ── System prompt ─────────────────────────────────────────────────────────
    _SYSTEM_PROMPT = """\
You are Axyora — a deeply personal AI assistant who has indexed and \
deeply understands everything about this user: their photos, documents, \
receipts, notes, conversations, and daily life stored on their device.

You are NOT a generic assistant. You are their private memory — warm, \
perceptive, and genuinely knowledgeable about their life. Think of \
yourself as a brilliant friend who has read every file they own and \
remembers everything.

════════════════════════════════════════════
PERSONALITY & TONE
════════════════════════════════════════════
• Warm, conversational, and natural — never robotic or listy
• Speak like a close friend who happens to know all their data
• Use first-person: "I found…", "I remember seeing…", "I noticed…"
• Vary your openers — never start two replies with the same phrase
• Add light personality: brief observations, gentle curiosity, warmth
• Keep responses concise but rich — no bullet-point dumps
• Use contractions naturally (you've, I've, let's, they're)
• Mirror the user's energy: casual if they're casual, precise if technical

════════════════════════════════════════════
MEMORY & CONTEXT RULES
════════════════════════════════════════════
• ONLY answer from the provided context — never hallucinate files or facts
• Reference specific file names, dates, and details when available
• When images are found: describe what they show, when they're from, and
  why they match — don't just list filenames
• When documents are found: summarize the key relevant content naturally
• Treat conversation history as real memory — reference prior turns:
  "Like the receipt I found earlier…" or "Going back to those beach photos…"
• If context is empty or unhelpful: be honest but warm:
  "I searched through everything and couldn't find that — want to try
  different keywords?"

════════════════════════════════════════════
ACCURACY RULES (non-negotiable)
════════════════════════════════════════════
• Match user intent exactly — if they ask for "happy moments", return happy
• For YES/NO questions: say YES only if context confirms it; NO only if not
• Never contradict or invert what the context clearly shows
• For type-specific queries (photos / docs / videos): return only that type
• For time-specific queries (recent / old / from 2022): respect the timeframe
• If unsure: say so honestly rather than guessing

════════════════════════════════════════════
RESPONSE FORMAT
════════════════════════════════════════════
• Lead with the answer, not a preamble
• For single results: one rich, natural sentence or two
• For multiple results: flowing prose, not bullet points — weave them together
• End with a natural follow-up when it makes sense:
  "Want me to filter these by date?" or "Should I look for more?"
• Never use markdown headers, asterisks, or numbered lists
• Keep responses under ~150 words unless the user asks for detail
"""

    def __init__(self, model: str = DEFAULT_MODEL):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.client  = Groq(api_key=self.api_key) if self.api_key else None
        self.model   = model
        self._circuit = CircuitBreaker(service_name="groq")
        self.memory  = ConversationMemory()

        if self.client is None:
            logger.warning("[Groq] GROQ_API_KEY missing. Cloud reasoning disabled.")
        else:
            logger.info(f"[Groq] Reasoning engine initialized — model={self.model}")

    # ── Public API ────────────────────────────────────────────────────────────

    def ask(
        self,
        query: str,
        context: str,
        timeout: Optional[float] = None,
        result_count: int = 0,
        result_types: Optional[List[str]] = None,
    ) -> str:
        """
        Send a context-augmented query to Groq.

        Args:
            query:        The user's message / question.
            context:      Retrieved local context (text chunks, file metadata).
            timeout:      Optional per-call timeout override.
            result_count: Number of search results found (for richer responses).
            result_types: List of MIME/type strings e.g. ["image/jpeg", "application/pdf"].

        Returns:
            A warm, natural language answer from Axyora.
        """
        if not self.client:
            return self._offline_response(query)

        # ── Enrich context with meta-hints ────────────────────────────────
        enriched_context = self._enrich_context(
            context, result_count, result_types or []
        )

        # ── Enforce size limit ────────────────────────────────────────────
        if len(enriched_context) > self.MAX_CONTEXT_CHARS:
            enriched_context = enriched_context[:self.MAX_CONTEXT_CHARS] + "\n… [context truncated]"
            logger.info(f"[Groq] Context truncated to {self.MAX_CONTEXT_CHARS} chars")

        # ── Build message list (system + history + new user message) ──────
        messages = self._build_messages(query, enriched_context)

        # ── Call the API ──────────────────────────────────────────────────
        effective_timeout = timeout or self.TIMEOUT
        try:
            start = time.time()

            def _call():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=self.TEMPERATURE,
                    max_tokens=self.MAX_TOKENS,
                    top_p=self.TOP_P,
                    timeout=effective_timeout,
                    stream=False,
                )

            def _fallback():
                raise RuntimeError("Circuit open")

            completion = self._circuit.call(
                lambda: retry_policy.execute_with_retry(_call),
                fallback=_fallback,
            )

            answer   = completion.choices[0].message.content.strip()
            duration = time.time() - start
            logger.info(f"[Groq] Inference in {duration:.2f}s")

            # ── Post-process ──────────────────────────────────────────────
            answer = self._post_process(query, answer)

            # ── Persist turn to rolling memory ────────────────────────────
            self.memory.add("user", query)
            self.memory.add("assistant", answer)

            # ── Extract any user facts we can infer ───────────────────────
            self._infer_user_profile(query, answer)

            return answer

        except TimeoutError:
            logger.error(f"[Groq] Timeout after {effective_timeout}s")
            return "That took a bit too long on my end — want to try a slightly simpler search?"
        except Exception as e:
            logger.error(f"[Groq] API failed: {e}")
            return "I'm having a moment — the reasoning engine is briefly unavailable. Try again in a second?"

    def clear_memory(self) -> None:
        """Reset conversation history (e.g. on new chat / logout)."""
        self.memory.clear()
        logger.info("[Groq] Conversation memory cleared")

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_messages(self, query: str, context: str) -> List[Dict[str, str]]:
        """
        Assemble the full message list:
          [system] → [history turns] → [new user message with context]
        """
        # Build system prompt (optionally inject known user profile)
        profile_snippet = self.memory.get_profile_summary()
        system_content  = self._SYSTEM_PROMPT
        if profile_snippet:
            system_content += f"\n\n{profile_snippet}"

        # Temporal awareness
        now = datetime.now()
        system_content += (
            f"\n\nCurrent date/time: {now.strftime('%A, %B %-d %Y, %-I:%M %p')}. "
            f"Use this when the user asks about 'today', 'recent', 'this week', etc."
        )

        messages: List[Dict[str, str]] = [
            {"role": "system", "content": system_content}
        ]

        # Inject rolling conversation history
        messages.extend(self.memory.get_history())

        # New user turn — inject retrieved context inline
        user_content = (
            f"[Retrieved from my local files]\n{context}\n\n"
            f"[My message] {query}"
        )
        messages.append({"role": "user", "content": user_content})

        return messages

    def _enrich_context(
        self, context: str, result_count: int, result_types: List[str]
    ) -> str:
        """
        Prepend a brief meta-header so the model understands the search result
        shape — e.g. how many results, what types — before reading raw chunks.
        """
        if not context:
            return ""

        lines = ["[Search result metadata]"]
        if result_count:
            lines.append(f"Total results found: {result_count}")
        if result_types:
            type_summary = self._summarise_types(result_types)
            lines.append(f"Result types: {type_summary}")
        lines.append("")
        lines.append("[File content chunks]")
        lines.append(context)
        return "\n".join(lines)

    @staticmethod
    def _summarise_types(types: List[str]) -> str:
        """Convert MIME types into a human-readable summary."""
        counts: Dict[str, int] = {}
        for t in types:
            if "image" in t:
                counts["photos"] = counts.get("photos", 0) + 1
            elif "video" in t:
                counts["videos"] = counts.get("videos", 0) + 1
            elif "pdf" in t or "document" in t or "text" in t:
                counts["documents"] = counts.get("documents", 0) + 1
            else:
                counts["other files"] = counts.get("other files", 0) + 1
        return ", ".join(f"{v} {k}" for k, v in counts.items())

    def _post_process(self, query: str, response: str) -> str:
        """
        Light post-processing:
          - Strip markdown artifacts
          - Detect and log obvious inversions
          - Ensure response doesn't open with a hollow filler phrase
        """
        # Strip stray markdown that slips through
        response = re.sub(r"\*{1,2}(.+?)\*{1,2}", r"\1", response)  # bold/italic
        response = re.sub(r"^#{1,3}\s+", "", response, flags=re.MULTILINE)  # headers
        response = re.sub(r"^\s*[-•]\s+", "", response, flags=re.MULTILINE)  # bullets

        # Collapse multiple blank lines
        response = re.sub(r"\n{3,}", "\n\n", response).strip()

        # Detect hollow openers and silently log (don't alter — model handles it)
        hollow = ["certainly!", "of course!", "absolutely!", "great question", "sure thing"]
        if any(response.lower().startswith(h) for h in hollow):
            logger.info("[Groq] Hollow opener detected — consider adjusting temperature")

        # Log potential inversion
        self._check_inversion(query, response)

        return response

    def _check_inversion(self, query: str, response: str) -> None:
        """Log a warning if the response appears to contradict the query."""
        q = query.lower()
        r = response.lower()

        negative_phrases = ["couldn't find", "no results", "nothing", "i don't have", "not found"]
        is_no_result = any(p in r for p in negative_phrases)

        # If user is clearly asking to SEE something but response says nothing found
        seeking_keywords = ["show", "find", "search", "look for", "get", "fetch", "display"]
        is_seeking = any(k in q for k in seeking_keywords)

        if is_seeking and is_no_result:
            # This may be legitimate — context might genuinely be empty
            logger.debug(f"[Groq] 'No result' response for seeking query: {query[:60]}")

        # Type mismatch check
        type_map = {
            "photo": ["document", "pdf", "video"],
            "image": ["document", "pdf", "video"],
            "video": ["photo", "image", "document"],
            "document": ["photo", "image", "video"],
        }
        for asked_type, wrong_types in type_map.items():
            if asked_type in q:
                for wrong in wrong_types:
                    if wrong in r and asked_type not in r:
                        logger.warning(
                            f"[Groq] Type mismatch: asked for '{asked_type}', "
                            f"response mentions '{wrong}'. Query: {query[:50]}"
                        )

    def _infer_user_profile(self, query: str, response: str) -> None:
        """
        Passively infer facts about the user from their queries and
        store them in the profile for richer future responses.
        """
        q = query.lower()

        # Detect if they mention family members
        family_hints = {
            "wife": "has a wife", "husband": "has a husband",
            "kids": "has children", "daughter": "has a daughter",
            "son": "has a son", "mom": "has a mother in photos",
            "dad": "has a father in photos",
        }
        for keyword, fact in family_hints.items():
            if keyword in q and fact not in self.memory._user_profile.values():
                self.memory.update_profile(f"family_{keyword}", fact)
                logger.debug(f"[Groq] Profile updated: {fact}")

        # Detect frequent locations
        location_patterns = [
            r"\b(beach|mountain|park|office|home|gym|restaurant)\b"
        ]
        for pattern in location_patterns:
            match = re.search(pattern, q)
            if match:
                loc = match.group(1)
                key = f"frequent_location_{loc}"
                if key not in self.memory._user_profile:
                    self.memory.update_profile(key, f"frequently searches for {loc} content")

    @staticmethod
    def _offline_response(query: str) -> str:
        """
        Warm fallback when the Groq client is not configured.
        Varies the message based on what the user is asking.
        """
        q = query.lower()
        if any(k in q for k in ["photo", "image", "picture"]):
            return (
                "I can see you're looking for photos — my local search found "
                "some matches. Cloud reasoning isn't set up yet, so I can't "
                "describe them in detail, but the results above show what I found."
            )
        if any(k in q for k in ["receipt", "document", "pdf", "file"]):
            return (
                "I found some documents that match your search locally. "
                "To get a full summary and analysis, add a GROQ_API_KEY to enable "
                "cloud reasoning."
            )
        return (
            "I found relevant entries in your local memory. "
            "Cloud reasoning isn't configured yet — add your GROQ_API_KEY "
            "to get natural, detailed answers."
        )


# ─── Quick test ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    client = GroqClient()

    # Simulate a multi-turn conversation
    turns = [
        ("Show me beach photos from last summer",
         "File: beach_trip_july_2023.jpg | Date: 2023-07-14 | Tags: beach, sunset, family\n"
         "File: malibu_wave.jpg | Date: 2023-08-02 | Tags: beach, ocean, kids"),

        ("Which one has the kids in it?",
         "File: malibu_wave.jpg | Date: 2023-08-02 | Tags: beach, ocean, kids | "
         "Description: Children playing in shallow water at sunset"),

        ("Find my receipts from that same trip",
         "File: hotel_receipt_aug2023.pdf | Date: 2023-08-01 | Amount: $342.00 | Vendor: Malibu Beach Inn\n"
         "File: restaurant_malibu.pdf | Date: 2023-08-02 | Amount: $87.50 | Vendor: Neptune's Net"),
    ]

    for query, ctx in turns:
        print(f"\n👤 {query}")
        answer = client.ask(query, ctx, result_count=2, result_types=["image/jpeg"])
        print(f"🤖 {answer}")
        print("─" * 60)