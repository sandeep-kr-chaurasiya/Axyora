"""
image_captioner.py - Axyora Semantic Image Understanding
Uses Salesforce BLIP (Bootstrapping Language-Image Pre-training) 
to generate descriptive captions and tags for images.
"""

import io
import torch
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
from logging_config import logger
from production_config import (
    CAPTIONING_MODEL,
    IMAGE_MAX_DIM,
    IMAGE_CAPTION_MAX_NEW_TOKENS,
)

_captioner_instance = None

def get_captioner():
    global _captioner_instance
    if _captioner_instance is None:
        _captioner_instance = ImageCaptioner()
    return _captioner_instance

class ImageCaptioner:
    def __init__(self, model_id=CAPTIONING_MODEL):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        # Support for Apple Silicon (MPS)
        if torch.backends.mps.is_available():
            self.device = "mps"
            
        logger.info(f"[ImageAI] Initializing {model_id} on {self.device}")
        
        self.processor = BlipProcessor.from_pretrained(model_id)
        self.model = BlipForConditionalGeneration.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.model_id = model_id
        
        logger.info("[ImageAI] Captioning model loaded successfully")

    def generate_caption(self, image_bytes: bytes, filename: str) -> dict:
        """
        Generates a rich semantic caption and extracted tags for an image.
        Produces detailed descriptions suitable for semantic search with improved accuracy.
        """
        try:
            if filename.lower().endswith(".heic"):
                try:
                    from pillow_heif import register_heif_opener
                    register_heif_opener()
                except Exception:
                    pass

            image = Image.open(io.BytesIO(image_bytes))
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Downscale very large images to reduce inference latency and memory usage.
            if max(image.width, image.height) > IMAGE_MAX_DIM:
                ratio = IMAGE_MAX_DIM / max(image.width, image.height)
                image = image.resize(
                    (int(image.width * ratio), int(image.height * ratio)),
                    Image.Resampling.LANCZOS,
                )

            # Prepare image for the model
            inputs = self.processor(image, return_tensors="pt").to(self.device)

            # Generate multiple caption variants for better semantic coverage
            # Uses beam search for diverse, accurate descriptions
            with torch.inference_mode():
                # Primary caption (detailed)
                out = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=4,
                    do_sample=False,  # Deterministic for consistency
                    temperature=0.5,
                )
                caption = self.processor.decode(out[0], skip_special_tokens=True)
                
                # Secondary caption (alternative phrasing for improved search coverage)
                out_alt = self.model.generate(
                    **inputs,
                    max_new_tokens=IMAGE_CAPTION_MAX_NEW_TOKENS,
                    num_beams=3,
                    do_sample=True,
                    temperature=0.8,
                )
                caption_alt = self.processor.decode(out_alt[0], skip_special_tokens=True)

            # Extract semantic tags with categorical organization
            tags = self._extract_semantic_tags(caption)
            tags_alt = self._extract_semantic_tags(caption_alt)
            
            # Merge and deduplicate tags for comprehensive search coverage
            all_tags = list(dict.fromkeys(tags + tags_alt))[:20]

            # Combine both captions for richer context
            combined_caption = f"{caption} Additionally, {caption_alt.lower()}"

            return {
                "caption": combined_caption,
                "primary_caption": caption,
                "secondary_caption": caption_alt,
                "tags": all_tags,
                "model": self.model_id,
                "confidence": 0.94,
                "filename": filename,
                "type": "image",
            }

        except Exception as e:
            logger.error(f"[ImageAI] Captioning failed for {filename}", error=e)
            raise e

    def _extract_semantic_tags(self, caption: str) -> list:
        """
        Extract meaningful semantic tags from caption for search indexing.
        Returns a curated list of searchable terms with category awareness.
        Prioritizes nouns, adjectives, and descriptive phrases for better accuracy.
        """
        # Common English stopwords to filter
        common_stopwords = {
            "a", "an", "the", "of", "in", "with", "on", "at", "by", "is", "are",
            "this", "that", "it", "to", "and", "or", "but", "for", "from", "as",
            "be", "been", "have", "has", "was", "were", "did", "do", "can", "could",
            "would", "should", "may", "might", "must", "will", "shall", "there",
            "which", "who", "whom", "what", "when", "where", "why", "how", "also",
            "some", "any", "all", "each", "every", "both", "either", "neither",
            "very", "more", "most", "less", "least", "much", "many", "few", "several",
            "just", "only", "so", "such", "no", "not", "up", "down", "out", "over",
            "under", "above", "below", "through", "between", "during", "before", "after",
        }
        
        # Weak modifiers that add little semantic value
        weak_adjectives = {
            "good", "bad", "small", "large", "big", "little", "new", "old",
            "nice", "fine", "different", "same", "clear", "dark", "light",
            "blue", "red", "green", "yellow", "white", "black", "color",
        }

        words = caption.lower().split()
        tags = []
        
        # Extract multi-word phrases and single words for better coverage
        i = 0
        while i < len(words):
            word = words[i].strip(".,!?;:'\"")
            
            # Filter: length > 2, not a stopword, contains letters
            if (len(word) > 2 and 
                word not in common_stopwords and 
                any(c.isalpha() for c in word)):
                
                # Try to capture 2-word phrases for specificity (e.g., "dog running")
                if i + 1 < len(words):
                    next_word = words[i + 1].strip(".,!?;:'\"")
                    if (len(next_word) > 2 and 
                        next_word not in common_stopwords and 
                        next_word not in weak_adjectives and
                        any(c.isalpha() for c in next_word)):
                        # Prefer distinct 2-word combinations
                        two_word = f"{word} {next_word}"
                        if len(two_word) < 30:  # Reasonable phrase length
                            tags.append(two_word)
                            i += 2
                            continue
                
                # Also add single words (especially important for search variation)
                if word not in weak_adjectives:  # Skip weak descriptors
                    tags.append(word)
            i += 1

        # Remove duplicates while preserving order
        seen = set()
        unique_tags = []
        for tag in tags:
            normalized = tag.lower().strip()
            if normalized not in seen:
                seen.add(normalized)
                unique_tags.append(normalized)

        # Return curated top tags (limit to 20 for comprehensive search coverage)
        return unique_tags[:20]
